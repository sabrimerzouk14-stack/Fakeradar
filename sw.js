const CACHE = 'skyview-v1';
const TILES_CACHE = 'skyview-tiles-v1';

// Fichiers app à cacher
const APP_FILES = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== TILES_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Tiles carte → cache réseau-first puis cache
  if (url.hostname.includes('cartocdn') || url.hostname.includes('openstreetmap')) {
    e.respondWith(
      caches.open(TILES_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const resp = await fetch(e.request);
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // App shell → cache-first
  if (APP_FILES.some(f => url.pathname === f || url.pathname === '/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Tout le reste (API) → réseau only
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
