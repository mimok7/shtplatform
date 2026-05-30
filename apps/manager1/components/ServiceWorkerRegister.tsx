'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const isDev = process.env.NODE_ENV !== 'production' || isLocalHost;

    if (isDev) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => {
          if ('caches' in window) {
            return caches.keys().then((keys) =>
              Promise.all(
                keys
                  .filter((key) => key.startsWith('sht-manag-cache'))
                  .map((key) => caches.delete(key))
              )
            );
          }
          return undefined;
        })
        .then(() => {
          console.log('ℹ️ Service Worker disabled in dev (manager1)');
        })
        .catch((error) => {
          console.warn('⚠️ Service Worker cleanup failed in dev (manager1):', error);
        });
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered (manager1):', registration);
      })
      .catch((error) => {
        console.warn('⚠️ Service Worker registration failed (manager1):', error);
      });
  }, []);

  return null;
}
