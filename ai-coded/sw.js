const CACHE_NAME = 'bucket-counter-cache-v2';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
  // Icons are not strictly necessary to cache; add if desired: './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))
      )
    )
  );
});

// Network-first for navigations and core files, cache-first for others
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isHtmlRequest = request.mode === 'navigate' ||
    (request.headers.get('Accept') || '').includes('text/html');
  const url = new URL(request.url);
  const isCoreAsset = isHtmlRequest || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.js');

  if (isCoreAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached)
    )
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});


