const CACHE_VERSION = 'pixiedraw-v2026.04.30-shared-op-replay-cache-bust';
const CORE_ASSETS = [
  '/pixiedraw/',
  '/pixiedraw/index.html',
  '/pixiedraw/manifest.webmanifest',
  '/pixiedraw/assets/css/style.css',
  '/pixiedraw/assets/css/local-extension-runtime.css',
  '/pixiedraw/assets/js/app.js?v=2026.04.30-shared-op-replay-cache-bust',
  '/icon/icon-192-4.png',
  '/icon/icon-512-4.png',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => (
      Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset)))
    ))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key !== CACHE_VERSION)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isNetworkFirstRequest(request, url) {
  if (request.mode === 'navigate') {
    return true;
  }
  if (
    url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.webmanifest')
  ) {
    return true;
  }
  return false;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!request || request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (!url.pathname.startsWith('/pixiedraw/')) {
    return;
  }

  if (isNetworkFirstRequest(request, url)) {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      });
    })
  );
});
