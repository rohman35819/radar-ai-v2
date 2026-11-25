'use strict';
const SHELL = 'radar-shell-v14';
const FILES = [
  '/', '/index.html', '/app.js', '/top5.js', '/style.css', '/market.html', '/market.js', '/market.css',
  '/trading.html', '/trading.js', '/trading.css',
  '/command.html', '/command.css', '/command.js', '/membership.html', '/membership.js', '/membership.css',
  '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('radar-') && key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // API responses (especially private exchange balances/positions) must never enter persistent Cache Storage.
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  // Keep HTML and app assets in sync with the deployed release. A cache-first
  // response can pair a new index.html with an old app.js, sending new tabs
  // to the default System Health renderer. Use network-first with offline fallback.
  event.respondWith(
    fetch(event.request).then((response) => {
      if (!response || !response.ok) return response;
      return caches.open(SHELL)
        .then((cache) => cache.put(event.request, response.clone()).then(() => response));
    }).catch(async (error) => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw error;
    })
  );
});
