/* Minimal offline-friendly service worker. Caches the shell + the
 * currently-viewed invitation so a guest who lost connection can still
 * read the details. */
const CACHE = 'wedcard-v1';
const SHELL = ['/manifest.json', '/css/landing.css', '/assets/default-hero.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // never cache API

  // Network-first for invitation pages and HTML; cache-first for assets
  const isHtml = req.headers.get('accept')?.includes('text/html');
  if (isHtml) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return r;
      }))
    );
  }
});
