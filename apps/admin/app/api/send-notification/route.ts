import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import serviceSupabase from '@/lib/serviceSupabase';

// VAPID 설정
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@stayhalong.com';
const DEFAULT_NOTIFICATION_TYPE = 'manual_customer';

type AppRouteConfig = {
  baseUrl: string;
  defaultPath: string;
};

const APP_ROUTE_CONFIG: Record<string, AppRouteConfig> = {
  admin: { baseUrl: 'https://admin.stayhalong.com', defaultPath: '/admin' },
  customer: { baseUrl: 'https://staycruise.kr', defaultPath: '/' },
  customer1: { baseUrl: 'https://legacy.staycruise.kr', defaultPath: '/' },
  manager: { baseUrl: 'https://manager.stayhalong.com', defaultPath: '/manager/dashboard' },
  manager1: { baseUrl: 'https://manag.staryhalong.com', defaultPath: '/manager/dashboard' },
  mobile: { baseUrl: 'https://newmobile.stayhalong.com', defaultPath: '/manager/dashboard' },
  partner: { baseUrl: 'https://partner.stayhalong.com', defaultPath: '/partner/dashboard' },
  quote: { baseUrl: 'https://quote.stayhalong.com', defaultPath: '/' },
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildUrlForApp(appName: string | null | undefined, rawUrl?: string) {
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.customer;
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

function buildIconForApp(appName: string | null | undefined, rawIcon?: string) {
  if (typeof rawIcon === 'string' && rawIcon.trim()) {
    return rawIcon.trim();
  }
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.customer;
  return `${normalizeBaseUrl(appConfig.baseUrl)}/icon-192.png`;
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// CORS — manager/manager1/mobile/customer 등 다른 앱에서 직접 호출할 수 있도록 허용
const ALLOWED_ORIGINS = [
  'https://staycruise.kr',
  'https://admin.stayhalong.com',
  'https://manager.stayhalong.com',
  'https://manag.staryhalong.com',
  'https://partner.stayhalong.com',
  'https://manager.staycruise.kr',
  'https://quick.manager.staycruise.kr',
  'https://newmobile.stayhalong.com',
  'https://quote.stayhalong.com',
  'https://partner.staycruise.kr',
  'https://legacy.staycruise.kr',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
];

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

async function resolveAllowedAppNames(notificationType: string, requestedAppNames: string[]) {
  if (!serviceSupabase) {
    return { appNames: requestedAppNames, policyApplied: false, warning: 'service client unavailable' };
  }

  const [appsResult, eventResult, settingsResult] = await Promise.all([
    serviceSupabase
      .from('notification_apps')
      .select('app_name, enabled'),
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

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'));
  const jsonResponse = (body: unknown, init?: ResponseInit) => {
    const res = NextResponse.json(body, init);
    Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  };
  try {
    if (!serviceSupabase) {
      return jsonResponse({ error: '서버 설정 오류' }, { status: 500 });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return jsonResponse({ error: 'VAPID 키 미설정 — .env.local에 VAPID 키를 추가하세요' }, { status: 503 });
    }

    // 발신자 인증 (admin/manager만 가능)
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return jsonResponse({ error: '인증 필요' }, { status: 401 });
    }

    const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse({ error: '인증 실패' }, { status: 401 });
    }

    const { data: senderProfile } = await serviceSupabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!senderProfile || !['admin', 'manager'].includes(senderProfile.role)) {
      return jsonResponse({ error: '권한 없음 (admin/manager만 발송 가능)' }, { status: 403 });
    }

    // 요청 파라미터
    const {
      userId,         // 특정 사용자 ID (선택)
      appNames,       // 대상 앱 배열 ['customer', 'partner'] (선택, 미지정 시 전체)
      title,
      body,
      icon,
      url,
      tag,
      priority,       // 'normal' | 'high' | 'urgent'
      requireInteraction,
      notificationType,
      eventKey,
    } = await req.json();

    if (!title || !body) {
      return jsonResponse({ error: 'title, body 필수' }, { status: 400 });
    }

    const requestedAppNames = Array.isArray(appNames)
      ? appNames.filter((appName) => typeof appName === 'string' && appName.trim()).map((appName) => appName.trim())
      : [];
    const resolvedNotificationType = typeof eventKey === 'string' && eventKey.trim()
      ? eventKey.trim()
      : typeof notificationType === 'string' && notificationType.trim()
        ? notificationType.trim()
        : DEFAULT_NOTIFICATION_TYPE;
    const allowedAppPolicy = await resolveAllowedAppNames(resolvedNotificationType, requestedAppNames);

    if (allowedAppPolicy.policyApplied && allowedAppPolicy.appNames.length === 0) {
      return jsonResponse({
        success: true,
        sentCount: 0,
        failCount: 0,
        total: 0,
        notificationType: resolvedNotificationType,
        message: allowedAppPolicy.warning === 'notification_type_disabled'
          ? '알림 유형이 비활성화되어 발송하지 않았습니다.'
          : '허용된 대상 앱이 없어 발송하지 않았습니다.',
      });
    }

    // 대상 push_subscriptions 조회
    let query = serviceSupabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id, app_name, user_agent, last_used_at, created_at')
      .eq('is_active', true);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (allowedAppPolicy.appNames.length > 0) {
      query = query.in('app_name', allowedAppPolicy.appNames);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('[send-notification] 구독 조회 실패:', fetchError);
      return jsonResponse({ error: '구독 조회 실패' }, { status: 500 });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({
        success: true,
        sentCount: 0,
        notificationType: resolvedNotificationType,
        allowedAppNames: allowedAppPolicy.appNames,
        message: '활성 구독 없음',
      });
    }

    const dedupedMap = new Map<string, (typeof subscriptions)[number]>();
    for (const sub of subscriptions) {
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

    const results = await Promise.allSettled(
      targetSubscriptions.map(async (sub) => {
        try {
          const targetUrl = buildUrlForApp(sub.app_name, url);
          const targetIcon = buildIconForApp(sub.app_name, icon);
          const payload = JSON.stringify({
            title,
            body,
            icon: targetIcon,
            badge: targetIcon,
            tag: tag || 'sht-notification',
            url: targetUrl,
            requireInteraction: requireInteraction || (priority === 'urgent'),
            notificationType: resolvedNotificationType,
            appName: sub.app_name || null,
          });

          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            {
              urgency: priority === 'urgent' ? 'high' : priority === 'high' ? 'normal' : 'low',
              TTL: 86400, // 24시간
            }
          );
          // 마지막 사용 시간 업데이트
          await serviceSupabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
          return { success: true, id: sub.id };
        } catch (err: any) {
          // 410 Gone = 구독 만료 → 비활성화
          if (err.statusCode === 410 || err.statusCode === 404) {
            await serviceSupabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          return { success: false, id: sub.id, error: err.message };
        }
      })
    );

    const sentCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failCount = results.length - sentCount;

    console.log(`[send-notification] 발송 완료: ${sentCount}/${results.length}`);
    return jsonResponse({
      success: true,
      sentCount,
      failCount,
      total: results.length,
      rawTargetCount: subscriptions.length,
      notificationType: resolvedNotificationType,
      allowedAppNames: allowedAppPolicy.appNames,
      warning: allowedAppPolicy.warning,
    });

  } catch (err: any) {
    console.error('[send-notification] 오류:', err);
    return jsonResponse({ error: '서버 오류' }, { status: 500 });
  }
}
