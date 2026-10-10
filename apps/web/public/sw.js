/* Northstar VPN — minimal service worker for installability.
 * Network-only: no offline caching. Keeps Chromium install criteria
 * satisfied without changing fetch behaviour. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* Intentionally empty — browser uses default network behaviour. */
});
