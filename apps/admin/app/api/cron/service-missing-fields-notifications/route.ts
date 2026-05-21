import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';
import { dispatchPushNotification } from '@/lib/notificationDispatcher';

type ReservationRow = {
  re_id: string;
  re_user_id: string | null;
  re_type: string | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
};

type AirportRow = {
  id: string;
  reservation_id: string | null;
  ra_datetime: string | null;
  ra_airport_location: string | null;
  accommodation_info: string | null;
  way_type: string | null;
};

type RentcarRow = {
  id: string;
  reservation_id: string | null;
  pickup_datetime: string | null;
  pickup_location: string | null;
  destination: string | null;
  return_datetime: string | null;
  return_pickup_location: string | null;
  return_destination: string | null;
  way_type: string | null;
};

type ShtRow = {
  id: string;
  reservation_id: string | null;
  pickup_datetime: string | null;
  usage_date: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  sht_category: string | null;
};

type Candidate = {
  dedupeKey: string;
  eventKey: string;
  reservationId: string;
  usageDate: string;
  serviceLabel: string;
  missingFields: string[];
};

function getKstTargetDate(offsetDays: number) {
  const nowUtc = new Date();
  const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCHours(0, 0, 0, 0);
  kstNow.setUTCDate(kstNow.getUTCDate() + offsetDays);
  return kstNow.toISOString().slice(0, 10);
}

function getUtcRangeForKstDate(date: string) {
  const startUtc = new Date(`${date}T00:00:00+09:00`).toISOString();
  const endUtc = new Date(`${date}T23:59:59.999+09:00`).toISOString();
  return { startUtc, endUtc };
}

function isBlankOrUpdating(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'updating' || normalized === '업데이팅';
}

function normalizeShtCategory(value: string | null | undefined): 'pickup' | 'drop' | 'sending' {
  const raw = String(value || '').toLowerCase().replace(/\s+/g, '');
  if (!raw) return 'pickup';
  if (raw.includes('drop') || raw.includes('드롭') || raw.includes('하차')) return 'drop';
  if (raw.includes('sending') || raw.includes('샌딩') || raw.includes('send')) return 'sending';
  return 'pickup';
}

function normalizeAirportWayType(value: string | null | undefined): 'pickup' | 'sending' {
  const raw = String(value || '').toLowerCase().replace(/\s+/g, '');
  if (!raw) return 'pickup';
  if (raw.includes('sending') || raw.includes('샌딩') || raw.includes('send') || raw.includes('drop') || raw.includes('드롭') || raw.includes('하차')) {
    return 'sending';
  }
  return 'pickup';
}

function normalizeWayType(value: string | null | undefined): 'pickup' | 'drop' | 'round' {
  const raw = String(value || '').toLowerCase().replace(/\s+/g, '');
  if (!raw) return 'pickup';
  if (raw.includes('round') || raw.includes('왕복')) return 'round';
  if (raw.includes('drop') || raw.includes('드롭') || raw.includes('하차')) return 'drop';
  return 'pickup';
}

async function runCron() {
  if (!serviceSupabase) {
    return NextResponse.json({ error: 'Service role client unavailable' }, { status: 500 });
  }

  const targetDate = getKstTargetDate(3);
  const { startUtc, endUtc } = getUtcRangeForKstDate(targetDate);

  const [airportResult, rentcarResult, shtResult] = await Promise.all([
    serviceSupabase
      .from('reservation_airport')
      .select('id, reservation_id, ra_datetime, ra_airport_location, accommodation_info, way_type')
      .gte('ra_datetime', startUtc)
      .lte('ra_datetime', endUtc),
    serviceSupabase
      .from('reservation_rentcar')
      .select('id, reservation_id, pickup_datetime, pickup_location, destination, return_datetime, return_pickup_location, return_destination, way_type')
      .gte('pickup_datetime', startUtc)
      .lte('pickup_datetime', endUtc),
    serviceSupabase
      .from('reservation_car_sht')
      .select('id, reservation_id, pickup_datetime, usage_date, pickup_location, dropoff_location, sht_category')
      .eq('pickup_datetime', targetDate),
  ]);

  if (airportResult.error || rentcarResult.error || shtResult.error) {
    console.error('[service-missing-fields-notifications] 조회 실패', {
      airport: airportResult.error,
      rentcar: rentcarResult.error,
      sht: shtResult.error,
    });
    return NextResponse.json({ error: 'service rows query failed' }, { status: 500 });
  }

  const candidates: Candidate[] = [];

  for (const row of (airportResult.data || []) as AirportRow[]) {
    if (!row.reservation_id) continue;

    const wayType = normalizeAirportWayType(row.way_type);

    const missingFields: string[] = [];
    if (isBlankOrUpdating(row.ra_airport_location)) missingFields.push('공항/출발 위치');
    if (isBlankOrUpdating(row.accommodation_info)) missingFields.push('숙소 정보');

    if (missingFields.length === 0) continue;

    candidates.push({
      dedupeKey: `airport:${targetDate}:${row.reservation_id}`,
      eventKey: wayType === 'sending' ? 'airport_sending_missing_info_d3' : 'airport_pickup_missing_info_d3',
      reservationId: row.reservation_id,
      usageDate: targetDate,
      serviceLabel: wayType === 'sending' ? '공항 샌딩' : '공항 픽업',
      missingFields,
    });
  }

  for (const row of (rentcarResult.data || []) as RentcarRow[]) {
    if (!row.reservation_id) continue;

    const wayType = normalizeWayType(row.way_type);

    const pickupMissingFields: string[] = [];
    if (isBlankOrUpdating(row.pickup_location)) pickupMissingFields.push('렌트카 픽업 위치');
    if (isBlankOrUpdating(row.destination)) pickupMissingFields.push('렌트카 도착 위치');

    if (pickupMissingFields.length > 0) {
      candidates.push({
        dedupeKey: `rentcar:pickup:${targetDate}:${row.reservation_id}`,
        eventKey: 'rentcar_pickup_missing_info_d3',
        reservationId: row.reservation_id,
        usageDate: targetDate,
        serviceLabel: '렌트카 픽업',
        missingFields: pickupMissingFields,
      });
    }

    const dropMissingFields: string[] = [];
    if (wayType === 'drop' || wayType === 'round' || !!row.return_datetime) {
      if (isBlankOrUpdating(row.return_pickup_location)) dropMissingFields.push('복귀 픽업 위치');
      if (isBlankOrUpdating(row.return_destination)) dropMissingFields.push('복귀 도착 위치');
    }

    if (dropMissingFields.length > 0) {
      candidates.push({
        dedupeKey: `rentcar:drop:${targetDate}:${row.reservation_id}`,
        eventKey: 'rentcar_drop_missing_info_d3',
        reservationId: row.reservation_id,
        usageDate: targetDate,
        serviceLabel: '렌트카 드롭',
        missingFields: dropMissingFields,
      });
    }
  }

  for (const row of (shtResult.data || []) as ShtRow[]) {
    if (!row.reservation_id) continue;

    const missingFields: string[] = [];
    if (isBlankOrUpdating(row.pickup_location)) missingFields.push('스하 픽업 위치');
    if (isBlankOrUpdating(row.dropoff_location)) missingFields.push('스하 드롭 위치');

    if (missingFields.length === 0) continue;

    const category = normalizeShtCategory(row.sht_category);
    const eventKey = category === 'pickup' ? 'sht_pickup_missing_info_d3' : 'sht_drop_missing_info_d3';

    const categoryLabel = category === 'pickup' ? '스하차량 픽업' : '스하차량 드롭';

    candidates.push({
      dedupeKey: `sht:${category}:${targetDate}:${row.reservation_id}`,
      eventKey,
      reservationId: row.reservation_id,
      usageDate: String(row.usage_date || row.pickup_datetime || targetDate),
      serviceLabel: categoryLabel,
      missingFields,
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      targetDate,
      candidates: 0,
      inserted: 0,
      pushSent: 0,
      pushFailed: 0,
      message: '사용일 3일전 미입력/업데이팅 대상 없음',
    });
  }

  const uniqueReservationIds = Array.from(new Set(candidates.map((c) => c.reservationId)));
  const { data: reservationRows, error: reservationErr } = await serviceSupabase
    .from('reservation')
    .select('re_id, re_user_id, re_type')
    .in('re_id', uniqueReservationIds);

  if (reservationErr) {
    console.error('[service-missing-fields-notifications] reservation 조회 실패:', reservationErr);
    return NextResponse.json({ error: 'reservation query failed' }, { status: 500 });
  }

  const reservationMap = new Map<string, ReservationRow>();
  (reservationRows || []).forEach((row) => reservationMap.set(row.re_id, row as ReservationRow));

  const userIds = Array.from(
    new Set(
      (reservationRows || [])
        .map((row: any) => row.re_user_id)
        .filter((id: string | null | undefined): id is string => Boolean(id))
    )
  );

  let userMap = new Map<string, UserRow>();
  if (userIds.length > 0) {
    const { data: userRows, error: userErr } = await serviceSupabase
      .from('users')
      .select('id, name, email, phone_number')
      .in('id', userIds);

    if (userErr) {
      console.error('[service-missing-fields-notifications] users 조회 실패:', userErr);
      return NextResponse.json({ error: 'users query failed' }, { status: 500 });
    }

    userMap = new Map((userRows || []).map((row) => [row.id, row as UserRow]));
  }

  const eventGroupedDedupeKeys = new Map<string, string[]>();
  for (const candidate of candidates) {
    const prev = eventGroupedDedupeKeys.get(candidate.eventKey) || [];
    prev.push(candidate.dedupeKey);
    eventGroupedDedupeKeys.set(candidate.eventKey, prev);
  }

  const existingDedupe = new Set<string>();
  for (const [eventKey, dedupeKeys] of eventGroupedDedupeKeys.entries()) {
    const { data: existingRows, error: existingErr } = await serviceSupabase
      .from('notification_dispatch_log')
      .select('dedupe_key')
      .eq('event_key', eventKey)
      .in('dedupe_key', dedupeKeys);

    if (existingErr) {
      console.error('[service-missing-fields-notifications] dedupe 조회 실패:', existingErr);
      return NextResponse.json({ error: 'dedupe query failed' }, { status: 500 });
    }

    (existingRows || []).forEach((row: { dedupe_key: string | null }) => {
      if (row.dedupe_key) existingDedupe.add(`${eventKey}::${row.dedupe_key}`);
    });
  }

  let inserted = 0;
  let pushSent = 0;
  let pushFailed = 0;

  for (const candidate of candidates) {
    if (existingDedupe.has(`${candidate.eventKey}::${candidate.dedupeKey}`)) {
      continue;
    }

    const reservation = reservationMap.get(candidate.reservationId);
    const user = reservation?.re_user_id ? userMap.get(reservation.re_user_id) : null;

    const userName = String(user?.name || '-').trim() || '-';
    const userEmail = String(user?.email || '-').trim() || '-';
    const userPhone = String(user?.phone_number || '-').trim() || '-';

    const body = [
      `${candidate.serviceLabel} 사용일 ${candidate.usageDate}`,
      `누락 항목: ${candidate.missingFields.join(', ')}`,
      `예약자: ${userName}`,
      `이메일: ${userEmail}`,
      `전화: ${userPhone}`,
    ].join(' | ');

    const { error: logErr } = await serviceSupabase.from('notification_dispatch_log').insert({
      event_key: candidate.eventKey,
      dedupe_key: candidate.dedupeKey,
      payload: {
        reservationId: candidate.reservationId,
        reservationType: reservation?.re_type || null,
        usageDate: candidate.usageDate,
        serviceLabel: candidate.serviceLabel,
        missingFields: candidate.missingFields,
        customer: {
          userId: reservation?.re_user_id || null,
          name: userName,
          email: userEmail,
          phone: userPhone,
        },
      },
    });

    if (logErr) {
      console.warn('[service-missing-fields-notifications] log insert 실패(발송은 계속):', logErr);
      continue;
    }

    inserted += 1;

    try {
      const result = await dispatchPushNotification({
        eventKey: candidate.eventKey,
        title: `${candidate.serviceLabel} 정보 확인 필요`,
        body,
        url: 'https://manager.staycruise.kr/manager/reservations',
        priority: 'high',
      });
      pushSent += result.sentCount;
      pushFailed += result.failCount;
    } catch (err) {
      console.warn('[service-missing-fields-notifications] push 발송 실패(로그는 저장됨):', err);
      pushFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    targetDate,
    candidates: candidates.length,
    inserted,
    pushSent,
    pushFailed,
    message: '서비스별 사용일 3일전 미입력 알림 처리 완료',
  });
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron();
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return runCron();
}
