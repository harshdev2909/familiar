/*
 * Familiar's service worker: only Web Push. It shows the notification the server sends
 * ({ title, body, url }) and, on tap, focuses an open Familiar tab or opens one at that url.
 * No caching, no fetch handler — the app works the same with or without it.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Same-origin paths only: a push can't send anyone off-site. */
function safeUrl(raw) {
  try {
    const url = new URL(raw || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || "Your Familiar is thinking about you";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Come say hi.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "familiar",
      renotify: Boolean(data.tag),
      data: { url: safeUrl(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = windows.find((c) => c.url === url);
      if (exact) return exact.focus();
      const ours = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (ours) {
        await ours.focus();
        return "navigate" in ours ? ours.navigate(url) : undefined;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
