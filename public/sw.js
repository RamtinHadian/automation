// Service worker: shows notifications pushed by the server even when the app is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: 'اعلان جدید', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // When the app is open and in front, it already plays its own sound and toast.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((c) => c.visibilityState === 'visible' && c.focused)) return;
      await self.registration.showNotification(d.title || 'اعلان جدید', {
        body: d.body || '',
        tag: d.id,
        lang: 'fa',
        dir: 'rtl',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [140, 70, 140],
        renotify: true,
        data: d,
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = wins[0];
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-notification', data: event.notification.data });
      } else {
        await self.clients.openWindow('/');
      }
    })()
  );
});
