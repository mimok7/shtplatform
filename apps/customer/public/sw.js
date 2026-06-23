// Service Worker for PWA offline support
const CACHE_NAME = 'sht-customer-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/sht-2.png',
  '/offline.html'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Silently ignore if offline during install
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests and external requests
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isNextAsset = requestUrl.pathname.startsWith('/_next/');
  const isHtmlNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';

  if (isNextAsset) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || isHtmlNavigation) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(async () => {
        if (isHtmlNavigation) {
          return (await caches.match('/offline.html')) || (await caches.match('/')) || new Response('Offline - please check connection');
        }

        return caches.match(event.request) || new Response('Offline - please check connection');
      })
  );
});

// Push event - 백그라운드 푸시 알림 수신
self.addEventListener('push', event => {
  let data = { title: '스테이하롱 알림', body: '새 알림이 도착했습니다', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/sht-2.png',
      badge: data.badge || '/sht-2.png',
      tag: data.tag || 'sht-notification',
      data: { url: data.url || '/' },
      requireInteraction: data.requireInteraction || false
    })
  );
});

// Notificationclick event - 알림 클릭 시 앱 포커스 또는 열기
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(targetUrl);
    })
  );
});
