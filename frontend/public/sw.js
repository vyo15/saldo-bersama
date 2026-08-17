const STATIC_CACHE = "saldo-bersama-static-v8";
const RUNTIME_CACHE = "saldo-bersama-runtime-v8";
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

const isLocalHostname = (hostname) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);

const isInfrastructurePath = (pathname) => pathname === "/api"
  || pathname.startsWith("/api/")
  || pathname === "/__/auth"
  || pathname.startsWith("/__/auth/");

const isHtmlResponse = (response) => String(response?.headers?.get("content-type") || "")
  .toLowerCase()
  .includes("text/html");

const safeTargetPath = (value) => {
  const candidate = String(value || "/").trim();
  if (candidate.length > 200 || !/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(candidate) || candidate.includes("\\")) return "/";
  return candidate;
};

const notificationCopy = (type) => type === "test"
  ? { title: "Saldo Bersama", body: "Notifikasi uji berhasil diterima oleh perangkat ini." }
  : { title: "Saldo Bersama", body: "Ada pengingat keuangan yang perlu diperiksa di aplikasi." };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("saldo-bersama-") && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
      .map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || isInfrastructurePath(url.pathname)) return;
  if (isLocalHostname(url.hostname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (isHtmlResponse(response)) cacheResponse(event, RUNTIME_CACHE, "/", response);
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
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  const copy = notificationCopy(String(payload.notificationType || ""));
  const notificationId = String(payload.notificationId || "").slice(0, 120) || undefined;
  event.waitUntil(self.registration.showNotification(copy.title, {
    body: copy.body,
    icon: "/icons/icon-192.png?v=4",
    badge: "/icons/favicon-64.png?v=4",
    tag: notificationId,
    renotify: false,
    data: { targetPath: safeTargetPath(payload.targetPath) }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = safeTargetPath(event.notification.data?.targetPath);
  const targetUrl = new URL(targetPath, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(targetUrl); return existing.focus(); }
    return self.clients.openWindow(targetUrl);
  }));
});
