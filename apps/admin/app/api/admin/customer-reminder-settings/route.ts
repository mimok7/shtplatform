import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

type ReminderServiceType = 'cruise' | 'airport' | 'rentcar' | 'hotel' | 'tour' | 'ticket' | 'package';

type ReminderDateBasis =
  | 'checkin'
  | 'pickup'
  | 'dropoff'
  | 'rentcar_pickup'
  | 'rentcar_return'
  | 'usage'
  | 'start';

type CustomerReminderRule = {
  id: string;
  serviceType: ReminderServiceType;
  dateBasis: ReminderDateBasis;
  label: string;
  enabled: boolean;
  daysBefore: number;
  title: string;
  body: string;
};

type CustomerReminderSettings = {
  updatedAt: string;
  updatedBy: string;
  rules: CustomerReminderRule[];
};
const TABLE_NAME = 'customer_reminder_rules';

async function authenticateAdmin(req: NextRequest) {
  if (!serviceSupabase) {
    return { ok: false as const, error: '서버 설정 오류', status: 500 };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false as const, error: '인증 필요', status: 401 };
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return { ok: false as const, error: '인증 실패', status: 401 };
  }

  const { data: me } = await serviceSupabase
    .from('users')
    .select('id, role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!me || me.role !== 'admin') {
    return { ok: false as const, error: '권한 없음', status: 403 };
  }

  return { ok: true as const };
}

function sanitizeSettings(input: CustomerReminderSettings): CustomerReminderSettings {
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const defaultDateBasisByService: Record<ReminderServiceType, ReminderDateBasis> = {
    cruise: 'checkin',
    airport: 'pickup',
    rentcar: 'rentcar_pickup',
    hotel: 'checkin',
    tour: 'usage',
    ticket: 'usage',
    package: 'start',
  };

  const allowedDateBasisByService: Record<ReminderServiceType, ReminderDateBasis[]> = {
    cruise: ['checkin'],
    airport: ['pickup', 'dropoff'],
    rentcar: ['rentcar_pickup', 'rentcar_return'],
    hotel: ['checkin'],
    tour: ['usage'],
    ticket: ['usage'],
    package: ['start'],
  };

  return {
    updatedAt: input.updatedAt || new Date().toISOString(),
    updatedBy: input.updatedBy || 'admin',
    rules: rules.map((rule) => {
      const serviceType = rule.serviceType;
      const allowedBasis = allowedDateBasisByService[serviceType] || ['usage'];
      const dateBasis = allowedBasis.includes(rule.dateBasis)
        ? rule.dateBasis
        : defaultDateBasisByService[serviceType] || allowedBasis[0] || 'usage';

      return {
        id: String(rule.id || '').trim(),
        serviceType,
        dateBasis,
        label: String(rule.label || '').trim(),
        enabled: Boolean(rule.enabled),
        daysBefore: Math.max(0, Math.min(30, Number(rule.daysBefore || 0))),
        title: String(rule.title || '').trim(),
        body: String(rule.body || '').trim(),
      };
    }),
  };
}

function toSettingsFromRows(rows: any[]): CustomerReminderSettings {
  return {
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
    rules: (rows || []).map((row) => ({
      id: String(row.id || ''),
      serviceType: row.service_type as ReminderServiceType,
      dateBasis: row.date_basis as ReminderDateBasis,
      label: String(row.label || ''),
      enabled: Boolean(row.enabled),
      daysBefore: Number(row.days_before || 0),
      title: String(row.title || ''),
      body: String(row.body || ''),
    })),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data, error } = await serviceSupabase
      .from(TABLE_NAME)
      .select('id, service_type, date_basis, label, enabled, days_before, title, body, sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: `고객 사전알림 설정 조회 실패: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json(toSettingsFromRows(data || []));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '고객 사전알림 설정 조회 실패' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => null)) as CustomerReminderSettings | null;
    if (!body || !Array.isArray(body.rules)) {
      return NextResponse.json({ error: '유효하지 않은 요청 데이터' }, { status: 400 });
    }

    const sanitized = sanitizeSettings(body);
    const updatedBy = String(sanitized.updatedBy || '').trim();
    const updatedByValue = isUuid(updatedBy) ? updatedBy : null;
    const nowIso = new Date().toISOString();

    const { data: existingRows, error: existingError } = await serviceSupabase
      .from(TABLE_NAME)
      .select('id');
    if (existingError) {
      return NextResponse.json({ error: `기존 설정 조회 실패: ${existingError.message}` }, { status: 500 });
    }

    const upsertRows = sanitized.rules.map((rule, index) => ({
      id: rule.id,
      service_type: rule.serviceType,
      date_basis: rule.dateBasis,
      label: rule.label,
      enabled: rule.enabled,
      days_before: rule.daysBefore,
      title: rule.title,
      body: rule.body,
      sort_order: (index + 1) * 10,
      updated_by: updatedByValue,
      updated_at: nowIso,
    }));

    if (upsertRows.length > 0) {
      const { error: upsertError } = await serviceSupabase
        .from(TABLE_NAME)
        .upsert(upsertRows, { onConflict: 'id' });
      if (upsertError) {
        return NextResponse.json({ error: `설정 저장 실패: ${upsertError.message}` }, { status: 500 });
      }
    }

    const incomingIdSet = new Set(upsertRows.map((row) => row.id));
    const deleteIds = (existingRows || [])
      .map((row: any) => String(row.id || ''))
      .filter((id: string) => id && !incomingIdSet.has(id));

    if (deleteIds.length > 0) {
      const { error: deleteError } = await serviceSupabase
        .from(TABLE_NAME)
        .delete()
        .in('id', deleteIds);
      if (deleteError) {
        return NextResponse.json({ error: `삭제 반영 실패: ${deleteError.message}` }, { status: 500 });
      }
    }

    const { data: refreshedRows, error: refreshError } = await serviceSupabase
      .from(TABLE_NAME)
      .select('id, service_type, date_basis, label, enabled, days_before, title, body, sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (refreshError) {
      return NextResponse.json({ error: `저장 후 재조회 실패: ${refreshError.message}` }, { status: 500 });
    }

    return NextResponse.json(toSettingsFromRows(refreshedRows || []));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '고객 사전알림 설정 저장 실패' }, { status: 500 });
  }
}
