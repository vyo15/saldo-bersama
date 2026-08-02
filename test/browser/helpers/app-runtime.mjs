import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChromiumBinary } from "./browser-binary.mjs";
import { CdpSession, waitFor } from "./cdp.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const distDir = join(rootDir, "frontend", "dist");
const chromiumBinary = resolveChromiumBinary();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
};

const findFreePort = () => new Promise((resolvePort, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-request-id": "browser-test-request",
  });
  response.end(JSON.stringify(body));
};

const readRequestBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

export const startBrowserAppServer = async ({ session = null, gatewayResponses = {} } = {}) => {
  await stat(join(distDir, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/api/session") {
        if (request.method === "POST") {
          const body = await readRequestBody(request);
          if (body.action === "logout") {
            sendJson(response, 200, { ok: true, data: { loggedOut: true } });
            return;
          }
        }
        if (!session) {
          sendJson(response, 401, { ok: false, error: { code: "UNAUTHENTICATED", message: "Sesi belum tersedia." } });
          return;
        }
        sendJson(response, 200, { ok: true, data: session });
        return;
      }
      if (requestUrl.pathname === "/api/gateway") {
        const body = await readRequestBody(request);
        const responseValue = gatewayResponses[body.action];
        if (responseValue === undefined) {
          sendJson(response, 400, { ok: false, error: { code: "UNKNOWN_ACTION", message: `Fixture belum menyediakan ${body.action}.` } });
          return;
        }
        const data = typeof responseValue === "function" ? await responseValue(body.payload || {}, body) : responseValue;
        sendJson(response, 200, { ok: true, data });
        return;
      }
      if (requestUrl.pathname.startsWith("/api/")) {
        sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "Endpoint tidak tersedia pada browser test." } });
        return;
      }

      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const candidate = resolve(distDir, relativePath || "index.html");
      const relativeCandidate = relative(distDir, candidate);
      const insideDist = relativeCandidate === "" || (!relativeCandidate.startsWith("..") && !isAbsolute(relativeCandidate));
      let filePath = insideDist ? candidate : join(distDir, "index.html");
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
      } catch {
        filePath = join(distDir, "index.html");
      }
      const content = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      });
      response.end(content);
    } catch (error) {
      sendJson(response, 500, { ok: false, error: { code: "TEST_SERVER_ERROR", message: error.message } });
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
};

const waitForChildExit = (child, timeoutMs) => new Promise((resolveExit) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    resolveExit(true);
    return;
  }
  let timer;
  const cleanup = () => {
    child.off("exit", onExit);
    if (timer) clearTimeout(timer);
  };
  const onExit = () => {
    cleanup();
    resolveExit(true);
  };
  child.once("exit", onExit);
  timer = setTimeout(() => {
    cleanup();
    resolveExit(false);
  }, timeoutMs);
  timer.unref?.();
});

const terminateChromiumTree = (child, { force = false } = {}) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    if (force) spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try { process.kill(-child.pid, signal); }
  catch { child.kill(signal); }
};

export const startChromium = async () => {
  if (!chromiumBinary) {
    throw new Error("Browser Chromium tidak ditemukan. Instal Google Chrome, Microsoft Edge, atau Brave; atau atur CHROMIUM_BIN ke executable browser.");
  }
  const debuggingPort = await findFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "saldo-bersama-chromium-"));
  const child = spawn(chromiumBinary, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-sandbox",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  let spawnError = null;
  child.once("error", (error) => { spawnError = error; });

  try {
    await waitFor(async () => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Chromium berhenti (${child.exitCode}).`);
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).catch(() => null);
      return response?.ok ? response.json() : null;
    }, { timeoutMs: 15_000, description: "Chromium DevTools" });
    return {
      debuggingPort,
      close: async () => {
        terminateChromiumTree(child);
        const exited = await waitForChildExit(child, 2_000);
        if (!exited) {
          terminateChromiumTree(child, { force: true });
          await waitForChildExit(child, 2_000);
        }
        child.unref();
        await rm(userDataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    terminateChromiumTree(child, { force: true });
    await waitForChildExit(child, 2_000);
    child.unref();
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
};

export const openBrowserPage = async (debuggingPort, url, {
  width = 390,
  height = 844,
  googleLoginMock = false,
} = {}) => {
  const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
  assert.equal(response.ok, true, "Chrome harus dapat membuat tab test.");
  const target = await response.json();
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await Promise.all([
    session.send("Page.enable"),
    session.send("Runtime.enable"),
    session.send("Accessibility.enable"),
    session.send("Network.enable"),
    session.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
      screenWidth: width,
      screenHeight: height,
    }),
  ]);
  await session.send("Network.setBlockedURLs", { urls: ["*://accounts.google.com/gsi/client*"] });
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      if (navigator.serviceWorker) navigator.serviceWorker.register = async () => null;
      ${googleLoginMock ? `Object.defineProperty(window, "google", { configurable: true, value: { accounts: { id: { __saldoBersamaSmokeMock: true, initialize() {}, renderButton(element) { const button = document.createElement("button"); button.type = "button"; button.textContent = "Lanjutkan dengan Google"; button.setAttribute("aria-label", "Masuk menggunakan Google"); element.replaceChildren(button); } } } } });` : ""}
    `,
  });
  await session.send("Page.navigate", { url });
  await waitFor(
    () => session.evaluate("document.readyState === 'complete' && Boolean(document.querySelector('main'))"),
    { description: "halaman aplikasi selesai dirender" },
  );
  return session;
};

export const setViewport = (page, width, height) => page.send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 600,
  screenWidth: width,
  screenHeight: height,
});

export const waitForAppRoute = async (page, pathname, { heading = null } = {}) => {
  const expectedPathname = JSON.stringify(pathname);
  const expectedHeading = JSON.stringify(heading);
  const routeReady = () => page.evaluate(`(() => {
    if (document.readyState !== "complete" || location.pathname !== ${expectedPathname}) return false;
    if (document.querySelector("main.loading-screen")) return false;
    const currentHeading = document.querySelector("main h1")?.textContent?.trim() || "";
    if (${expectedHeading} !== null) return currentHeading === ${expectedHeading};
    return Boolean(currentHeading || document.querySelector("main [aria-label='Ringkasan keuangan mobile']"));
  })()`);
  const description = `route ${pathname}${heading ? ` dengan heading ${heading}` : ""} stabil`;
  await waitFor(routeReady, { description });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await waitFor(routeReady, { description });
};
