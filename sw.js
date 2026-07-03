// Network-first service worker: with internet you always get fresh files
// (no stale-cache surprises after a deploy); offline it falls back to the
// last cached copy. Precache bypasses the HTTP cache ({cache:'reload'}).
const CACHE = 'pos-cena-stelle-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './menu.js',
  './db.js',
  './escpos.js',
  './printer.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then(cached => cached || Promise.reject(new Error('offline, not cached')))
      )
  );
});
