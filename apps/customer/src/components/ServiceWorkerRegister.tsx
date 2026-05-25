'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Dev에서는 기존 SW 캐시가 최신 번들과 충돌할 수 있으므로 등록하지 않는다.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
          reg.unregister().catch(() => {
            // noop
          });
        });
      });
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('✅ Service Worker registered (customer):', registration);
      })
      .catch(error => {
        console.warn('⚠️ Service Worker registration failed (customer):', error);
      });
  }, []);

  return null;
}
