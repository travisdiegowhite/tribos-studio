// =============================================================================
// PUSH-ONLY SERVICE WORKER — tribos.studio
// =============================================================================
// IMPORTANT: This SW handles push notifications ONLY.
// DO NOT add fetch event listeners, precaching, or route interception.
// DO NOT import Workbox or any caching library.
//
// History: A precaching SW caused an 18-hour production outage on March 13, 2026.
// See docs/postmortem-2026-03-13-cloudflare-pwa-outage.md for details.
// =============================================================================

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('Failed to parse push data:', e);
    return;
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: data.url || '/dashboard' },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'tribos.studio', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If Tribos is already open in a tab, focus it and navigate
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Otherwise open a new window
        return clients.openWindow?.(url);
      })
  );
});
