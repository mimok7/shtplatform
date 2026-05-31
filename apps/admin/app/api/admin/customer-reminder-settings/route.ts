import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
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

const SETTINGS_RELATIVE_PATH = path.join('config', 'customer-reminder-settings.json');

async function findWorkspaceRoot(startDir: string): Promise<string> {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    const marker = path.join(current, 'pnpm-workspace.yaml');
    try {
      await fs.access(marker);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return startDir;
}

async function readSettingsFile(): Promise<CustomerReminderSettings> {
  const root = await findWorkspaceRoot(process.cwd());
  const targetPath = path.join(root, SETTINGS_RELATIVE_PATH);
  const raw = await fs.readFile(targetPath, 'utf-8');
  return JSON.parse(raw) as CustomerReminderSettings;
}

async function writeSettingsFile(settings: CustomerReminderSettings) {
  const root = await findWorkspaceRoot(process.cwd());
  const targetPath = path.join(root, SETTINGS_RELATIVE_PATH);
  await fs.writeFile(targetPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}

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

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const settings = await readSettingsFile();
    return NextResponse.json(settings);
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
    await writeSettingsFile(sanitized);

    return NextResponse.json(sanitized);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '고객 사전알림 설정 저장 실패' }, { status: 500 });
  }
}
