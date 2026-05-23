import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import serviceSupabase from '@/lib/serviceSupabase';

const EVENT_KEY = 'sht_car_low_seat_warning';
const REQUESTED_APP_NAMES = ['manager', 'manager1', 'mobile'];

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@stayhalong.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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

type AppRouteConfig = {
  baseUrl: string;
  defaultPath: string;
};

const APP_ROUTE_CONFIG: Record<string, AppRouteConfig> = {
  manager: { baseUrl: 'https://manager.stayhalong.com', defaultPath: '/manager/reservations' },
  manager1: { baseUrl: 'https://manag.staryhalong.com', defaultPath: '/manager/reservations' },
  mobile: { baseUrl: 'https://newmobile.stayhalong.com', defaultPath: '/manager/reservations' },
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildUrlForApp(appName: string | null | undefined, rawUrl?: string) {
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.manager;
  const baseUrl = normalizeBaseUrl(appConfig.baseUrl);

  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return `${baseUrl}${appConfig.defaultPath}`;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/')) {
    return `${baseUrl}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    return `${baseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `${baseUrl}${appConfig.defaultPath}`;
  }
}

function buildIconForApp(appName: string | null | undefined) {
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.manager;
  return `${normalizeBaseUrl(appConfig.baseUrl)}/icon-192.png`;
}

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

async function resolveAllowedAppNames(notificationType: string, requestedAppNames: string[]) {
  if (!serviceSupabase) {
    return { appNames: requestedAppNames, policyApplied: false, warning: 'service client unavailable' };
  }

  const [appsResult, eventResult, settingsResult] = await Promise.all([
    serviceSupabase.from('notification_apps').select('app_name, enabled'),
    serviceSupabase
      .from('notification_event_types')
      .select('event_key, is_active')
      .eq('event_key', notificationType)
      .maybeSingle(),
    serviceSupabase
      .from('notification_app_event_settings')
      .select('app_name, enabled')
      .eq('event_key', notificationType)
      .eq('enabled', true),
  ]);

  if (appsResult.error || eventResult.error || settingsResult.error) {
    return {
      appNames: requestedAppNames,
      policyApplied: false,
      warning: 'notification_app_settings_unavailable',
    };
  }

  if (!eventResult.data || eventResult.data.is_active === false) {
    return { appNames: [], policyApplied: true, warning: 'notification_type_disabled' };
  }

  const enabledApps = new Set(
    (appsResult.data || [])
      .filter((app) => app.enabled !== false)
      .map((app) => app.app_name)
  );

  const eventAllowedApps = new Set(
    (settingsResult.data || [])
      .filter((setting) => setting.enabled !== false)
      .map((setting) => setting.app_name)
  );

  const policyAllowedApps = Array.from(enabledApps).filter((appName) => eventAllowedApps.has(appName));
  const appNames = requestedAppNames.length > 0
    ? requestedAppNames.filter((appName) => policyAllowedApps.includes(appName))
    : policyAllowedApps;

  return { appNames, policyApplied: true };
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

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'VAPID keys are missing' }, { status: 503 });
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

  const allowedAppPolicy = await resolveAllowedAppNames(EVENT_KEY, REQUESTED_APP_NAMES);

  if (allowedAppPolicy.policyApplied && allowedAppPolicy.appNames.length === 0) {
    return NextResponse.json({
      ok: true,
      eventKey: EVENT_KEY,
      pickupDate: targetPickupDate,
      candidates: candidates.length,
      sent: 0,
      skipped: candidates.length,
      message: '알림유형 비활성 또는 허용 앱 없음',
      warning: allowedAppPolicy.warning,
    });
  }

  const { data: subscriptions, error: subError } = await serviceSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id, app_name, user_agent, last_used_at, created_at')
    .eq('is_active', true)
    .in('app_name', allowedAppPolicy.appNames);

  if (subError) {
    console.error('[sht-car-low-seat-warning] push_subscriptions 조회 실패:', subError);
    return NextResponse.json({ error: 'push_subscriptions query failed' }, { status: 500 });
  }

  const dedupedMap = new Map<string, (typeof subscriptions)[number]>();

  for (const sub of subscriptions || []) {
    const key = sub.user_id && sub.app_name && sub.user_agent
      ? `${sub.user_id}::${sub.app_name}::${sub.user_agent}`
      : `__raw__::${sub.id}`;

    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, sub);
      continue;
    }

    const existingTime = new Date(existing.last_used_at || existing.created_at || 0).getTime();
    const currentTime = new Date(sub.last_used_at || sub.created_at || 0).getTime();
    if (currentTime > existingTime) {
      dedupedMap.set(key, sub);
    }
  }

  const targetSubscriptions = Array.from(dedupedMap.values());

  let sent = 0;
  let skipped = 0;
  let failed = 0;

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

    const results = await Promise.allSettled(
      targetSubscriptions.map(async (sub) => {
        try {
          const targetUrl = buildUrlForApp(sub.app_name, '/manager/reservations');
          const targetIcon = buildIconForApp(sub.app_name);
          const payload = JSON.stringify({
            title: '스하차량 취소 위험 알림',
            body: buildBody(candidate),
            icon: targetIcon,
            badge: targetIcon,
            tag: `sht-car-low-seat:${dedupeKey}`,
            url: targetUrl,
            requireInteraction: true,
            notificationType: EVENT_KEY,
            appName: sub.app_name || null,
          });

          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            {
              urgency: 'high',
              TTL: 86400,
            }
          );

          await serviceSupabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);

          return { success: true };
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await serviceSupabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          return { success: false };
        }
      })
    );

    const okCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    if (okCount > 0) {
      sent += 1;
    } else {
      failed += 1;
    }

    await serviceSupabase.from('notifications').insert({
      type: 'business',
      category: 'reservation',
      subcategory: '스하차량 취소 알림',
      title: '스하차량 취소 위험 알림',
      message: buildBody(candidate),
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
    subscriptions: targetSubscriptions.length,
    allowedApps: allowedAppPolicy.appNames,
    warning: allowedAppPolicy.warning,
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
