'use client';

import supabase from '@/lib/supabase';

/**
 * 어드민의 send-notification 엔드포인트를 호출해 푸시 알림을 발송합니다.
 * - 어드민 예약설정(notification_apps × notification_event_types × notification_app_event_settings)
 *   에 따라 정책 기반으로 발송됨
 * - fire-and-forget. 실패해도 호출자 흐름은 절대 막지 않음
 */
export type DispatchPushOptions = {
  eventKey: string;
  title: string;
  body: string;
  userId?: string;
  appNames?: string[];
  url?: string;
  icon?: string;
  tag?: string;
  priority?: 'normal' | 'high' | 'urgent';
  requireInteraction?: boolean;
};

const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_BASE ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3004'
    : 'https://admin.staycruise.kr');

export async function dispatchPushNotification(opts: DispatchPushOptions): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      console.warn('[dispatchPushNotification] 세션 없음 - 발송 건너뜀');
      return;
    }

    const res = await fetch(`${ADMIN_API_BASE}/api/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        eventKey: opts.eventKey,
        title: opts.title,
        body: opts.body,
        userId: opts.userId,
        appNames: opts.appNames,
        url: opts.url,
        icon: opts.icon,
        tag: opts.tag || opts.eventKey,
        priority: opts.priority || 'normal',
        requireInteraction: opts.requireInteraction || false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[dispatchPushNotification] 발송 실패', res.status, text);
      return;
    }
  } catch (err) {
    console.warn('[dispatchPushNotification] 호출 오류(무시):', err);
  }
}
