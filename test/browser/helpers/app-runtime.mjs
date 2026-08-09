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

const compactDiagnosticText = (value, maxLength = 320) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const safeDiagnosticUrl = (value) => {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.pathname}${parsed.hash || ""}`;
  } catch {
    return compactDiagnosticText(value, 180);
  }
};

const attachBrowserDiagnostics = (session) => {
  const requests = new Map();
  session.on("Runtime.exceptionThrown", ({ exceptionDetails = {} }) => {
    session.recordDiagnostic({
      kind: "runtime-exception",
      message: compactDiagnosticText(exceptionDetails.exception?.description || exceptionDetails.text || "Runtime exception"),
      url: safeDiagnosticUrl(exceptionDetails.url),
      line: Number(exceptionDetails.lineNumber || 0) + 1,
      column: Number(exceptionDetails.columnNumber || 0) + 1,
    });
  });
  session.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
    if (type !== "error") return;
    session.recordDiagnostic({
      kind: "console-error",
      message: compactDiagnosticText(args.map((item) => item.value ?? item.description ?? "").join(" ")),
    });
  });
  session.on("Log.entryAdded", ({ entry = {} }) => {
    if (!entry.level || !["error", "warning"].includes(entry.level)) return;
    session.recordDiagnostic({
      kind: `log-${entry.level}`,
      message: compactDiagnosticText(entry.text),
      url: safeDiagnosticUrl(entry.url),
    });
  });
  session.on("Network.requestWillBeSent", ({ requestId, request = {} }) => {
    if (requestId) requests.set(requestId, safeDiagnosticUrl(request.url));
  });
  session.on("Network.responseReceived", ({ requestId, response = {} }) => {
    if (Number(response.status || 0) < 400) return;
    session.recordDiagnostic({
      kind: "http-error",
      status: Number(response.status || 0),
      url: safeDiagnosticUrl(response.url || requests.get(requestId)),
    });
  });
  session.on("Network.loadingFailed", ({ requestId, errorText, canceled, type }) => {
    if (canceled) return;
    session.recordDiagnostic({
      kind: "network-failed",
      message: compactDiagnosticText(errorText || "Network loading failed"),
      resourceType: type || "",
      url: requests.get(requestId) || "",
    });
    if (requestId) requests.delete(requestId);
  });
  session.on("Network.loadingFinished", ({ requestId }) => {
    if (requestId) requests.delete(requestId);
  });
};

const readRouteDiagnosticState = (page) => page.evaluate(`(() => {
  const main = document.querySelector("main");
  const alerts = [...document.querySelectorAll("[role='alert']")].map((element) => element.textContent || "").filter(Boolean);
  return {
    readyState: document.readyState,
    pathname: location.pathname,
    heading: main?.querySelector("h1")?.textContent?.replace(/\\s+/g, " ").trim() || "",
    mainPresent: Boolean(main),
    loading: Boolean(document.querySelector("main.loading-screen")),
    alerts: alerts.slice(0, 3).map((text) => text.replace(/\\s+/g, " ").trim().slice(0, 220)),
    mainText: (main?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 260),
  };
})()`);

const routeFailureError = async (page, error, pathname, heading, readySelector = null) => {
  const state = await readRouteDiagnosticState(page).catch((diagnosticError) => ({ diagnosticError: compactDiagnosticText(diagnosticError.message) }));
  const diagnostics = typeof page.getDiagnostics === "function" ? page.getDiagnostics().slice(-12) : [];
  const details = {
    expected: { pathname, heading, readySelector },
    actual: state,
    events: diagnostics,
  };
  return new Error(`${error.message}\nDiagnostik browser: ${JSON.stringify(details, null, 2)}`);
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
    session.send("Log.enable"),
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
  attachBrowserDiagnostics(session);
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

export const waitForAppRoute = async (page, pathname, { heading = null, readySelector = null } = {}) => {
  const expectedPathname = JSON.stringify(pathname);
  const expectedHeading = JSON.stringify(heading);
  const routeMounted = () => page.evaluate(`(() => {
    if (document.readyState !== "complete" || location.pathname !== ${expectedPathname}) return false;
    const main = document.querySelector("main");
    return Boolean(main && !main.classList.contains("loading-screen"));
  })()`);
  const contentReady = () => page.evaluate(`(() => {
    const main = document.querySelector("main");
    if (!main || location.pathname !== ${expectedPathname}) return false;
    const currentHeading = main.querySelector("h1")?.textContent?.replace(/\\s+/g, " ").trim() || "";
    if (${expectedHeading} !== null) return currentHeading === ${expectedHeading};
    return Boolean(currentHeading || main.querySelector("[aria-label='Ringkasan keuangan mobile']"));
  })()`);

  try {
    await waitFor(routeMounted, { description: `route ${pathname} selesai mount` });
    const description = heading
      ? `heading ${heading} tersedia pada route ${pathname}`
      : `konten utama tersedia pada route ${pathname}`;
    await waitFor(contentReady, { description });
    await new Promise((resolve) => setTimeout(resolve, 150));
    await waitFor(contentReady, { description: `${description} dan stabil` });
    if (readySelector) {
      const selector = JSON.stringify(readySelector);
      await waitFor(
        () => page.evaluate(`(() => {
          const element = document.querySelector(${selector});
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })()`),
        { description: `capability ${readySelector} tersedia pada route ${pathname}` },
      );
    }
  } catch (error) {
    throw await routeFailureError(page, error, pathname, heading, readySelector);
  }
};
