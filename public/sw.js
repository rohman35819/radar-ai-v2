'use strict';
const SHELL = 'radar-shell-v7';
const FILES = [
  '/', '/index.html', '/app.js', '/style.css',
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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
