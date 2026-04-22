// JamNote Service Worker
// Caches the PWA shell for offline use
// Network-first for API calls, cache-first for static assets

const CACHE_NAME = 'jamnote-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/styles.css',
  '/src/api.js',
  '/src/recorder.js',
  '/src/library.js',
  '/src/settings.js',
  '/src/sync.js',
  '/manifest.json',
];

// Install — cache static shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls: network first, fall back to cached response if available
// - Static assets: cache first, fall back to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses for offline fallback
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});

// Listen for skip waiting message from app update flow
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
