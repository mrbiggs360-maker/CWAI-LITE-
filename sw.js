// CWAI 1.9 Progressive Web App Service Worker
const CACHE_NAME = 'cwai-v1.9-pwa-cache';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Install: Cache critical core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[CWAI 1.9 SW] Precache skipped for ${asset}:`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[CWAI 1.9 SW] Removing outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Fulfill Chrome offline criteria & serve cached assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Bypass cache for live LLM / AI API endpoints and non-GET methods
  if (
    request.method !== 'GET' ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('openrouter.ai') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('deepseek.com')
  ) {
    return;
  }

  // 2. Navigation requests (HTML document loads)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          // Robust offline fallback: return cached shell
          const cached = await caches.match(request) || await caches.match('./index.html') || await caches.match('./');
          if (cached) return cached;
          
          // Absolute worst-case scenario offline screen
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CWAI 1.9 Offline</title></head><body style="background:#050505;color:#e5e7eb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>CWAI 1.9 is Offline</h2><p>Please check your internet connection.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // 3. Static assets: Cache-first with stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background
        fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              cache.put(request, networkResponse.clone());
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      });
    })
  );
});
