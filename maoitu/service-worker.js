const CACHE_NAME = 'maoitu-cache-v1';
const ASSETS = [
  '/maoitu/',
  '/maoitu/index.html',
  '/maoitu/game.html',
  '/maoitu/manifest.webmanifest',
  '/maoitu/service-worker.js',
  '/maoitu/bgm.mp3',
  '/maoitu/ogp.png',
  '/maoitu/assets/player.svg',
  '/maoitu/assets/angel.svg',
  '/maoitu/assets/enemy-purple.svg',
  '/maoitu/assets/enemy-blue.svg',
  '/maoitu/assets/enemy-green.svg',
  '/maoitu/assets/enemy-red.svg',
  '/maoitu/icons/icon-192.png',
  '/maoitu/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/maoitu/')) return;

  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
    ).catch(() => caches.match('/maoitu/game.html'))
  );
});
