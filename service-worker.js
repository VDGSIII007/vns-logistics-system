"use strict";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

function pushPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch (error) {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", event => {
  const payload = pushPayload(event);
  if (!payload) return;

  const title = payload.title || "VNS Portal";
  const options = {
    body: payload.body || "New item needs attention",
    // Unique tag → each paid item shows as its own notification in the OS tray
    // instead of collapsing into one. Falls back to a timestamped tag.
    tag:  payload.tag || ("vns-" + Date.now()),
    // `renotify` makes the OS re-alert even when a notif with the same tag exists
    renotify: true,
    timestamp: payload.timestamp || Date.now(),
    data: {
      url:    payload.url    || "/mobile/payment?tab=paid",
      module: payload.data?.module || payload.module || null,
      ref:    payload.data?.ref    || payload.ref    || null,
      target: payload.data?.target || payload.target || null,
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/portal.html", self.location.origin).href;
  const target = new URL(targetUrl);

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientList) {
      if ("focus" in client && client.url === targetUrl) return client.focus();
    }
    for (const client of clientList) {
      if ("focus" in client) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname === target.pathname) {
          if ("navigate" in client) {
            const navigated = await client.navigate(targetUrl);
            return navigated ? navigated.focus() : client.focus();
          }
          return client.focus();
        }
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
