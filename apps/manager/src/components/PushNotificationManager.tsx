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
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await saveSubscription(subscription);
        console.log('✅ Push subscription saved (manager)');
      } catch (err) {
        console.warn('⚠️ Push subscription failed:', err);
      }
    };

    const saveSubscription = async (subscription: PushSubscription) => {
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
          appName: 'manager',
        }),
      });
    };

    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
