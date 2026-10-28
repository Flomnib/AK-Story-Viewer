/* Offline shell + serves downloaded story data from Cache Storage. Bump VERSION when app files change. */
const VERSION = 'v5';
const SHELL = 'ak-shell-' + VERSION;
const DATA = 'ak-data-v1';
const FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './asset-index.json', './reading-order.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ak-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // App files: network first (so updates show up right away), cache when offline or slow.
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const cached = () => c.match(req, { ignoreSearch: true }).then(h => h || (req.mode === 'navigate' ? c.match('./index.html') : null));
      try {
        const r = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
        if (r.ok) { c.put(req, r.clone()); return r; }
        return (await cached()) || r;
      } catch {
        return (await cached()) || new Response('Offline', { status: 503 });
      }
    })());
  } else if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith(caches.open(DATA).then(c => c.match(req)).then(hit => hit || fetch(req)));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
