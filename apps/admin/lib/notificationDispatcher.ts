/**
 * 공통 푸시 알림 디스패처
 *
 * 모든 신규 알림 이벤트는 이 함수를 통해 발송해야 함.
 * 어드민 예약설정(notification_apps × notification_event_types × notification_app_event_settings)을
 * 그대로 따르므로 추후 어드민 UI에서 새 event_key를 추가해도 자동 반영됨.
 */
import webpush from 'web-push';
import serviceSupabase from '@/lib/serviceSupabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@stayhalong.com';

let vapidConfigured = false;
function ensureVapid() {
  if (!vapidConfigured && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

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

export interface DispatchOptions {
  eventKey: string;
  title: string;
  body: string;
  /** 특정 사용자에게만 발송 (생략 시 모든 활성 구독) */
  userId?: string | null;
  /** 호출자가 명시한 앱 목록 (생략 시 정책상 허용된 모든 앱) */
  requestedAppNames?: string[];
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requireInteraction?: boolean;
  /** 정책상 비활성 이벤트도 강제로 발송 (운영용, 일반적으로 사용 금지) */
  bypassPolicy?: boolean;
}

export interface DispatchResult {
  ok: boolean;
  eventKey: string;
  sentCount: number;
  failCount: number;
  total: number;
  allowedAppNames: string[];
  message?: string;
  warning?: string;
}

async function resolveAllowedAppNames(eventKey: string, requestedAppNames: string[]) {
  if (!serviceSupabase) {
    return { appNames: requestedAppNames, policyApplied: false, warning: 'service_client_unavailable' };
  }

  const [appsResult, eventResult, settingsResult] = await Promise.all([
    serviceSupabase.from('notification_apps').select('app_name, enabled'),
    serviceSupabase
      .from('notification_event_types')
      .select('event_key, is_active')
      .eq('event_key', eventKey)
      .maybeSingle(),
    serviceSupabase
      .from('notification_app_event_settings')
      .select('app_name, enabled')
      .eq('event_key', eventKey)
      .eq('enabled', true),
  ]);

  if (appsResult.error || eventResult.error || settingsResult.error) {
    return { appNames: requestedAppNames, policyApplied: false, warning: 'settings_query_failed' };
  }

  if (!eventResult.data || eventResult.data.is_active === false) {
    return { appNames: [], policyApplied: true, warning: 'event_type_disabled' };
  }

  const enabledApps = new Set(
    (appsResult.data || []).filter(a => a.enabled !== false).map(a => a.app_name)
  );
  const eventAllowed = new Set(
    (settingsResult.data || []).filter(s => s.enabled !== false).map(s => s.app_name)
  );

  const policyAllowed = Array.from(enabledApps).filter(a => eventAllowed.has(a));
  const appNames = requestedAppNames.length > 0
    ? requestedAppNames.filter(a => policyAllowed.includes(a))
    : policyAllowed;

  return { appNames, policyApplied: true };
}

export async function dispatchPushNotification(options: DispatchOptions): Promise<DispatchResult> {
  const {
    eventKey,
    title,
    body,
    userId,
    requestedAppNames = [],
    url,
    icon,
    badge,
    tag,
    priority = 'normal',
    requireInteraction,
    bypassPolicy = false,
  } = options;

  if (!serviceSupabase) {
    return { ok: false, eventKey, sentCount: 0, failCount: 0, total: 0, allowedAppNames: [], warning: 'service_client_unavailable' };
  }
  if (!ensureVapid()) {
    return { ok: false, eventKey, sentCount: 0, failCount: 0, total: 0, allowedAppNames: [], warning: 'vapid_not_configured' };
  }

  let allowedAppNames: string[] = requestedAppNames;
  let policyWarning: string | undefined;

  if (!bypassPolicy) {
    const policy = await resolveAllowedAppNames(eventKey, requestedAppNames);
    allowedAppNames = policy.appNames;
    policyWarning = policy.warning;

    if (policy.policyApplied && allowedAppNames.length === 0) {
      return {
        ok: true,
        eventKey,
        sentCount: 0,
        failCount: 0,
        total: 0,
        allowedAppNames: [],
        message: policy.warning === 'event_type_disabled' ? '이벤트 비활성' : '허용 앱 없음',
        warning: policy.warning,
      };
    }
  }

  let query = serviceSupabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id, app_name, user_agent, last_used_at, created_at')
    .eq('is_active', true);

  if (userId) query = query.eq('user_id', userId);
  if (allowedAppNames.length > 0) query = query.in('app_name', allowedAppNames);

  const { data: subscriptions, error: subsError } = await query;
  if (subsError) {
    return { ok: false, eventKey, sentCount: 0, failCount: 0, total: 0, allowedAppNames, warning: 'subscription_query_failed' };
  }
  if (!subscriptions || subscriptions.length === 0) {
    return { ok: true, eventKey, sentCount: 0, failCount: 0, total: 0, allowedAppNames, message: '활성 구독 없음' };
  }

  // dedupe user × app × user_agent 최신 1개만
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
    if (currentTime > existingTime) dedupedMap.set(key, sub);
  }
  const targets = Array.from(dedupedMap.values());

  const results = await Promise.allSettled(
    targets.map(async (sub) => {
      try {
        const targetUrl = buildUrlForApp(sub.app_name, url);
        const targetIcon = buildIconForApp(sub.app_name, icon);
        const targetBadge = typeof badge === 'string' && badge.trim() ? badge.trim() : targetIcon;
        const payload = JSON.stringify({
          title,
          body,
          icon: targetIcon,
          badge: targetBadge,
          tag: tag || `sht-${eventKey}`,
          url: targetUrl,
          requireInteraction: requireInteraction ?? (priority === 'urgent'),
          notificationType: eventKey,
          appName: sub.app_name || null,
        });

        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            urgency: priority === 'urgent' ? 'high' : priority === 'high' ? 'normal' : 'low',
            TTL: 86400,
          }
        );
        await serviceSupabase!
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);
        return { success: true };
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 410 || code === 404) {
          await serviceSupabase!
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }
        return { success: false };
      }
    })
  );

  const sentCount = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length;
  const failCount = results.length - sentCount;

  return {
    ok: true,
    eventKey,
    sentCount,
    failCount,
    total: results.length,
    allowedAppNames,
    warning: policyWarning,
  };
}
