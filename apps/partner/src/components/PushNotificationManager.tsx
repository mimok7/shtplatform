'use client';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

const APP_NAME = 'partner';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function toApplicationServerKey(base64String: string): ArrayBuffer {
  const bytes = urlBase64ToUint8Array(base64String);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export default function PushNotificationManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const isPwa =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(isPwa);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsStandalone(false);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setIsDismissed(true);
    };

    checkStandalone();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registerPush = async () => {
      try {
        if (Notification.permission === 'denied') return;

        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
          await saveSubscription(existingSubscription);
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(VAPID_PUBLIC_KEY),
        });

        await saveSubscription(subscription);
        console.log(`✅ Push subscription saved (${APP_NAME})`);
      } catch (err) {
        console.warn('⚠️ Push subscription failed:', err);
      }
    };

    const saveSubscription = async (subscription: PushSubscription) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      await fetch('/api/subscribe-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          appName: APP_NAME,
        }),
      });
    };

    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert('브라우저 메뉴에서 "홈 화면에 추가"를 선택해 앱을 설치해주세요.');
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsDismissed(true);
      }
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (isStandalone || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[120] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-xl backdrop-blur">
      <p className="text-sm font-semibold text-slate-900">앱 설치를 권장합니다</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        푸시 알림을 안정적으로 받으려면 앱을 설치해 주세요.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleInstallClick}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          지금 설치
        </button>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          나중에
        </button>
      </div>
    </div>
  );
}
