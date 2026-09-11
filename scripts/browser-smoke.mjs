import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const DEVTOOLS_ACTIVE_PORT_FILE = "DevToolsActivePort";
const BROWSER_START_ATTEMPTS = 200;
const CDP_TARGET_ATTEMPTS = 120;
const POLL_INTERVAL_MS = 100;
const STDERR_TAIL_LIMIT = 16 * 1024;
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".svg", "image/svg+xml"], [".png", "image/png"], [".webp", "image/webp"],
  [".woff2", "font/woff2"], [".ico", "image/x-icon"],
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserCandidates = () => {
  const env = String(process.env.CHROME_PATH || "").trim();
  const home = process.env.LOCALAPPDATA || "";
  const pf = process.env.PROGRAMFILES || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  return [
    env,
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

const browserDiagnostic = (child, stderrTail) => {
  const exit = child.exitCode !== null ? `exit=${child.exitCode}` : child.signalCode ? `signal=${child.signalCode}` : "process masih hidup";
  const detail = String(stderrTail || "").trim().split(/\r?\n/).filter(Boolean).slice(-8).join(" | ");
  return `${exit}${detail ? `; stderr: ${detail}` : ""}`;
};

const waitForDebugPort = async ({ profile, child, getStderrTail, getSpawnError }) => {
  const activePortPath = path.join(profile, DEVTOOLS_ACTIVE_PORT_FILE);
  for (let attempt = 0; attempt < BROWSER_START_ATTEMPTS; attempt += 1) {
    const spawnError = getSpawnError();
    if (spawnError) throw new Error(`Browser tidak dapat dijalankan (${spawnError.message}).`);
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`Browser berhenti sebelum DevTools siap (${browserDiagnostic(child, getStderrTail())}).`);
    }
    try {
      const source = readFileSync(activePortPath, "utf8");
      const port = Number.parseInt(String(source).split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        // Chrome dapat menulis file secara bertahap; retry sampai startup timeout.
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Chrome DevTools endpoint tidak siap (${browserDiagnostic(child, getStderrTail())}).`);
};

const connectCdp = async ({ port, child, getStderrTail }) => {
  let target;
  let lastError;
  for (let attempt = 0; attempt < CDP_TARGET_ATTEMPTS; attempt += 1) {
    if (child.exitCode !== null || child.signalCode) {
      throw new Error(`Browser berhenti saat menunggu target DevTools (${browserDiagnostic(child, getStderrTail())}).`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        target = targets.find((item) => item.type === "page");
        if (target?.webSocketDebuggerUrl) break;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (!target?.webSocketDebuggerUrl) {
    const networkDetail = lastError?.message ? `; probe=${lastError.message}` : "";
    throw new Error(`Target Chrome DevTools tidak siap (${browserDiagnostic(child, getStderrTail())}${networkDetail}).`);
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return { cdp: new Cdp(socket), socket };
};

const navigate = async (cdp, url) => {
  const result = await cdp.send("Page.navigate", { url });
  if (result?.errorText) throw new Error(`Browser gagal membuka smoke server (${result.errorText}).`);
};

const waitReady = async (cdp) => {
  let state = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = await cdp.evaluate(`(() => ({
      ready: document.readyState === "complete",
      controls: document.querySelectorAll("button, a, input, [tabindex]").length,
      url: location.href,
      title: document.title
    }))()`);
    if (state?.ready && state.controls > 0) return;
    await sleep(100);
  }
  throw new Error(`Login UI tidak selesai dirender untuk browser smoke (url=${state?.url || "unknown"}, ready=${state?.ready ?? "unknown"}, controls=${state?.controls ?? "unknown"}, title=${state?.title || "-"}).`);
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
  const child = spawn(browser, [
    "--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--proxy-bypass-list=<-loopback>",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let stderrTail = "";
  child.stderr?.on("data", (chunk) => {
    stderrTail = `${stderrTail}${String(chunk)}`.slice(-STDERR_TAIL_LIMIT);
  });
  let spawnError = null;
  child.once("error", (error) => { spawnError = error; });
  const getStderrTail = () => stderrTail;
  const getSpawnError = () => spawnError;

  let socket;
  try {
    const debugPort = await waitForDebugPort({ profile, child, getStderrTail, getSpawnError });
    const connected = await connectCdp({ port: debugPort, child, getStderrTail });
    const cdp = connected.cdp; socket = connected.socket;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");

    for (const [width, height] of viewportMatrix) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 820 });
      await navigate(cdp, `http://127.0.0.1:${serverPort}/`);
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
    await navigate(cdp, `http://127.0.0.1:${serverPort}/`);
    await waitReady(cdp);
    await cdp.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
    let focus = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
      focus = await cdp.evaluate(`(() => {
        const candidate = document.activeElement;
        if (!(candidate instanceof HTMLElement) || candidate === document.body || candidate === document.documentElement) return null;
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return {
          tag: candidate.tagName,
          width: parseFloat(style.outlineWidth || '0'),
          style: style.outlineStyle || 'none',
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        };
      })()`);
      if (focus?.visible && focus.style !== "none" && focus.width >= 2) break;
    }
    if (!(focus?.visible && focus.style !== "none" && focus.width >= 2)) {
      const marked = await cdp.evaluate(`(() => {
        const candidate = [...document.querySelectorAll('button,a,input,select,textarea,[tabindex]')].find((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !el.disabled;
        });
        if (!(candidate instanceof HTMLElement)) return false;
        candidate.setAttribute('data-browser-smoke-focus-target', 'true');
        return true;
      })()`);
      assert(marked, "Tidak ada kontrol visible untuk verifikasi focus login mobile.");
      const documentNode = await cdp.send("DOM.getDocument", { depth: 1, pierce: true });
      const targetNode = await cdp.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: '[data-browser-smoke-focus-target="true"]' });
      assert(targetNode?.nodeId, "Kontrol focus smoke tidak dapat dipetakan ke DOM node.");
      await cdp.send("CSS.forcePseudoState", { nodeId: targetNode.nodeId, forcedPseudoClasses: ["focus", "focus-visible"] });
      focus = await cdp.evaluate(`(() => {
        const candidate = document.querySelector('[data-browser-smoke-focus-target="true"]');
        if (!(candidate instanceof HTMLElement)) return null;
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return {
          tag: candidate.tagName,
          width: parseFloat(style.outlineWidth || '0'),
          style: style.outlineStyle || 'none',
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        };
      })()`);
      await cdp.send("CSS.forcePseudoState", { nodeId: targetNode.nodeId, forcedPseudoClasses: [] });
      await cdp.evaluate(`document.querySelector('[data-browser-smoke-focus-target="true"]')?.removeAttribute('data-browser-smoke-focus-target')`);
    }
    assert(focus?.visible && focus.style !== "none" && focus.width >= 2, "Rendered focus-visible indicator tidak terlihat pada login mobile.");

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
    if (child.exitCode === null && !child.signalCode) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(1500),
      ]);
    }
    await new Promise((resolve) => server.close(resolve));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; }
      catch { await sleep(120); }
    }
  }
};

await main();
