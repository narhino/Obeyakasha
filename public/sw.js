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

// Tell the server what actually happened to a notification on this device —
// "sent" only ever meant the push service took it. Best-effort and silent: a
// failed ack must never break showing the notification or following its link.
function ack(id, kind) {
  if (!id) return Promise.resolve();
  return fetch("/api/push/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: id, event: kind }),
  }).catch(() => {});
}

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
  // A proving push carries a token. Echo it back only AFTER the notification is
  // actually on screen, so what gets recorded is delivery, not merely receipt.
  // This is the one signal the gate trusts — see src/lib/push/verify.ts.
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() =>
        Promise.all([
          ack(data.id, "delivered"),
          data.verifyToken
            ? fetch("/api/push/verify", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ token: data.verifyToken }),
              }).catch(() => {})
            : null,
        ]),
      ),
  );
});

// ── Notification click → focus/open the deep link ───────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.deepLink || "/library";
  event.waitUntil(
    Promise.all([
      ack(data.id, "opened"),
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
    ]),
  );
});
