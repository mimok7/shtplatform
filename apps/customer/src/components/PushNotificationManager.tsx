'use client';

import { useEffect } from 'react';
import supabase from '@/lib/supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export default function PushNotificationManager() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registerPush = async () => {
      try {
        // 이미 권한 거부된 경우 조용히 종료
        if (Notification.permission === 'denied') return;

        // 서비스 워커 준비 대기
        const registration = await navigator.serviceWorker.ready;

        // 기존 구독 확인
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          // 이미 구독 중 → 서버에 갱신만 (마지막 사용 시간 업데이트)
          await saveSubscription(existingSubscription);
          return;
        }

        // 권한 요청 (최초 1회)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // 구독 생성
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await saveSubscription(subscription);
        console.log('✅ Push subscription saved (customer)');
      } catch (err) {
        // 사일런트 실패 — 사용자 경험에 영향 없음
        console.warn('⚠️ Push subscription failed:', err);
      }
    };

    const saveSubscription = async (subscription: PushSubscription) => {
      // Bearer 토큰 획득
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      await fetch('/api/subscribe-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          appName: 'customer',
        }),
      });
    };

    // 페이지 로드 후 약간 지연 (UX: 사이트 탐색 후 권한 요청)
    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
