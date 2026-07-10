const CACHE_NAME = 'delay-audio-player-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        const cache = caches.open(CACHE_NAME);
        return cache.then((cacheStore) => {
          cacheStore.put(event.request, copy);
          return response;
        });
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
