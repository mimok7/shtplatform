// Service Worker for PWA offline support + Web Push (admin)
const CACHE_NAME = 'sht-admin-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/icon-192.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' ||
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then(response => response || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        return caches.match('/') || new Response('Offline - please check connection');
      });
    })
  );
});

// Push event - 백그라운드 푸시 알림 수신
self.addEventListener('push', event => {
  let data = { title: '스테이하롱 관리자 알림', body: '새 알림이 도착했습니다', url: '/admin' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || 'sht-admin-notification',
      data: { url: data.url || '/admin' },
      requireInteraction: data.requireInteraction || false
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/admin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(targetUrl);
    })
  );
});
