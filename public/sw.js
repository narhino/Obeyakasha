/*
 * OBEY AKASHA — service worker (PLAN §11/§12).
 * Handles web push + notification clicks and a minimal app-shell cache.
 * Deliberately hand-authored (no build step) so it stays legible and stable.
 */
const CACHE = "akasha-shell-v1";
// Only the public landing shell; auth-gated pages are always network-first.
const SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigations (fresh content), fall back to cached shell offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept audio streams or API calls.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/stream"))
    return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
  }
});

// ── Push ───────────────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "AKASHA", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AKASHA";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/badge.png",
    tag: data.tag,
    data: { deepLink: data.deepLink || "/library", id: data.id },
    vibrate: [40, 30, 40],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click → focus/open the deep link ───────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.deepLink) || "/library";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target).catch(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
