const APP_BUILD_VERSION = '2026.07.03-pixieedrawdev-switch-v1';
const CACHE_VERSION = `pixieedrawdev-v${APP_BUILD_VERSION}`;
const CORE_ASSETS = [
  '/PiXiEEDrawDEV/',
  '/PiXiEEDrawDEV/index.html',
  '/PiXiEEDrawDEV/manifest.webmanifest',
  '/PiXiEEDrawDEV/assets/css/style.css',
  '/PiXiEEDrawDEV/assets/css/local-extension-runtime.css',
  '/PiXiEEDrawDEV/assets/js/app.js',
  '/icon/icon-192-4.png',
  '/icon/icon-512-4.png',
  '/icon-e1_frame_01.png',
  '/icon-e1_frame_02.png',
  '/icon-e1_frame_03.png',
  '/icon-e1_frame_04.png',
  '/icon-e1_frame_05.png',
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

function offlineFallbackResponse(request) {
  if (request.mode === 'navigate') {
    return caches.match('/PiXiEEDrawDEV/index.html').then(cached => (
      cached || new Response('PiXiEEDraw is offline.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    ));
  }
  return new Response('', {
    status: 503,
    statusText: 'Service Unavailable',
  });
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
  if (!url.pathname.startsWith('/PiXiEEDrawDEV/')) {
    return;
  }

  if (isNetworkFirstRequest(request, url)) {
    event.respondWith(
      fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {});
        return response;
      }).catch(() => caches.match(request).then(cached => cached || offlineFallbackResponse(request)))
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
      }).catch(() => offlineFallbackResponse(request));
    })
  );
});
