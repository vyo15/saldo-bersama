import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveChromiumBinary } from "./helpers/browser-binary.mjs";
import { CdpSession, waitFor } from "./helpers/cdp.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
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
  });
  response.end(JSON.stringify(body));
};

const startAppServer = async () => {
  await stat(join(distDir, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/api/session") {
        sendJson(response, 401, { code: "UNAUTHENTICATED", message: "Sesi belum tersedia." });
        return;
      }
      if (requestUrl.pathname.startsWith("/api/")) {
        sendJson(response, 401, { code: "UNAUTHENTICATED", message: "Endpoint tidak tersedia pada browser smoke test." });
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
      sendJson(response, 500, { code: "TEST_SERVER_ERROR", message: error.message });
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
    if (force) {
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
    return;
  }
  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
};

const startChromium = async () => {
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
    const version = await waitFor(async () => {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Chromium berhenti (${child.exitCode}).`);
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).catch(() => null);
      return response?.ok ? response.json() : null;
    }, { timeoutMs: 15_000, description: "Chromium DevTools" });

    return {
      debuggingPort,
      browserWebSocketUrl: version.webSocketDebuggerUrl,
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

const openPage = async (debuggingPort, url, { width = 390, height = 844 } = {}) => {
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
  // Browser smoke harus deterministik dan tidak boleh bergantung pada jaringan
  // accounts.google.com. Mock di bawah menguji kontrak integrasi aplikasi,
  // sedangkan request provider asli diblokir agar tidak menimpa window.google.
  await session.send("Network.setBlockedURLs", {
    urls: ["*://accounts.google.com/gsi/client*"],
  });
  await session.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      Object.defineProperty(window, "google", {
        configurable: true,
        value: {
          accounts: {
            id: {
              __saldoBersamaSmokeMock: true,
              initialize() {},
              renderButton(element) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Lanjutkan dengan Google";
                button.setAttribute("aria-label", "Masuk menggunakan Google");
                element.replaceChildren(button);
              },
            },
          },
        },
      });
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = async () => null;
      }
    `,
  });
  await session.send("Page.navigate", { url });
  await waitFor(
    () => session.evaluate("document.readyState === 'complete' && Boolean(document.querySelector('main'))"),
    { description: "halaman aplikasi selesai dirender" },
  );
  return session;
};

const accessibilitySnapshot = (nodes) => nodes
  .filter((node) => !node.ignored)
  .map((node) => ({
    role: node.role?.value || "",
    name: node.name?.value || "",
  }));

await test("browser smoke: route privat redirect ke login dan layout mobile tetap aksesibel", { timeout: 45_000 }, async () => {
  let appServer;
  let chromium;
  let page;
  try {
    appServer = await startAppServer();
    chromium = await startChromium();
    page = await openPage(chromium.debuggingPort, `${appServer.origin}/transaksi`);
    await waitFor(
      () => page.evaluate("location.pathname === '/login'"),
      { description: "redirect unauthenticated ke /login" },
    );
    const configurationError = await page.evaluate(`(() => {
      const alerts = [...document.querySelectorAll("[role='alert']")];
      const alert = alerts.find((element) => /Konfigurasi belum lengkap/i.test(element.textContent || ""));
      return alert?.textContent?.replace(/\s+/g, " ").trim() || "";
    })()`);
    assert.equal(
      configurationError,
      "",
      `Build browser smoke harus menyediakan public test env VITE_GOOGLE_CLIENT_ID dan VITE_FIREBASE_API_KEY: ${configurationError}`,
    );
    assert.equal(
      await page.evaluate("window.google?.accounts?.id?.__saldoBersamaSmokeMock === true"),
      true,
      "Browser smoke harus memakai mock Google Identity lokal, bukan script provider eksternal.",
    );
    assert.equal(
      await page.evaluate("Boolean(document.querySelector('.login-mobile-stage'))"),
      true,
      "Viewport smoke 390px harus memakai onboarding mobile artwork-first.",
    );
    assert.equal(
      await page.evaluate("document.querySelectorAll('.login-mobile-slide').length"),
      3,
      "Login mobile harus memiliki dua onboarding dan slide login sebagai slide ketiga.",
    );
    await page.evaluate("document.querySelector('.login-mobile-slide:nth-child(1) .login-mobile-next')?.click()");
    await page.evaluate("document.querySelector('.login-mobile-slide:nth-child(2) .login-mobile-next')?.click()");
    await waitFor(
      () => page.evaluate("Boolean(document.querySelector('.google-login-button button, .google-login-button iframe'))"),
      { timeoutMs: 5_000, description: "widget login Google mock selesai dirender setelah onboarding" },
    );

    const result = await page.evaluate(`(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const nameOf = (element) => (
        element.getAttribute("aria-label")
        || element.getAttribute("title")
        || element.textContent
        || element.value
        || ""
      ).trim();
      const interactive = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='button']")]
        .filter(visible);
      const providerContainers = [...document.querySelectorAll(".google-login-button")].filter(visible);
      const providerControls = interactive.filter((element) => element.closest(".google-login-button"));
      const applicationControls = interactive.filter((element) => !element.closest(".google-login-button"));
      const dimensionsOf = (element) => {
        const rect = element.getBoundingClientRect();
        return { name: nameOf(element), width: Math.round(rect.width), height: Math.round(rect.height) };
      };
      return {
        pathname: location.pathname,
        title: document.querySelector("h1")?.textContent?.trim() || "",
        mainCount: document.querySelectorAll("main").length,
        h1Count: document.querySelectorAll("h1").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        unnamedControls: interactive.filter((element) => !nameOf(element)).map((element) => element.outerHTML.slice(0, 160)),
        undersizedControls: applicationControls
          .map(dimensionsOf)
          .filter((item) => item.width < 44 || item.height < 44),
        providerContainers: providerContainers.map(dimensionsOf),
        undersizedProviderControls: providerControls
          .map(dimensionsOf)
          .filter((item) => item.width < 24 || item.height < 24),
        alerts: [...document.querySelectorAll("[role='alert']")].map((element) => element.textContent.trim()),
      };
    })()`);

    assert.equal(result.pathname, "/login");
    assert.equal(result.title, "Saldo Bersama");
    assert.equal(result.mainCount, 1, "Halaman harus mempunyai satu landmark main.");
    assert.equal(result.h1Count, 1, "Halaman harus mempunyai satu heading utama.");
    assert.ok(result.overflow <= 1, `Layout mobile tidak boleh overflow horizontal (${result.overflow}px).`);
    assert.deepEqual(result.unnamedControls, [], "Semua kontrol terlihat harus mempunyai accessible name.");
    assert.deepEqual(result.undersizedControls, [], `Kontrol aplikasi harus mempunyai target sentuh minimum 44px: ${JSON.stringify(result.undersizedControls)}`);
    assert.equal(result.providerContainers.length, 1, "Host widget login Google harus tersedia tepat satu kali.");
    assert.ok(
      result.providerContainers.every((item) => item.width >= 44 && item.height >= 44),
      `Host widget pihak ketiga harus menyediakan area layout minimum 44px: ${JSON.stringify(result.providerContainers)}`,
    );
    assert.deepEqual(
      result.undersizedProviderControls,
      [],
      `Kontrol provider-managed tetap harus memenuhi minimum 24px: ${JSON.stringify(result.undersizedProviderControls)}`,
    );
    assert.deepEqual(result.alerts, [], "Login smoke tidak boleh menampilkan error konfigurasi/runtime.");

    const { nodes } = await page.send("Accessibility.getFullAXTree");
    const snapshot = accessibilitySnapshot(nodes);
    assert.ok(snapshot.some((node) => node.role === "main"), "Accessibility tree harus memiliki main landmark.");
    assert.ok(snapshot.some((node) => node.role === "heading" && node.name === result.title), "Heading utama harus terbaca di accessibility tree.");
    assert.ok(snapshot.some((node) => node.role === "button" && /Google/i.test(node.name)), "Tombol login Google harus terbaca di accessibility tree.");
  } finally {
    await chromium?.close();
    await page?.close();
    await appServer?.close();
  }
});
