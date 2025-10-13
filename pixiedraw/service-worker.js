const SW_PARAMS = new URL(self.location.href);
const BUILD_ID = SW_PARAMS.searchParams.get('v') || 'static';
const CACHE_PREFIX = 'pixieedraw-static';
const CACHE_VERSION = `${CACHE_PREFIX}-${BUILD_ID}`;
const SCOPE_URL = self.registration?.scope || `${self.location.origin}/`;
const OFFLINE_FALLBACK_URL = new URL('./index.html', SCOPE_URL).href;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/pwa.js',
  './assets/icons/menu-canvas.png',
  './assets/icons/tool-cursor.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './ogp.png'
];

const PRECACHE_URLS = APP_SHELL.map(path => new URL(path, SCOPE_URL).href);
const PRECACHE_SET = new Set(PRECACHE_URLS);

function cacheStaticAsset(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return;
  }
  caches.open(CACHE_VERSION).then(cache => cache.put(request, response));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const requestURL = new URL(request.url);
  if (requestURL.origin !== self.location.origin) {
    return;
  }

  const isNavigationRequest =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigationRequest) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          return caches.match(OFFLINE_FALLBACK_URL);
        })
    );
    return;
  }

  if (PRECACHE_SET.has(requestURL.href)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(request).then(response => {
          cacheStaticAsset(request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        cacheStaticAsset(request, response.clone());
        return response;
      })
      .catch(() => caches.match(request))
  );
});
