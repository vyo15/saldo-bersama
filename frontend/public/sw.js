const STATIC_CACHE = "saldo-bersama-static-v4";
const RUNTIME_CACHE = "saldo-bersama-runtime-v4";
const STATIC_ASSETS = [
  "/",
  "/site.webmanifest",
  "/brand/saldo-bersama-mark.png",
  "/icons/favicon-32.png?v=4",
  "/icons/favicon-64.png?v=4",
  "/icons/icon-192.png?v=4",
  "/icons/icon-512.png?v=4",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Service worker production tidak boleh mengintersep development lokal.
  // Ini mencegah module Vite lama tersimpan dan memicu respons 504 Outdated Request.
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && ["script", "style", "font", "image", "manifest"].includes(request.destination)) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() }; }
  const title = payload.title || "Saldo Bersama";
  const options = {
    body: payload.body || "Ada pembaruan yang perlu diperiksa.",
    icon: "/icons/icon-192.png?v=4",
    badge: "/icons/favicon-64.png?v=4",
    tag: payload.notificationId || undefined,
    renotify: false,
    data: { targetPath: payload.targetPath || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.targetPath || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
