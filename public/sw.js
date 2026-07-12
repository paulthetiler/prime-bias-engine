// PrimeBias service worker — enables install + basic offline.
const CACHE = 'primebias-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests — never touch the Base44 API or other hosts.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first (always fresh when online), fall back to cache/root offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); return res; })
        .catch(() => caches.match(req).then(m => m || caches.match('/')))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const c = res.clone();
            caches.open(CACHE).then(ca => ca.put(req, c));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
