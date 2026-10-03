// Offline play (car trips, planes): cache the app shell on install, then serve
// cache-first and refresh in the background. Bump VERSION when files change.
const VERSION = 'pict-v4';
const SHELL = ['./', './index.html', './css/app.css?v=4', './js/words.js?v=4', './js/characters.js?v=4',
  './js/draw.js?v=4', './js/app.js?v=4', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png',
  './fonts/marcellus.woff2', './fonts/jost-300.woff2', './fonts/jost-400.woff2', './fonts/jost-500.woff2', './fonts/jost-600.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const fresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
