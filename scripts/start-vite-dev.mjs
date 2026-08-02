import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureDevelopmentEnvironment } from "./bootstrap-development-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await ensureDevelopmentEnvironment({ projectRoot });
const frontendRoot = path.join(projectRoot, "frontend");
const rawPort = String(process.env.PORT || "5173").trim();
const port = Number(rawPort);
const host = "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`PORT tidak valid untuk development lokal: ${rawPort}`);
  process.exit(1);
}

const requireFromFrontend = createRequire(path.join(frontendRoot, "package.json"));
const viteEntry = requireFromFrontend.resolve("vite");
const { createServer: createViteServer, loadEnv } = await import(pathToFileURL(viteEntry).href);

const localEnvironment = loadEnv("development", projectRoot, "");
for (const [key, value] of Object.entries(localEnvironment)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
process.env.NODE_ENV ||= "development";
process.env.VERCEL_ENV ||= "development";

const { logEvent, runtimeBuildInfo } = await import(new URL("../api/_lib/observability.js", import.meta.url));

const routeModules = Object.freeze({
  "/api/session": "../api/session.js",
  "/api/gateway": "../api/gateway.js",
  "/api/health": "../api/health.js",
  "/api/export": "../api/export.js",
  "/api/jobs": "../api/jobs.js",
});
const routeHandlers = new Map();

const DEV_STORAGE_RESET_COOKIE = "sb_dev_storage_reset=v1";

const hasDevStorageResetCookie = (request) => String(request.headers.cookie || "")
  .split(";")
  .map((value) => value.trim())
  .includes(DEV_STORAGE_RESET_COOKIE);

const isHtmlNavigationRequest = (request) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) return false;
  const accept = String(request.headers.accept || '');
  return request.headers['sec-fetch-mode'] === 'navigate' || accept.includes('text/html');
};

const sendDevStorageReset = (response, targetUrl) => {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Clear-Site-Data", '"cache", "storage"');
  response.setHeader("Set-Cookie", `${DEV_STORAGE_RESET_COOKIE}; Path=/; SameSite=Lax`);
  response.end(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Menyiapkan Saldo Bersama</title></head><body><p>Membersihkan cache development lama…</p><script>location.replace(${JSON.stringify(targetUrl)});</script></body></html>`);
};

const loadRouteHandler = async (pathname) => {
  if (routeHandlers.has(pathname)) return routeHandlers.get(pathname);
  const modulePath = routeModules[pathname];
  if (!modulePath) return null;
  const module = await import(new URL(modulePath, import.meta.url));
  if (typeof module.default !== "function") throw new Error(`Handler lokal tidak valid: ${pathname}`);
  routeHandlers.set(pathname, module.default);
  return module.default;
};

const sendJsonError = (response, status, code, message) => {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ ok: false, error: { code, message } }));
};

const isAllowedHost = (value) => {
  const hostHeader = String(value || "").toLowerCase();
  return hostHeader === `localhost:${port}`
    || hostHeader === `127.0.0.1:${port}`
    || hostHeader === `[::1]:${port}`;
};

let viteServer;
const httpServer = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (!isAllowedHost(request.headers.host)) {
    return sendJsonError(response, 403, "HOST_DENIED", "Host development tidak diizinkan.");
  }

  const requestUrl = new URL(request.url || "/", `http://localhost:${port}`);
  if (isHtmlNavigationRequest(request) && !hasDevStorageResetCookie(request)) {
    return sendDevStorageReset(response, `${requestUrl.pathname}${requestUrl.search}`);
  }

  if (request.headers.host?.startsWith("127.0.0.1:") && ["GET", "HEAD"].includes(request.method || "GET")) {
    response.statusCode = 307;
    response.setHeader("Location", `http://localhost:${port}${requestUrl.pathname}${requestUrl.search}`);
    return response.end();
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    try {
      const handler = await loadRouteHandler(requestUrl.pathname);
      if (!handler) return sendJsonError(response, 404, "API_NOT_FOUND", "Endpoint API tidak ditemukan.");
      return await handler(request, response);
    } catch (error) {
      logEvent("error", "local.api.unhandled", {
        route: requestUrl.pathname,
        method: request.method,
        code: error?.code || "LOCAL_API_ERROR",
        status: error?.status || 500,
      });
      return sendJsonError(response, 500, "LOCAL_API_ERROR", "API lokal tidak dapat memproses permintaan.");
    }
  }

  // Cegah respons 304 menggabungkan HTML Vite dengan header CSP lama dari
  // server development sebelumnya. CSP production memblokir React Refresh sebelum
  // aplikasi sempat membersihkan cache dan service worker development.
  delete request.headers["if-none-match"];
  delete request.headers["if-modified-since"];

  return viteServer.middlewares(request, response, (error) => {
    if (error) {
      viteServer.ssrFixStacktrace(error);
      console.error(`[vite] ${error?.message || "unknown error"}`);
      if (!response.headersSent) response.statusCode = 500;
      return response.end("Development server error.");
    }
    if (!response.writableEnded) {
      response.statusCode = 404;
      response.end("Not found.");
    }
  });
});

viteServer = await createViteServer({
  root: frontendRoot,
  configFile: path.join(frontendRoot, "vite.config.js"),
  appType: "spa",
  server: {
    middlewareMode: true,
    hmr: { server: httpServer },
    headers: {
      "Cache-Control": "no-store",
    },
  },
});

await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(port, host, resolve);
});

const runtimeConfiguration = Object.freeze({
  databaseConfigured: Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN),
  googleBridgeConfigured: Boolean(process.env.GOOGLE_BRIDGE_WEB_APP_URL && process.env.GOOGLE_BRIDGE_SHARED_SECRET),
  scheduledJobsConfigured: Boolean(process.env.JOBS_SHARED_SECRET),
});
console.log(`\n  Saldo Bersama lokal siap di http://localhost:${port}`);
console.log("  Frontend dan lima endpoint /api berjalan dalam satu proses. Tekan Ctrl+C untuk berhenti.");
console.log(`  Turso: ${runtimeConfiguration.databaseConfigured ? "set" : "MISSING"}; Google bridge: ${runtimeConfiguration.googleBridgeConfigured ? "set/optional" : "not configured"}`);
console.log("  Diagnostik aman: npm run diagnose\n");
logEvent("info", "local.server.started", {
  port,
  host,
  runtimeConfiguration,
  build: runtimeBuildInfo(),
});

let closing = false;
const closeServer = async () => {
  if (closing) return;
  closing = true;
  logEvent("info", "local.server.stopping", { port, host });
  await Promise.allSettled([
    viteServer.close(),
    new Promise((resolve) => httpServer.close(resolve)),
  ]);
  process.exit(0);
};

process.once("SIGINT", () => void closeServer());
process.once("SIGTERM", () => void closeServer());
