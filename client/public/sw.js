// v5.1: network-only worker. Never serve stale app files after a deployment.
const VERSION = 'chitraguess-network-v5-1';
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Let the browser/network fetch the latest HTML and hashed Vite assets.
  event.respondWith(fetch(event.request));
});
