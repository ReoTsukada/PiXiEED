const SW_PARAMS = new URL(self.location.href);
const BUILD_ID = SW_PARAMS.searchParams.get('v') || 'static';
const CACHE_PREFIX = 'maoitu-static';
const CACHE_VERSION = `${CACHE_PREFIX}-${BUILD_ID}`;
const SCOPE_URL = self.registration?.scope || `${self.location.origin}/maoitu/`;
const OFFLINE_FALLBACK_URL = new URL('index.html', SCOPE_URL).href;

const PRECACHE_PATHS = [
  '/maoitu/',
  '/maoitu/index.html',
  '/maoitu/game.html',
  '/maoitu/manifest.webmanifest',
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

const PRECACHE_URLS = PRECACHE_PATHS.map(path => new URL(path, self.location.origin).href);
const PRECACHE_SET = new Set(PRECACHE_URLS);

function cacheResponse(request, response) {
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
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/maoitu/')) {
    return;
  }

  const isNavigationRequest =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigationRequest) {
    event.respondWith(
      fetch(request)
        .then(response => {
          cacheResponse(request, response.clone());
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match(OFFLINE_FALLBACK_URL);
        })
    );
    return;
  }

  if (PRECACHE_SET.has(url.href)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          cacheResponse(request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        cacheResponse(request, response.clone());
        return response;
      })
      .catch(() => caches.match(request))
  );
});
