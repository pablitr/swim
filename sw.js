// Service Worker for SwimCoach Tracker PWA
// Provides offline capability via Cache-First strategy for static assets.

const CACHE_NAME = 'swimcoach-v5';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/reset.css',
  './css/variables.css',
  './css/styles.css',
  './js/storage/db.js',
  './js/storage/repository.js',
  './js/timing/timer-engine.js',
  './js/timing/ticker.js',
  './js/analytics/zones.js',
  './js/analytics/stats.js',
  './js/analytics/pace-calculator.js',
  './js/ui/swimmer-card.js',
  './js/ui/boxplot-svg.js',
  './js/ui/modal.js',
  './js/ui/metrics-modal.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Safely precache available assets without failing if some module is not yet present
      const cachePromises = PRECACHE_URLS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch {
          // In offline or early build phase, skip missing resources
        }
      });
      await Promise.all(cachePromises);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle caching
  event.respondWith(
    (async () => {
      // 1. Try cache
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Fetch from network
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      } catch (error) {
        // 3. Fallback for navigation requests when offline
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('./index.html') || await caches.match('/');
          if (fallback) {
            return fallback;
          }
        }
        throw error;
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
