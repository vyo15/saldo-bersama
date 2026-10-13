import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
const declarations = (block) => Object.fromEntries(
  [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
);
const hexRgb = (hex) => [...hex.matchAll(/[a-f\d]{2}/gi)].map((part) => parseInt(part[0], 16));
const luminance = (hex) => {
  const rgb = hexRgb(hex.slice(1)).map((value) => value / 255)
    .map((value) => (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4));
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};

// Guard the shared visual behavior instead of writing separate palettes per feature.
test("dark app canvas, surfaces and interactive layers retain readable soft tonal depth", async () => {
  const tokens = await read("styles/tokens.css");
  const dark = declarations(tokens.slice(tokens.indexOf(':root[data-theme="dark"] {')));
  const page = luminance(dark["--page"]);
  const surface = luminance(dark["--surface"]);
  const soft = luminance(dark["--surface-soft"]);
  const raised = luminance(dark["--surface-elevated"]);
  const strong = luminance(dark["--surface-strong"]);
  assert.ok(page > .014 && page < .035, "dark canvas must stay soft without becoming light mode");
  assert.ok(page < surface && surface < soft && soft < strong, "dark tonal hierarchy must not collapse");
  assert.ok(raised > surface && raised < strong, "raised surfaces must remain in the same hierarchy");
  assert.equal(dark["--input"], dark["--interactive"], "editable controls follow shared dark affordance");
  assert.equal(dark["--account-mobile-bg-mid"], dark["--page"], "account backdrop must not switch to near-black");
  assert.match(dark["--navigation-surface"], /^rgba\(/);
});

test("the shell and financial surfaces consume shared theme roles rather than local dark background", async () => {
  const [shell, responsive, planning, dashboard] = await Promise.all([
    read("styles/app.css"),
    read("styles/responsive.css"),
    read("features/allocations/AllocationOverview.module.css"),
    read("features/dashboard/DashboardMobile.module.css"),
  ]);
  assert.match(shell, /:root\[data-theme="dark"\] \.app-shell,[\s\S]*?background:\s*var\(--page\);/);
  assert.match(responsive, /\.mobile-navigation\s*\{[^}]*background:\s*var\(--navigation-surface\);/s);
  assert.match(planning, /\.allocation-funding-summary\s*\{[^}]*var\(--surface-elevated\)[^}]*var\(--surface\)/s);
  assert.match(dashboard, /data-theme="dark"\]\) \.mobile-family-hero\s*\{[^}]*var\(--hero-start\)[^}]*var\(--hero-end\)/s);
});

test("push cleanup is loaded on demand, without entering the authentication startup bundle", async () => {
  const auth = await read("features/auth/AuthContext.jsx");
  assert.doesNotMatch(auth, /^import\s+\{[^}]*disablePushNotifications[^}]*\}\s+from/m);
  assert.match(auth, /await import\("\.\.\/\.\.\/services\/notifications\.js"\)/);
  assert.match(auth, /if \(!session\) await disablePushNotifications\(/);
  assert.match(auth, /disablePushNotifications\(\{ bestEffort: true, localOnly: true \}\)\.catch/);
  assert.match(auth, /await disablePushNotifications\(\{ bestEffort: true \}\)/);
});
