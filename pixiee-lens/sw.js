const SW_PARAMS = new URL(self.location.href);
const BUILD_VERSION = SW_PARAMS.searchParams.get('v') || 'static';
const CACHE_PREFIX = 'pixiee-lens-cache-v2';
const LEGACY_CACHE_PREFIXES = ['pixiee-lens-cache'];
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './pwa.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-aspect.svg',
  './icon-capture.svg',
  './icon-close-art.svg',
  './icon-dotmode.svg',
  './icon-load-art.svg',
  './icon-resume.svg',
  './icon-setting.svg',
  './icon-stamp.svg',
  './icon-switch-camera.svg',
  './ogp.png',
  './st-megane.png',
  './stamps/st-glass.png',
  './stamps/st-megane.png',
  './stamps/wst-dot.png',
  './stamps/wst-heart.png',
  './stamps/wst-kira.png',
  './stamps/wst-kurabu.png',
  './stamps/wst-sizuku.png',
  './stamps/wst-star.png',
  './stamps/wst-supe.png',
  './stamps/wst-tira.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => {
              if (key === CACHE_NAME) {
                return false;
              }
              if (key.startsWith(CACHE_PREFIX)) {
                return true;
              }
              return LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
            })
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch((error) => {
          if (request.mode === 'navigate' || (request.destination === 'document' && request.mode === 'same-origin')) {
            return caches.match('./index.html');
          }
          return Promise.reject(error);
        });
    })
  );
});
