'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // dev 환경에서는 SW가 라우팅/HMR 요청을 가로채지 않도록 등록 해제한다.
    if (process.env.NODE_ENV !== 'production') {
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
