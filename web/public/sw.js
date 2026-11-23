// Service worker: shows notifications pushed by the server even when the app is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// A small note of the last push this device received (read by «تشخیص این گوشی» in the bell): when it came and whether it could be shown.
async function noteLastPush(entry) {
  try {
    const c = await caches.open('hoormand-push-log');
    await c.put('/push-log.json', new Response(JSON.stringify(entry), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) {
    /* the note is optional */
  }
}

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { title: 'اعلان جدید', body: event.data ? event.data.text() : '' };
  }
  const note = { at: Date.now(), title: d.title || '', shown: false, error: '' };
  event.waitUntil(
    (async () => {
      await noteLastPush(note);
      // When the app is open and in front, it already plays its own sound and toast.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Safari (iPhone, iPad, Mac) takes the permission away from a worker that receives pushes and shows nothing, so there a notification is ALWAYS shown, even with the app in
      // front. Elsewhere, with the app open and in front it already plays its own sound and card, so nothing more is shown (a test notification is always shown).
      const ua = (self.navigator && self.navigator.userAgent) || '';
      const safari = /iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|CriOS|FxiOS|Android/.test(ua));
      if (!d.test && !safari && wins.some((c) => c.visibilityState === 'visible' && c.focused)) return;
      // Unread count on the app icon (the server sends it with the push).
      try {
        if (typeof d.unread === 'number' && self.navigator && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(d.unread);
      } catch (e) {
        /* the badge is optional */
      }
      try {
        await self.registration.showNotification(d.title || 'اعلان جدید', {
          body: d.body || '',
          tag: d.id,
          lang: 'fa',
          dir: 'rtl',
          icon: '/images/icon-192.png?v=6',
          badge: '/images/icon-192.png?v=6',
          vibrate: [140, 70, 140],
          renotify: true,
          data: d,
        });
      } catch (e) {
        note.error = String(e && e.message ? e.message : e);
        // never stay silent (iPhone takes the permission away from a worker that receives a push and shows nothing)
        try {
          await self.registration.showNotification(d.title || 'اعلان جدید', { body: d.body || '' });
        } catch (e2) {
          note.error += ' / ' + String(e2 && e2.message ? e2.message : e2);
          await noteLastPush(note);
          return;
        }
      }
      note.shown = true;
      await noteLastPush(note);
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
