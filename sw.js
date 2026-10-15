// IGOwork service worker: shows alerts even when the app is closed.

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(self.registration.showNotification(data.title || 'IGOwork', {
    body: data.body || '',
    tag: data.tag || undefined,       // alerts with the same tag replace each other
    renotify: !!data.tag,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Only ever open pages on this same site
  var target = new URL('/', self.location.origin);
  try {
    var u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (u.origin === self.location.origin) target = u;
  } catch (e) {}
  var url = target.href;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
    for (var i = 0; i < wins.length; i++) {
      if (wins[i].url === url && 'focus' in wins[i]) return wins[i].focus();
    }
    for (var j = 0; j < wins.length; j++) {
      if ('navigate' in wins[j] && 'focus' in wins[j]) {
        return wins[j].focus().then(function () { return wins[j].navigate(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});