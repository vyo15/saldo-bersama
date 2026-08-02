const STATIC_CACHE = "saldo-bersama-static-v6";
const RUNTIME_CACHE = "saldo-bersama-runtime-v6";
const STATIC_ASSETS = [
  "/",
  "/site.webmanifest",
  "/brand/saldo-bersama-mark.png",
  "/icons/favicon-32.png?v=4",
  "/icons/favicon-64.png?v=4",
  "/icons/icon-192.png?v=4",
  "/icons/icon-512.png?v=4"
];

const cacheResponse = (event, cacheName, request, response) => {
  if (!response?.ok || response.bodyUsed) return;
  let copy;
  try { copy = response.clone(); } catch { return; }
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => cache.put(request, copy))
      .catch(() => {}),
  );
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        cacheResponse(event, RUNTIME_CACHE, "/", response);
        return response;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  if (!["script", "style", "font", "image", "manifest"].includes(request.destination)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    cacheResponse(event, RUNTIME_CACHE, request, response);
    return response;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(payload.title || "Saldo Bersama", {
    body: payload.body || "Ada pembaruan yang perlu diperiksa.",
    icon: "/icons/icon-192.png?v=4",
    badge: "/icons/favicon-64.png?v=4",
    tag: payload.notificationId || undefined,
    renotify: false,
    data: { targetPath: payload.targetPath || "/" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.targetPath || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(targetUrl); return existing.focus(); }
    return self.clients.openWindow(targetUrl);
  }));
});
