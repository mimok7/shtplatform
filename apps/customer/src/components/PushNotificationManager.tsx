'use client';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

const APP_NAME = 'customer';
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

function isDesktopBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent || '';
  return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

export default function PushNotificationManager() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      if (isDesktopBrowser()) {
        setIsStandalone(true);
        setDeferredPrompt(null);
        return;
      }

      const isPwa =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(isPwa);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      if (isDesktopBrowser()) return;
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
      setShowManualGuide(true);
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

  // 고객 앱에서는 앱 설치 권장 배너 표시하지 않음
  return null;
}

