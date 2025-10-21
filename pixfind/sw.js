const CACHE_NAME = 'pixfind-cache-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './ogp.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/puzzles/manifest.js',
  './assets/puzzles/manifest.json',
  './assets/puzzles/d1-maousama/original.png',
  './assets/puzzles/d1-maousama/diff.png',
  './assets/puzzles/d2-si-sa-/original.png',
  './assets/puzzles/d2-si-sa-/diff.png',
  './assets/puzzles/d3-tabun-shibuya/original.png',
  './assets/puzzles/d3-tabun-shibuya/diff.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      }).catch(() => cachedResponse);
    })
  );
});
