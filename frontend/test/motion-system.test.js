import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const srcRoot = new URL("../src/", import.meta.url);
const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

const collect = async (directoryUrl, extensions) => {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    if (entry.isDirectory()) files.push(...await collect(url, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push({ url, source: await readFile(url, "utf8") });
  }
  return files;
};

test("motion token semantic menjadi satu source of truth tanpa hard-coded timing baru", async () => {
  const [tokens, cssFiles] = await Promise.all([
    read("src/styles/tokens.css"),
    collect(srcRoot, [".css"]),
  ]);
  for (const token of [
    "--motion-instant", "--motion-fast", "--motion-standard", "--motion-emphasized",
    "--motion-control", "--motion-feedback", "--motion-dialog", "--motion-sheet",
    "--motion-celebration", "--motion-decorative", "--motion-spinner", "--motion-loading",
    "--motion-stagger-0", "--motion-stagger-1", "--motion-stagger-6",
    "--ease-standard", "--ease-enter", "--ease-exit",
  ]) assert.match(tokens, new RegExp(`${token}:`));

  const hardCoded = [];
  const timingPattern = /\b(?:animation(?:-duration|-delay)?|transition(?:-duration|-delay)?)\s*:[^;\n]*\b\d*\.?\d+(?:ms|s)\b/i;
  for (const file of cssFiles) {
    for (const [index, line] of file.source.split("\n").entries()) {
      if (!timingPattern.test(line)) continue;
      if (line.includes("animation-duration: .01ms !important") && line.includes("transition-duration: .01ms !important")) continue;
      hardCoded.push(`${file.url.pathname}:${index + 1}:${line.trim()}`);
    }
  }
  assert.deepEqual(hardCoded, []);
});

test("motion runtime menghormati reduced-motion dan tidak menghidupkan kembali layout animation", async () => {
  const [jsFiles, cssFiles, motion, hook] = await Promise.all([
    collect(srcRoot, [".js", ".jsx"]),
    collect(srcRoot, [".css"]),
    read("src/shared/motion.js"),
    read("src/hooks/useReducedMotion.js"),
  ]);
  const js = jsFiles.map((file) => file.source).join("\n");
  const css = cssFiles.map((file) => file.source).join("\n");

  assert.doesNotMatch(js, /behavior\s*:\s*["']smooth["']/);
  assert.match(motion, /preferredScrollBehavior/);
  assert.match(motion, /prefersReducedMotion\(\) \? "auto" : "smooth"/);
  assert.match(motion, /semanticMotionDurationMs/);
  assert.match(motion, /getComputedStyle\(document\.documentElement\)/);
  assert.match(hook, /APP_MEDIA\.reducedMotion/);
  assert.doesNotMatch(css, /transition\s*:[^;]*(?:width|height)/);
  assert.doesNotMatch(css, /(?:login-money-fall|fatal-error-fly|success-money-fall|success-brand-pulse)[^;]*infinite/);
});


test("route utama memakai prefetch intent, delayed loader, dan entrance motion yang ringan", async () => {
  const [app, routeModules, prefetchHook, delayedLoader, appCss, responsiveCss, buttonCss, componentsCss, shell] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/app/routeModules.js"),
    read("src/hooks/useRoutePrefetch.js"),
    read("src/components/feedback/DelayedLoadingScreen.jsx"),
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
    read("src/components/common/Button.module.css"),
    read("src/styles/components.css"),
    read("src/layouts/AppShell.jsx"),
  ]);

  assert.match(app, /lazy\(loadDashboardPage\)/);
  assert.match(app, /<DelayedLoadingScreen variant=\{loadingVariant\} \/>/);
  assert.match(app, /className="route-content-enter"/);
  assert.match(app, /routeElement\(AppShell, \{ loadingVariant: "page", delayedLoader: false, motion: false \}\)/);
  assert.match(routeModules, /export const preloadRoute = async/);
  for (const route of ["/transaksi", "/rekening", "/laporan", "/investasi", "/pengaturan/perangkat"]) {
    assert.ok(routeModules.includes(`["${route}"`), `route ${route} wajib dapat diprefetch`);
  }
  assert.match(prefetchHook, /pointerover/);
  assert.match(prefetchHook, /pointerdown/);
  assert.match(prefetchHook, /focusin/);
  assert.match(prefetchHook, /url\.origin !== window\.location\.origin/);
  assert.match(delayedLoader, /delay = 120/);
  assert.match(delayedLoader, /route-loading-reserve/);
  assert.match(shell, /useRoutePrefetch\(\)/);
  assert.match(appCss, /\.route-content-enter\s*\{[\s\S]*animation:\s*route-content-enter var\(--motion-fast\) var\(--ease-enter\) both;/);
  assert.match(appCss, /@keyframes route-content-enter\s*\{[\s\S]*translateY\(5px\)[\s\S]*translateY\(0\)/);
  assert.match(appCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.route-content-enter \{ animation:\s*none; \}/);
  assert.match(buttonCss, /\.button:active:not\(:disabled\)\s*\{[\s\S]*translateY\(1px\) scale\(\.985\)/);
  assert.match(componentsCss, /\.icon-button:active:not\(:disabled\)\s*\{[\s\S]*scale\(\.96\)/);
  assert.match(responsiveCss, /\.mobile-navigation a:active,[\s\S]*\.mobile-navigation__more:active \{[^}]*scale\(\.97\)/);
  assert.match(responsiveCss, /\.mobile-navigation__add \{[^}]*transition:[^}]*transform var\(--motion-control\)/);
});
