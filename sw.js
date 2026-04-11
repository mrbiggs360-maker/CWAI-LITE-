const CACHE_NAME = 'cwai-lite-v1.6.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Install Event: Cache essential files for basic offline loading
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate Event: Clean up old caches if the version changes
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
  // Claim control instantly
  self.clients.claim();
});

// Fetch Event: Network First strategy (Fallback to cache)
self.addEventListener('fetch', event => {
  // Do not try to cache API calls to generative AI models OR the local Node.js backend
  if (event.request.url.includes('generativelanguage.googleapis.com') || 
      event.request.url.includes('localhost:3000')) {
    return;
  }

  // Also skip caching for our Google favicon internet check
  if (event.request.url.includes('favicon.ico')) {
      return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      // If the network fails, pull the matched item from the cache
      return caches.match(event.request);
    })
  );
});
