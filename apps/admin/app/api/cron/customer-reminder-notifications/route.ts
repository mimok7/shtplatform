import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { dispatchPushNotification } from '@/lib/notificationDispatcher';

const EVENT_KEY = 'customer_pre_reminder';

type ReminderServiceType = 'cruise' | 'airport' | 'rentcar' | 'hotel' | 'tour' | 'ticket' | 'package';

type ReminderDateBasis =
  | 'checkin'
  | 'pickup'
  | 'dropoff'
  | 'rentcar_pickup'
  | 'rentcar_return'
  | 'usage'
  | 'start';

type ReminderRuleRow = {
  id: string;
  service_type: ReminderServiceType;
  date_basis: ReminderDateBasis;
  label: string;
  enabled: boolean;
  days_before: number;
  title: string;
  body: string;
};

type ReservationRow = {
  re_id: string;
  re_user_id: string | null;
  re_type: ReminderServiceType | null;
  reservation_date: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
};

function toYmdInKst(value: string | null | undefined): string | null {
  if (!value) return null;

  const plainYmd = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(plainYmd)) return plainYmd;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function todayYmdInKst(): string {
  return toYmdInKst(new Date().toISOString()) || new Date().toISOString().slice(0, 10);
}

function diffDays(targetYmd: string, baseYmd: string): number {
  const targetMs = Date.parse(`${targetYmd}T00:00:00Z`);
  const baseMs = Date.parse(`${baseYmd}T00:00:00Z`);
  return Math.round((targetMs - baseMs) / (1000 * 60 * 60 * 24));
}

function formatKoreanDate(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function applyTemplate(template: string, serviceLabel: string, days: number, serviceDateYmd: string): string {
  return template
    .replaceAll('{service}', serviceLabel)
    .replaceAll('{days}', String(days))
    .replaceAll('{date}', formatKoreanDate(serviceDateYmd));
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

async function runCron(request: NextRequest) {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const backfillDays = Math.max(0, Math.min(30, Number(request.nextUrl.searchParams.get('backfillDays') || 0)));
  const dryRun = String(request.nextUrl.searchParams.get('dryRun') || '').toLowerCase() === 'true';

  const { data: rules, error: rulesError } = await serviceSupabase
    .from('customer_reminder_rules')
    .select('id, service_type, date_basis, label, enabled, days_before, title, body, sort_order')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (rulesError) {
    return NextResponse.json({ error: `rules query failed: ${rulesError.message}` }, { status: 500 });
  }

  const enabledRules = (rules || []) as ReminderRuleRow[];
  if (enabledRules.length === 0) {
    return NextResponse.json({ ok: true, rules: 0, candidates: 0, inserted: 0, pushSent: 0, pushFailed: 0, message: '활성화된 사전알림 규칙 없음' });
  }

  const { data: reservations, error: reservationError } = await serviceSupabase
    .from('reservation')
    .select('re_id, re_user_id, re_type, reservation_date')
    .not('re_user_id', 'is', null)
    .neq('re_status', 'cancelled');

  if (reservationError) {
    return NextResponse.json({ error: `reservation query failed: ${reservationError.message}` }, { status: 500 });
  }

  const list = (reservations || []) as ReservationRow[];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, rules: enabledRules.length, candidates: 0, inserted: 0, pushSent: 0, pushFailed: 0, message: '대상 예약 없음' });
  }

  const userIds = Array.from(new Set(list.map((row) => row.re_user_id).filter((id): id is string => Boolean(id))));
  const userNameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users, error: userError } = await serviceSupabase
      .from('users')
      .select('id, name')
      .in('id', userIds);

    if (userError) {
      return NextResponse.json({ error: `users query failed: ${userError.message}` }, { status: 500 });
    }

    (users || []).forEach((user) => {
      const row = user as UserRow;
      if (!row.id) return;
      userNameMap.set(row.id, String(row.name || '').trim() || '-');
    });
  }

  const cruiseIds = list.filter((r) => r.re_type === 'cruise').map((r) => r.re_id);
  const airportIds = list.filter((r) => r.re_type === 'airport').map((r) => r.re_id);
  const rentcarIds = list.filter((r) => r.re_type === 'rentcar').map((r) => r.re_id);
  const hotelIds = list.filter((r) => r.re_type === 'hotel').map((r) => r.re_id);
  const tourIds = list.filter((r) => r.re_type === 'tour').map((r) => r.re_id);
  const ticketIds = list.filter((r) => r.re_type === 'ticket').map((r) => r.re_id);

  const [cruiseRes, airportRes, rentcarRes, hotelRes, tourRes, ticketRes] = await Promise.all([
    cruiseIds.length > 0
      ? serviceSupabase.from('reservation_cruise').select('reservation_id, checkin').in('reservation_id', cruiseIds)
      : Promise.resolve({ data: [], error: null } as any),
    airportIds.length > 0
      ? serviceSupabase.from('reservation_airport').select('reservation_id, ra_datetime, way_type').in('reservation_id', airportIds)
      : Promise.resolve({ data: [], error: null } as any),
    rentcarIds.length > 0
      ? serviceSupabase.from('reservation_rentcar').select('reservation_id, pickup_datetime, return_datetime').in('reservation_id', rentcarIds)
      : Promise.resolve({ data: [], error: null } as any),
    hotelIds.length > 0
      ? serviceSupabase.from('reservation_hotel').select('reservation_id, checkin_date').in('reservation_id', hotelIds)
      : Promise.resolve({ data: [], error: null } as any),
    tourIds.length > 0
      ? serviceSupabase.from('reservation_tour').select('reservation_id, usage_date').in('reservation_id', tourIds)
      : Promise.resolve({ data: [], error: null } as any),
    ticketIds.length > 0
      ? serviceSupabase.from('reservation_ticket').select('reservation_id, usage_date').in('reservation_id', ticketIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const detailError = cruiseRes.error || airportRes.error || rentcarRes.error || hotelRes.error || tourRes.error || ticketRes.error;
  if (detailError) {
    return NextResponse.json({ error: 'service detail query failed' }, { status: 500 });
  }

  const cruiseMap = new Map<string, string>();
  (cruiseRes.data || []).forEach((row: any) => {
    const ymd = toYmdInKst(row.checkin);
    if (ymd) cruiseMap.set(row.reservation_id, ymd);
  });

  const airportPickupMap = new Map<string, string>();
  const airportDropoffMap = new Map<string, string>();
  (airportRes.data || []).forEach((row: any) => {
    const ymd = toYmdInKst(row.ra_datetime);
    if (!ymd) return;
    const wayType = String(row.way_type || '').toLowerCase();
    if (wayType === 'dropoff') {
      airportDropoffMap.set(row.reservation_id, ymd);
      return;
    }
    airportPickupMap.set(row.reservation_id, ymd);
  });

  const rentcarPickupMap = new Map<string, string>();
  const rentcarReturnMap = new Map<string, string>();
  (rentcarRes.data || []).forEach((row: any) => {
    const pickupYmd = toYmdInKst(row.pickup_datetime);
    if (pickupYmd) rentcarPickupMap.set(row.reservation_id, pickupYmd);

    const returnYmd = toYmdInKst(row.return_datetime);
    if (returnYmd) rentcarReturnMap.set(row.reservation_id, returnYmd);
  });

  const hotelMap = new Map<string, string>();
  (hotelRes.data || []).forEach((row: any) => {
    const ymd = toYmdInKst(row.checkin_date);
    if (ymd) hotelMap.set(row.reservation_id, ymd);
  });

  const tourMap = new Map<string, string>();
  (tourRes.data || []).forEach((row: any) => {
    const ymd = toYmdInKst(row.usage_date);
    if (ymd) tourMap.set(row.reservation_id, ymd);
  });

  const ticketMap = new Map<string, string>();
  (ticketRes.data || []).forEach((row: any) => {
    const ymd = toYmdInKst(row.usage_date);
    if (ymd) ticketMap.set(row.reservation_id, ymd);
  });

  const serviceLabelMap: Record<ReminderServiceType, string> = {
    cruise: '크루즈',
    airport: '공항',
    rentcar: '렌트카',
    hotel: '호텔',
    tour: '투어',
    ticket: '티켓',
    package: '패키지',
  };

  const todayYmd = todayYmdInKst();

  const resolveServiceDate = (reservation: ReservationRow, dateBasis: ReminderDateBasis): string | null => {
    if (reservation.re_type === 'cruise') {
      if (dateBasis === 'checkin') return cruiseMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'airport') {
      if (dateBasis === 'dropoff') return airportDropoffMap.get(reservation.re_id) || null;
      if (dateBasis === 'pickup') return airportPickupMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'rentcar') {
      if (dateBasis === 'rentcar_return') return rentcarReturnMap.get(reservation.re_id) || null;
      if (dateBasis === 'rentcar_pickup') return rentcarPickupMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'hotel') {
      if (dateBasis === 'checkin') return hotelMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'tour') {
      if (dateBasis === 'usage') return tourMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'ticket') {
      if (dateBasis === 'usage') return ticketMap.get(reservation.re_id) || null;
      return null;
    }
    if (reservation.re_type === 'package') {
      if (dateBasis === 'start') return toYmdInKst(reservation.reservation_date);
      return null;
    }
    return null;
  };

  const candidates: Array<{
    dedupeKey: string;
    reservationId: string;
    userId: string;
    customerName: string;
    title: string;
    body: string;
    serviceDateYmd: string;
    ruleId: string;
  }> = [];

  list.forEach((reservation) => {
    const serviceType = reservation.re_type as ReminderServiceType | null;
    const userId = reservation.re_user_id;
    if (!serviceType || !userId) return;

    enabledRules
      .filter((rule) => rule.service_type === serviceType)
      .forEach((rule) => {
        const serviceDateYmd = resolveServiceDate(reservation, rule.date_basis);
        if (!serviceDateYmd) return;

        const days = diffDays(serviceDateYmd, todayYmd);
        const lowerBound = Math.max(0, rule.days_before - backfillDays);
        const shouldSend = backfillDays > 0
          ? days >= lowerBound && days <= rule.days_before
          : days === rule.days_before;

        if (!shouldSend) return;

        const serviceLabel = serviceLabelMap[serviceType] || serviceType;
        const customerName = userNameMap.get(userId) || '-';
        const title = applyTemplate(rule.title, serviceLabel, rule.days_before, serviceDateYmd);
        const body = `고객명: ${customerName} | ${applyTemplate(rule.body, serviceLabel, rule.days_before, serviceDateYmd)}`;

        candidates.push({
          dedupeKey: `${rule.id}:${rule.date_basis}:${reservation.re_id}:${serviceDateYmd}:${rule.days_before}`,
          reservationId: reservation.re_id,
          userId,
          customerName,
          title,
          body,
          serviceDateYmd,
          ruleId: rule.id,
        });
      });
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      rules: enabledRules.length,
      backfillDays,
      candidates: 0,
      inserted: 0,
      pushSent: 0,
      pushFailed: 0,
      message: '발송 대상 없음',
    });
  }

  const dedupeKeys = candidates.map((c) => c.dedupeKey);
  const { data: existingRows, error: dedupeError } = await serviceSupabase
    .from('notification_dispatch_log')
    .select('dedupe_key')
    .eq('event_key', EVENT_KEY)
    .in('dedupe_key', dedupeKeys);

  if (dedupeError) {
    return NextResponse.json({ error: `dedupe query failed: ${dedupeError.message}` }, { status: 500 });
  }

  const existingSet = new Set((existingRows || []).map((row: any) => String(row.dedupe_key || '')));

  let inserted = 0;
  let pushSent = 0;
  let pushFailed = 0;

  for (const candidate of candidates) {
    if (existingSet.has(candidate.dedupeKey)) continue;

    if (!dryRun) {
      const nowIso = new Date().toISOString();
      const { error: notificationError } = await serviceSupabase
        .from('notifications')
        .insert({
          type: 'reservation',
          category: 'customer_reminder',
          subcategory: candidate.ruleId,
          title: candidate.title,
          message: candidate.body,
          target_table: 'reservation',
          target_id: candidate.reservationId,
          priority: 'normal',
          status: 'unread',
          assigned_to: candidate.userId,
          metadata: {
            eventKey: EVENT_KEY,
            ruleId: candidate.ruleId,
            customerName: candidate.customerName,
            serviceDate: candidate.serviceDateYmd,
            source: 'cron_customer_reminder',
          },
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (notificationError) {
        pushFailed += 1;
        continue;
      }

      let sentCount = 0;
      let failCount = 0;
      let dispatchWarning: string | undefined;

      try {
        const dispatchResult = await dispatchPushNotification({
          eventKey: EVENT_KEY,
          title: candidate.title,
          body: candidate.body,
          userId: candidate.userId,
          requestedAppNames: ['customer'],
          url: '/mypage/notifications',
          priority: 'normal',
        });
        sentCount = dispatchResult.sentCount;
        failCount = dispatchResult.failCount;
        dispatchWarning = dispatchResult.warning;
      } catch {
        failCount = 1;
      }

      pushSent += sentCount;
      pushFailed += failCount;

      await serviceSupabase
        .from('notification_dispatch_log')
        .insert({
          event_key: EVENT_KEY,
          dedupe_key: candidate.dedupeKey,
          payload: {
            reservationId: candidate.reservationId,
            userId: candidate.userId,
            customerName: candidate.customerName,
            ruleId: candidate.ruleId,
            serviceDate: candidate.serviceDateYmd,
            sentCount,
            failCount,
            dispatchWarning,
          },
        });
    }

    inserted += 1;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    rules: enabledRules.length,
    backfillDays,
    candidates: candidates.length,
    inserted,
    pushSent,
    pushFailed,
    todayKst: todayYmd,
    message: dryRun ? 'dry run 완료' : '고객 사전알림 발송 완료',
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron(request);
}
