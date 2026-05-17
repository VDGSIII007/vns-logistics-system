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
    data: {
      url: payload.url || "/portal.html"
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
