/* Studio service worker — minimal offline shell.
   Strategy: stale-while-revalidate for static assets; network-first for /auth, /agents, etc.
   Don't cache cross-origin requests or POSTs. */

const CACHE = 'studio-shell-v1';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/lead.css', '/lead.js', '/tokens.css', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin static assets → stale-while-revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(cached => {
          const fetchPromise = fetch(req).then(resp => {
            // Only cache successful basic responses
            if (resp && resp.ok && resp.type === 'basic') {
              cache.put(req, resp.clone()).catch(() => {});
            }
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
  // Cross-origin (fonts, api) — pass through unaltered
});
