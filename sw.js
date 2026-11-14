// Offline: network first, so all files of an update arrive together; the cache is the fallback without signal.
const CACHE = 'palestra';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'exercises.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  // Per file, so the single-file build (no styles.css/app.js) still installs.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // The backup API is never cached: a stale copy could look like the latest backup.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // no-cache: always revalidate with the server, otherwise the browser's HTTP cache can serve an old file.
  // A 404/500 (e.g. site taken down) also falls back to the saved copy, so the installed app keeps opening.
  const saved = () => caches.match(e.request, { ignoreSearch: true });
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
    if (!r.ok) return saved().then(c => c || r);
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(saved));
});
