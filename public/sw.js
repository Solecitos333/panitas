const CACHE = 'panitas-pos-__BUILD_ID__';
const SHELL = ['/', '/index.html', '/compat.js', '/manifest.webmanifest', '/logo.png'];
const LOCAL_DEVELOPMENT = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('install', (event) => {
  if (LOCAL_DEVELOPMENT) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  if (LOCAL_DEVELOPMENT) {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('panitas-pos-')).map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
    );
    return;
  }
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('panitas-pos-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (LOCAL_DEVELOPMENT) return;
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  // Instaladores, manifiestos y checksums nunca deben quedar congelados en el SW.
  if (requestUrl.pathname.startsWith('/downloads/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Estrategia Network-First para la página HTML principal
  if (event.request.mode === 'navigate' || event.request.url.endsWith('/') || event.request.url.endsWith('index.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response.ok) return response;
          const copy = response.clone();
          return caches.open(CACHE)
            .then((cache) => cache.put(event.request, copy))
            .then(() => response);
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache first para assets estáticos versionados
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        return caches.open(CACHE)
          .then((cache) => cache.put(event.request, copy))
          .then(() => response);
      });
    })
  );
});
