// Service Worker for PWA offline support - mobile
const CACHE_NAME = 'sht-mobile-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/logo.png',
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

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) {
          return response;
        }
        
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
  let data = { title: '스테이하롱 알림', body: '새 알림이 도착했습니다', url: '/manager/dashboard' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/logo.png',
      badge: data.badge || '/logo.png',
      tag: data.tag || 'sht-notification',
      data: { url: data.url || '/manager/dashboard' },
      requireInteraction: data.requireInteraction || false
    })
  );
});

// Notificationclick event - 알림 클릭 시 앱 포커스 또는 열기
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/manager/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(targetUrl);
    })
  );
});
