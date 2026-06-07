import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import serviceSupabase from '@/lib/serviceSupabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@stayhalong.com';

const APP_ROUTE_CONFIG: Record<string, { baseUrl: string; defaultPath: string }> = {
  admin: { baseUrl: 'https://admin.stayhalong.com', defaultPath: '/admin/reservation-settings' },
  customer: { baseUrl: 'https://staycruise.kr', defaultPath: '/mypage/notifications' },
  customer1: { baseUrl: 'https://legacy.staycruise.kr', defaultPath: '/mypage/notifications' },
  manager: { baseUrl: 'https://manager.stayhalong.com', defaultPath: '/manager/notifications' },
  manager1: { baseUrl: 'https://manag.staryhalong.com', defaultPath: '/manager/notifications' },
  mobile: { baseUrl: 'https://newmobile.stayhalong.com', defaultPath: '/program-updates' },
  partner: { baseUrl: 'https://partner.stayhalong.com', defaultPath: '/partner/dashboard' },
  quote: { baseUrl: 'https://quote.stayhalong.com', defaultPath: '/' },
};

type ProgramUpdateRow = {
  id: string;
  app_name: string;
  request_url: string | null;
  content: string;
  account: string | null;
  requested_at: string;
  completed_at: string | null;
};

type NotificationAction = 'requested' | 'completed';

function ensureVapidConfigured() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildUrlForApp(appName: string | null | undefined, rawUrl?: string) {
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.mobile;
  const baseUrl = normalizeBaseUrl(appConfig.baseUrl);

  if (!rawUrl?.trim()) {
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
  const appConfig = APP_ROUTE_CONFIG[appName || ''] || APP_ROUTE_CONFIG.mobile;
  return `${normalizeBaseUrl(appConfig.baseUrl)}/icon-192.png`;
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
    (appsResult.data || []).filter((app) => app.enabled !== false).map((app) => app.app_name)
  );
  const eventAllowedApps = new Set(
    (settingsResult.data || []).filter((setting) => setting.enabled !== false).map((setting) => setting.app_name)
  );

  const policyAllowedApps = Array.from(enabledApps).filter((appName) => eventAllowedApps.has(appName));
  const appNames = requestedAppNames.length > 0
    ? requestedAppNames.filter((appName) => policyAllowedApps.includes(appName))
    : policyAllowedApps;

  return { appNames, policyApplied: true };
}

async function dispatchPushNotification(options: {
  eventKey: string;
  title: string;
  body: string;
  requestedAppNames: string[];
  url?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}) {
  const { eventKey, title, body, requestedAppNames, url, priority = 'normal' } = options;

  const supabaseAdmin = serviceSupabase;
  if (!supabaseAdmin) {
    return { ok: false, sentCount: 0, failCount: 0, total: 0, allowedAppNames: [], warning: 'service_client_unavailable' };
  }

  const policy = await resolveAllowedAppNames(eventKey, requestedAppNames);
  if (policy.policyApplied && policy.appNames.length === 0) {
    return {
      ok: true,
      sentCount: 0,
      failCount: 0,
      total: 0,
      allowedAppNames: [],
      warning: policy.warning,
      skipped: true,
    };
  }

  if (!ensureVapidConfigured()) {
    return {
      ok: false,
      sentCount: 0,
      failCount: 0,
      total: 0,
      allowedAppNames: policy.appNames,
      warning: 'vapid_not_configured',
    };
  }

  const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id, app_name, user_agent, last_used_at, created_at')
    .eq('is_active', true)
    .in('app_name', policy.appNames);

  if (subscriptionError) {
    return {
      ok: false,
      sentCount: 0,
      failCount: 0,
      total: 0,
      allowedAppNames: policy.appNames,
      warning: 'subscription_query_failed',
    };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return {
      ok: true,
      sentCount: 0,
      failCount: 0,
      total: 0,
      allowedAppNames: policy.appNames,
      warning: 'active_subscription_not_found',
    };
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
    if (currentTime > existingTime) dedupedMap.set(key, sub);
  }

  const targets = Array.from(dedupedMap.values());
  const results = await Promise.allSettled(
    targets.map(async (sub) => {
      try {
        const targetUrl = buildUrlForApp(sub.app_name, url);
        const targetIcon = buildIconForApp(sub.app_name);
        const payload = JSON.stringify({
          title,
          body,
          icon: targetIcon,
          badge: targetIcon,
          tag: `program-update-${eventKey}`,
          url: targetUrl,
          requireInteraction: priority === 'urgent',
          notificationType: eventKey,
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
            TTL: 86400,
          }
        );

        await supabaseAdmin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id);

        return { success: true };
      } catch (error: unknown) {
        const code = (error as { statusCode?: number })?.statusCode;
        if (code === 410 || code === 404) {
          await supabaseAdmin
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }
        return { success: false };
      }
    })
  );

  const sentCount = results.filter((result) => result.status === 'fulfilled' && result.value.success).length;
  const failCount = results.length - sentCount;

  return {
    ok: true,
    sentCount,
    failCount,
    total: results.length,
    allowedAppNames: policy.appNames,
    warning: policy.warning,
  };
}

function toDisplayPath(rawUrl: string | null) {
  if (!rawUrl?.trim()) return '-';
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawUrl;
  }
}

function buildNotificationPayload(row: ProgramUpdateRow, action: NotificationAction) {
  const eventKey = action === 'completed' ? 'program_update_completed' : 'program_update_requested';
  const title = action === 'completed' ? '프로그램 수정 완료' : '프로그램 수정 신청';
  const contentPreview = row.content.replace(/\s+/g, ' ').trim();
  const body = [
    `앱: ${row.app_name}`,
    `페이지: ${toDisplayPath(row.request_url)}`,
    `계정: ${row.account || '-'}`,
    `내용: ${contentPreview.length > 120 ? `${contentPreview.slice(0, 120)}...` : contentPreview}`,
  ].join(' | ');

  return {
    eventKey,
    title,
    body,
    priority: action === 'completed' ? 'normal' as const : 'high' as const,
    url: '/program-updates',
    metadata: {
      eventKey,
      programUpdateRequestId: row.id,
      appName: row.app_name,
      requestUrl: row.request_url,
      account: row.account,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
      action,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'service role client unavailable' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 });
    }

    const { data: authData, error: authError } = await serviceSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const requestId = String(body?.requestId || '').trim();
    const action = body?.action === 'completed' ? 'completed' : body?.action === 'requested' ? 'requested' : null;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'requestId, action 필수' }, { status: 400 });
    }

    const { data: row, error: rowError } = await serviceSupabase
      .from('program_update_requests')
      .select('id, app_name, request_url, content, account, requested_at, completed_at')
      .eq('id', requestId)
      .maybeSingle();

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: '요청 데이터를 찾지 못했습니다.' }, { status: 404 });
    }

    const payload = buildNotificationPayload(row as ProgramUpdateRow, action);

    const policy = await resolveAllowedAppNames(payload.eventKey, ['mobile']);
    if (policy.policyApplied && policy.appNames.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: policy.warning || 'mobile_app_disabled',
      });
    }

    const { data: existingNotification } = await serviceSupabase
      .from('notifications')
      .select('id')
      .eq('target_table', 'program_update_requests')
      .eq('target_id', requestId)
      .eq('subcategory', payload.eventKey)
      .limit(1)
      .maybeSingle();

    if (existingNotification) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'duplicate_notification',
      });
    }

    const dispatchResult = await dispatchPushNotification({
      eventKey: payload.eventKey,
      title: payload.title,
      body: payload.body,
      requestedAppNames: ['mobile'],
      url: payload.url,
      priority: payload.priority,
    });

    const nowIso = new Date().toISOString();
    const { error: notificationError } = await serviceSupabase
      .from('notifications')
      .insert({
        type: 'system',
        category: 'program_update',
        subcategory: payload.eventKey,
        title: payload.title,
        message: payload.body,
        target_table: 'program_update_requests',
        target_id: requestId,
        priority: payload.priority,
        status: 'unread',
        created_by: authData.user.id,
        metadata: {
          ...payload.metadata,
          allowedAppNames: dispatchResult.allowedAppNames,
          sentCount: dispatchResult.sentCount,
          failCount: dispatchResult.failCount,
          dispatchWarning: dispatchResult.warning,
        },
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      eventKey: payload.eventKey,
      sentCount: dispatchResult.sentCount,
      failCount: dispatchResult.failCount,
      allowedAppNames: dispatchResult.allowedAppNames,
      warning: dispatchResult.warning,
    });
  } catch (error) {
    console.error('[program-update-notify] 실패', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'server_error' },
      { status: 500 }
    );
  }
}
