'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('✅ Service Worker registered (customer):', registration);
        })
        .catch(error => {
          console.warn('⚠️ Service Worker registration failed (customer):', error);
        });
    }
  }, []);

  return null;
}
