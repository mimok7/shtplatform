'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const clearStaleServiceWorkerState = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => undefined)));

      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name).catch(() => false)));
    };

    if (process.env.NODE_ENV !== 'production') {
      void clearStaleServiceWorkerState();
      return;
    }

    navigator.serviceWorker
      .register('/sw.js?v=20260620-2')
      .then(registration => {
        console.log('✅ Service Worker registered (customer):', registration);
        void registration.update().catch(() => undefined);
      })
      .catch(error => {
        console.warn('⚠️ Service Worker registration failed (customer):', error);
      });
  }, []);

  return null;
}
