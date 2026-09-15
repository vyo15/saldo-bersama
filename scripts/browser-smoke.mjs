import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"], [".png", "image/png"], [".webp", "image/webp"],
  [".woff2", "font/woff2"], [".ico", "image/x-icon"],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserCandidates = () => {
  const env = [process.env.CHROME_PATH, process.env.CHROME_BIN, process.env.GOOGLE_CHROME_BIN]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const home = process.env.LOCALAPPDATA || "";
  const pf = process.env.PROGRAMFILES || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  return [
    ...env,
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    path.join(pf, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
    home ? path.join(home, "Google", "Chrome", "Application", "chrome.exe") : "",
    home ? path.join(home, "Microsoft", "Edge", "Application", "msedge.exe") : "",
  ].filter(Boolean);
};

const findBrowser = () => browserCandidates().find((candidate) => existsSync(candidate));

const staticServer = () => createServer((req, res) => {
  if (req.url?.startsWith("/api/session")) {
    res.writeHead(401, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: { code: "UNAUTHENTICATED", message: "Browser smoke anonymous session" } }));
    return;
  }
  const pathname = decodeURIComponent(String(req.url || "/").split("?")[0]);
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = path.join(dist, requested);
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) file = path.join(dist, "index.html");
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": CONTENT_TYPES.get(ext) || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(file));
});

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    return result.result?.value;
  }
}

const browserDiagnostic = (browser, child, stderr) => {
  const status = child.exitCode === null
    ? "masih berjalan"
    : `exit ${child.exitCode}${child.signalCode ? ` (${child.signalCode})` : ""}`;
  const detail = String(stderr || "").trim().split(/\r?\n/).slice(-12).join("\n");
  return [`Browser: ${browser}`, `Status: ${status}`, detail ? `Log browser terakhir:\n${detail}` : ""].filter(Boolean).join("\n");
};

const waitForDevToolsPort = async ({ profile, child, browser, stderr }) => {
  const activePortFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (existsSync(activePortFile)) {
      const [portLine] = readFileSync(activePortFile, "utf8").trim().split(/\r?\n/);
      const port = Number.parseInt(portLine, 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    const stderrPort = String(stderr() || "").match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//)?.[1];
    if (stderrPort) return Number.parseInt(stderrPort, 10);
    if (child.exitCode !== null) break;
    await sleep(100);
  }
  throw new Error(`Chrome DevTools gagal mulai.\n${browserDiagnostic(browser, child, stderr())}`);
};

const connectCdp = async ({ port, child, browser, stderr }) => {
  let target;
  let lastError = "";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      target = targets.find((item) => item.type === "page");
      if (target?.webSocketDebuggerUrl) break;
      lastError = "Target page belum tersedia.";
    } catch (error) {
      lastError = error?.message || String(error);
    }
    if (child.exitCode !== null) break;
    await sleep(100);
  }
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(
      `Chrome DevTools endpoint tidak siap di port ${port}. ${lastError}\n${browserDiagnostic(browser, child, stderr())}`,
    );
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return { cdp: new Cdp(socket), socket };
};

const waitReady = async (cdp) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await cdp.evaluate(`document.readyState === "complete" && Boolean(document.querySelector("button, a, input, [tabindex]"))`);
    if (ready) return;
    await sleep(100);
  }
  throw new Error("Login UI tidak selesai dirender untuk browser smoke.");
};

const viewportMatrix = [
  [320, 568], [360, 640], [390, 844], [430, 932], [820, 900], [821, 900], [940, 900], [941, 900], [1440, 900],
];

const main = async () => {
  assert(existsSync(path.join(dist, "index.html")), "frontend/dist belum ada. Jalankan production build sebelum browser smoke.");
  const browser = findBrowser();
  assert(browser, "Chrome/Chromium/Edge tidak ditemukan. Set CHROME_PATH ke executable browser untuk menjalankan browser smoke.");

  const server = staticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = server.address().port;
  const profile = mkdtempSync(path.join(tmpdir(), "saldo-bersama-browser-"));
  let browserStderr = "";
  const child = spawn(browser, [
    "--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--remote-allow-origins=*", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--proxy-bypass-list=<-loopback>",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    browserStderr = `${browserStderr}${chunk}`.slice(-24_000);
  });
  child.on("error", (error) => {
    browserStderr = `${browserStderr}\nGagal menjalankan browser: ${error.message}`.slice(-24_000);
  });

  let socket;
  try {
    const debugPort = await waitForDevToolsPort({ profile, child, browser, stderr: () => browserStderr });
    const connected = await connectCdp({ port: debugPort, child, browser, stderr: () => browserStderr });
    const cdp = connected.cdp; socket = connected.socket;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    for (const [width, height] of viewportMatrix) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 820 });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${serverPort}/` });
      await waitReady(cdp);
      const geometry = await cdp.evaluate(`(() => {
        const root = document.documentElement;
        const visible = [...document.querySelectorAll('button,a,input,select,textarea,[tabindex]')].filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        });
        const loginButton = visible.find((el) => /google|masuk/i.test(el.textContent || el.getAttribute('aria-label') || ''));
        const rect = loginButton?.getBoundingClientRect();
        return { overflow: root.scrollWidth - root.clientWidth, controls: visible.length, loginBottom: rect?.bottom ?? null, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
      })()`);
      assert(geometry.overflow <= 1, `Page-level overflow ${geometry.overflow}px pada ${width}x${height}.`);
      assert(geometry.controls > 0, `Tidak ada interactive control visible pada ${width}x${height}.`);
      assert(geometry.loginBottom === null || geometry.loginBottom <= geometry.scrollHeight + 1, `Login CTA tidak reachable pada ${width}x${height}.`);
    }

    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${serverPort}/` });
    await waitReady(cdp);
    const focus = await cdp.evaluate(`(() => {
      const candidate = [...document.querySelectorAll('button,a,input,select,textarea,[tabindex]')].find((el) => {
        const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && !el.disabled;
      });
      candidate?.focus();
      const style = candidate ? getComputedStyle(candidate) : null;
      return { tag: candidate?.tagName || null, width: parseFloat(style?.outlineWidth || '0'), style: style?.outlineStyle || 'none' };
    })()`);
    assert(focus.tag && focus.style !== "none" && focus.width >= 2, "Rendered focus indicator tidak terlihat pada login mobile.");

    const spacing = await cdp.evaluate(`(() => {
      const style=document.createElement('style'); style.id='wcag-text-spacing-smoke';
      style.textContent='body *{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important} p{margin-bottom:2em !important}';
      document.head.append(style); const root=document.documentElement;
      return { overflow: root.scrollWidth-root.clientWidth, height: root.scrollHeight };
    })()`);
    assert(spacing.overflow <= 1, `Text-spacing menyebabkan page overflow ${spacing.overflow}px.`);

    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const reduced = await cdp.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
    assert(reduced === true, "Browser smoke gagal mengaktifkan prefers-reduced-motion.");

    console.log(`Browser smoke PASS: ${viewportMatrix.length} viewport, focus, text-spacing, reduced-motion.`);
  } finally {
    try { socket?.close(); } catch {}
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(1500),
    ]);
    await new Promise((resolve) => server.close(resolve));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; }
      catch { await sleep(120); }
    }
  }
};

await main();
