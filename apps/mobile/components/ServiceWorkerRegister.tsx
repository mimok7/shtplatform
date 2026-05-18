'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '[::1]';

    // 로컬 개발/테스트(localhost)에서는 SW를 항상 제거하여 청크 로딩 충돌을 방지한다.
    if (process.env.NODE_ENV !== 'production' || isLocalhost) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('✅ Service Worker registered (mobile):', registration);
      })
      .catch(error => {
        console.warn('⚠️ Service Worker registration failed (mobile):', error);
      });
  }, []);

  return null;
}
