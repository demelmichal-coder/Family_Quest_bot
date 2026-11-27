/* eslint-disable no-restricted-globals */
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

precacheAndRoute(self.__WB_MANIFEST);

// Offline: aplikacni shell se otevre i bez signalu (SPA navigace -> index.html z precache).
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//] }));

// Offline: GET odpovedi API se ukladaji. Pri vypadku site se ukazou posledni nactena data.
// Zapisy (POST/PUT/DELETE) se necachuji - offline selzou a aplikace to ukaze uzivateli.
// Cache se maze pri odhlaseni (src/utils/offlineCache.js).
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "fq-api-cache",
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Family Quest", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Family Quest", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
