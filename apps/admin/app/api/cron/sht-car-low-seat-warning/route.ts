import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { dispatchPushNotification } from '@/lib/notificationDispatcher';

const EVENT_KEY = 'sht_car_low_seat_warning';
const REQUESTED_APP_NAMES = ['manager', 'manager1', 'mobile'];

type SeatRow = {
  reservation_id: string | null;
  vehicle_number: string | null;
  seat_number: string | null;
  pickup_datetime: string | null;
  sht_category: string | null;
};

type VehicleAggregate = {
  vehicleNumber: string;
  pickupDate: string;
  seatCount: number;
  seatList: string[];
  reservationIds: string[];
  emails: string[];
  bookers: Array<{ name: string; email: string }>;
};

function getKstDate(offsetDays: number) {
  const nowUtc = new Date();
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCHours(0, 0, 0, 0);
  kstNow.setUTCDate(kstNow.getUTCDate() + offsetDays);
  return kstNow.toISOString().slice(0, 10);
}

function isPickupCategory(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!v) return true;
  if (v.includes('drop') || v.includes('샌딩') || v.includes('sending') || v.includes('send')) return false;
  return true;
}

function splitSeatNumbers(seatText: string | null | undefined) {
  const raw = String(seatText || '').trim();
  if (!raw) return [] as string[];
  if (raw.toUpperCase() === 'ALL') {
    // 좌석 전체 배정으로 보고 부족 대상에서 제외되도록 큰 값으로 취급
    return ['ALL_1', 'ALL_2', 'ALL_3', 'ALL_4', 'ALL_5', 'ALL_6', 'ALL_7', 'ALL_8', 'ALL_9', 'ALL_10', 'ALL_11'];
  }

  return raw
    .split(/[,/\s]+/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

function buildBody(candidate: VehicleAggregate) {
  const previewEmails = candidate.emails.slice(0, 3).join(', ');
  const extra = candidate.emails.length > 3 ? ` 외 ${candidate.emails.length - 3}건` : '';
  const seats = candidate.seatList.slice(0, 8).join(', ');
  const seatSuffix = candidate.seatList.length > 8 ? ' 외' : '';
  const previewBookerNames = candidate.bookers
    .map((b) => b.name)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

  return [
    `픽업일: ${candidate.pickupDate}`,
    `차량: ${candidate.vehicleNumber}`,
    `좌석: ${candidate.seatCount}석 (${seats}${seatSuffix})`,
    `예약자: ${previewBookerNames || '-'}`,
    `예약자 이메일: ${previewEmails || '-'}${extra}`,
  ].join(' | ');
}

async function runCron() {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const targetPickupDate = getKstDate(5);

  const { data: rows, error } = await serviceSupabase
    .from('reservation_car_sht')
    .select('reservation_id, vehicle_number, seat_number, pickup_datetime, sht_category')
    .eq('pickup_datetime', targetPickupDate)
    .not('vehicle_number', 'is', null);

  if (error) {
    console.error('[sht-car-low-seat-warning] reservation_car_sht 조회 실패:', error);
    return NextResponse.json({ error: 'reservation_car_sht query failed' }, { status: 500 });
  }

  const sourceRows = ((rows || []) as SeatRow[]).filter((row) => isPickupCategory(row.sht_category));

  const vehicleMap = new Map<string, { seatSet: Set<string>; reservationIds: Set<string> }>();

  for (const row of sourceRows) {
    const vehicleNumber = String(row.vehicle_number || '').trim();
    if (!vehicleNumber) continue;

    const key = `${targetPickupDate}::${vehicleNumber}`;
    const current = vehicleMap.get(key) || { seatSet: new Set<string>(), reservationIds: new Set<string>() };

    const seats = splitSeatNumbers(row.seat_number);
    seats.forEach((seat) => current.seatSet.add(seat));

    if (row.reservation_id) {
      current.reservationIds.add(row.reservation_id);
    }

    vehicleMap.set(key, current);
  }

  const reservationIds = Array.from(new Set(Array.from(vehicleMap.values()).flatMap((v) => Array.from(v.reservationIds))));
  const reservationUserMap = new Map<string, string>();

  if (reservationIds.length > 0) {
    const { data: reservationRows, error: reservationError } = await serviceSupabase
      .from('reservation')
      .select('re_id, re_user_id')
      .in('re_id', reservationIds);

    if (reservationError) {
      console.error('[sht-car-low-seat-warning] reservation 조회 실패:', reservationError);
      return NextResponse.json({ error: 'reservation query failed' }, { status: 500 });
    }

    const userIds = Array.from(
      new Set(
        (reservationRows || [])
          .map((row: { re_user_id?: string | null }) => row.re_user_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    const userEmailMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: userRows, error: userError } = await serviceSupabase
        .from('users')
        .select('id, email')
        .in('id', userIds);

      if (userError) {
        console.error('[sht-car-low-seat-warning] users 조회 실패:', userError);
        return NextResponse.json({ error: 'users query failed' }, { status: 500 });
      }

      (userRows || []).forEach((user: { id: string; email: string | null }) => {
        if (user.id && user.email) {
          userEmailMap.set(user.id, user.email);
        }
      });
    }

    (reservationRows || []).forEach((row: { re_id: string; re_user_id?: string | null }) => {
      if (row.re_id && row.re_user_id && userEmailMap.has(row.re_user_id)) {
        reservationUserMap.set(row.re_id, userEmailMap.get(row.re_user_id) || '');
      }
    });
  }

  const candidates: VehicleAggregate[] = [];

  for (const [key, value] of vehicleMap.entries()) {
    const [pickupDate, vehicleNumber] = key.split('::');
    const seatList = Array.from(value.seatSet).sort();
    const seatCount = seatList.length;

    // 조건: 1~4석인 차량만 알림 (0석 제외)
    if (seatCount <= 0 || seatCount >= 5) continue;

    const emails = Array.from(value.reservationIds)
      .map((reservationId) => reservationUserMap.get(reservationId) || '')
      .filter(Boolean)
      .filter((email, index, arr) => arr.indexOf(email) === index)
      .sort();

    candidates.push({
      vehicleNumber,
      pickupDate,
      seatCount,
      seatList,
      reservationIds: Array.from(value.reservationIds),
      emails,
      bookers: [],
    });
  }

  const allCandidateEmails = Array.from(new Set(candidates.flatMap((c) => c.emails)));
  const emailNameMap = new Map<string, string>();

  if (allCandidateEmails.length > 0) {
    const { data: usersByEmail, error: usersByEmailError } = await serviceSupabase
      .from('users')
      .select('email, name')
      .in('email', allCandidateEmails);

    if (usersByEmailError) {
      console.error('[sht-car-low-seat-warning] users(email) 조회 실패:', usersByEmailError);
    } else {
      (usersByEmail || []).forEach((row: { email?: string | null; name?: string | null }) => {
        const email = String(row.email || '').trim();
        if (!email) return;
        emailNameMap.set(email, String(row.name || '').trim() || '-');
      });
    }
  }

  for (const candidate of candidates) {
    candidate.bookers = candidate.emails.map((email) => ({
      email,
      name: emailNameMap.get(email) || '-',
    }));
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      eventKey: EVENT_KEY,
      pickupDate: targetPickupDate,
      candidates: 0,
      message: '발송 대상 없음',
    });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let pushSent = 0;
  let pushFailed = 0;
  const pushWarnings = new Set<string>();
  const allowedApps = new Set<string>();

  for (const candidate of candidates) {
    const dedupeKey = `${candidate.pickupDate}:${candidate.vehicleNumber}`;

    const { error: logError } = await serviceSupabase
      .from('notification_dispatch_log')
      .insert({
        event_key: EVENT_KEY,
        dedupe_key: dedupeKey,
        payload: {
          pickupDate: candidate.pickupDate,
          vehicleNumber: candidate.vehicleNumber,
          seatCount: candidate.seatCount,
          seatList: candidate.seatList,
          reservationIds: candidate.reservationIds,
          emails: candidate.emails,
          bookers: candidate.bookers,
        },
      });

    if (logError) {
      // 23505: unique violation -> 이미 발송된 건
      if ((logError as { code?: string }).code === '23505') {
        skipped += 1;
        continue;
      }

      console.error('[sht-car-low-seat-warning] dispatch log insert 실패:', logError);
      failed += 1;
      continue;
    }

    const body = buildBody(candidate);
    let sentCount = 0;
    let failCount = 0;
    let warning: string | undefined;
    let eventAllowedApps: string[] = [];

    try {
      const result = await dispatchPushNotification({
        eventKey: EVENT_KEY,
        title: '스하차량 취소 위험 알림',
        body,
        requestedAppNames: REQUESTED_APP_NAMES,
        url: '/manager/reservations',
        tag: `sht-car-low-seat:${dedupeKey}`,
        priority: 'high',
        requireInteraction: true,
      });

      sentCount = result.sentCount;
      failCount = result.failCount;
      warning = result.warning;
      eventAllowedApps = result.allowedAppNames || [];
      pushSent += result.sentCount;
      pushFailed += result.failCount;
      if (warning) pushWarnings.add(warning);
      eventAllowedApps.forEach((app) => allowedApps.add(app));
    } catch (err) {
      failCount = 1;
      pushFailed += 1;
      warning = err instanceof Error ? err.message : String(err);
      pushWarnings.add(warning);
    }

    if (sentCount > 0) {
      sent += 1;
    } else {
      failed += 1;
    }

    await serviceSupabase.from('notifications').insert({
      type: 'business',
      category: 'reservation',
      subcategory: '스하차량 취소 알림',
      title: '스하차량 취소 위험 알림',
      message: body,
      target_table: 'reservation_car_sht',
      target_id: dedupeKey,
      priority: 'high',
      status: 'unread',
      metadata: {
        eventKey: EVENT_KEY,
        pickupDate: candidate.pickupDate,
        vehicleNumber: candidate.vehicleNumber,
        seatCount: candidate.seatCount,
        seatList: candidate.seatList,
        emails: candidate.emails,
        bookers: candidate.bookers,
        sentCount,
        failCount,
        allowedApps: eventAllowedApps,
        warning,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok: true,
    eventKey: EVENT_KEY,
    pickupDate: targetPickupDate,
    candidates: candidates.length,
    sent,
    skipped,
    failed,
    pushSent,
    pushFailed,
    allowedApps: Array.from(allowedApps),
    warning: Array.from(pushWarnings),
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return runCron();
}
