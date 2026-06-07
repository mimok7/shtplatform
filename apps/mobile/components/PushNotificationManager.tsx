'use client';

import { useEffect } from 'react';
import supabase from '@/lib/supabase';

const APP_NAME = 'mobile';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

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

function arrayBuffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

async function getCurrentPushSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: ArrayBuffer
): Promise<PushSubscription | null> {
  const subscription = await registration.pushManager.getSubscription();
  const existingKey = subscription?.options?.applicationServerKey;

  if (subscription && existingKey && !arrayBuffersEqual(existingKey, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => false);
    return null;
  }

  return subscription;
}

function isPushWorkerEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const isLocalhost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]';
  return process.env.NODE_ENV === 'production' && !isLocalhost;
}

function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs = 5000
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return Promise.resolve(registration);

  const worker = registration.installing || registration.waiting;
  if (!worker) return Promise.resolve(registration);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(registration), timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve(registration);
      }
    });
  });
}

async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushWorkerEnabled()) return null;

  const matched = await navigator.serviceWorker.getRegistration('/');
  const registration = matched || await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });

  await registration.update().catch(() => undefined);
  await waitForActiveServiceWorker(registration);

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((resolve) => {
      window.setTimeout(() => resolve(registration), 5000);
    }),
  ]);
}

export default function PushNotificationManager() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!isPushWorkerEnabled()) return;

    const registerPush = async () => {
      try {
        if (Notification.permission === 'denied') return;

        const registration = await ensureServiceWorkerRegistration();
        if (!registration) return;
        const applicationServerKey = toApplicationServerKey(VAPID_PUBLIC_KEY);
        const existingSubscription = await getCurrentPushSubscription(registration, applicationServerKey);
        if (existingSubscription) {
          await saveSubscription(existingSubscription);
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        await saveSubscription(subscription);
      } catch (err) {
      }
    };

    const saveSubscription = async (subscription: PushSubscription) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      // 로그인 세션이 없는 상태에서는 자동 구독 저장을 시도하지 않는다.
      if (!token) return;

      const response = await fetch('/api/subscribe-push', {
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

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || `subscribe failed (${response.status})`);
      }
    };

    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
