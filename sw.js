const CACHE = 'cobbai-v4';
const IMMUTABLE_EXTS = /\.(js|css|woff2?|png|svg|ico)(\?.*)?$/;

// Install: skip waiting so new SW activates immediately
self.addEventListener('install', () => self.skipWaiting());

// Activate: delete stale caches from previous versions
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin GET requests; skip API calls
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isImmutable = IMMUTABLE_EXTS.test(url.pathname);

  if (isImmutable) {
    // Cache-first for hashed assets — they never change at the same URL
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        });
      })
    );
  } else {
    // Network-first for HTML and other dynamic resources — always try fresh,
    // fall back to cache when offline
    e.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
