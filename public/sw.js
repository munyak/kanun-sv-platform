// KaNun Monitoring service worker — basic app-shell cache + offline fallback.
// Bump CACHE_VERSION whenever the shell changes so old caches are evicted.
const CACHE_VERSION = 'kanun-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Skip cross-origin (Supabase, fonts API, etc.) — let the network handle them.
  if (url.origin !== self.location.origin) return;

  // SPA navigations: try network first, fall back to cached shell, then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // Static assets: cache-first, fall back to network and populate the cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname))) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/offline.html'));
    })
  );
});
