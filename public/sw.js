'use strict';
const SHELL = 'radar-shell-v3', API = 'radar-api-v3';
const FILES = ['/', '/index.html', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== API).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(API).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
  } else e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
});
