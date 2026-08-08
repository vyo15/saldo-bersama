import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const tokenSource = await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/styles/components.css", import.meta.url), "utf8");

const collectCssSources = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) result.push(...await collectCssSources(child));
    else if (entry.isFile() && entry.name.endsWith(".css")) result.push({ path: child.pathname, source: await readFile(child, "utf8") });
  }
  return result;
};

const blockFor = (selector) => {
  const start = tokenSource.indexOf(selector);
  assert.ok(start >= 0, `Theme block tidak ditemukan: ${selector}`);
  const bodyStart = tokenSource.indexOf("{", start) + 1;
  const bodyEnd = tokenSource.indexOf("}", bodyStart);
  return tokenSource.slice(bodyStart, bodyEnd);
};

const token = (block, name) => {
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
  assert.ok(value, `Token hex tidak ditemukan: ${name}`);
  return value;
};

const luminance = (hex) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (left, right) => {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test("palette Saldo Bersama yang disetujui tetap menjadi primitive canonical", () => {
  for (const [name, value] of Object.entries({
    "--palette-rich-black": "#0b1110",
    "--palette-dark-green": "#0f1a18",
    "--palette-bangladesh-green": "#03624c",
    "--palette-mountain-meadow": "#2cc295",
    "--palette-caribbean-green": "#00d681",
    "--palette-mint": "#a7f3d0",
    "--palette-anti-flash-white": "#f4faf7",
    "--palette-pistachio": "#e8f5ef",
  })) assert.match(tokenSource, new RegExp(`${name}:\\s*${value};`, "i"));
});

test("token light dan dark memenuhi kontras teks serta tombol utama", () => {
  const light = blockFor(":root,");
  const dark = blockFor(':root[data-theme="dark"]');
  for (const foreground of ["--text", "--text-soft", "--text-muted", "--primary", "--positive", "--negative", "--warning", "--info"]) {
    assert.ok(contrast(token(light, foreground), token(light, "--surface")) >= 4.5, `Kontras light gagal: ${foreground}`);
    assert.ok(contrast(token(dark, foreground), token(dark, "--surface")) >= 4.5, `Kontras dark gagal: ${foreground}`);
  }
  assert.ok(contrast(token(light, "--on-primary"), token(light, "--primary")) >= 4.5);
  assert.ok(contrast(token(light, "--on-primary"), token(light, "--primary-strong")) >= 4.5);
  assert.ok(contrast(token(light, "--on-negative"), token(light, "--negative")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-primary"), token(dark, "--primary")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-primary"), token(dark, "--primary-strong")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-negative"), token(dark, "--negative")) >= 4.5);
  for (const theme of [light, dark]) {
    for (const endpoint of ["--hero-start", "--hero-mid", "--hero-end"]) {
      assert.ok(contrast(token(theme, "--on-hero"), token(theme, endpoint)) >= 4.5, `Kontras hero gagal: ${endpoint}`);
    }
  }
});

test("komponen memakai semantic foreground dan reduced motion", () => {
  assert.match(componentSource, /\.button--primary[^}]*color:\s*var\(--on-primary\)/);
  assert.match(componentSource, /\.button--danger[^}]*color:\s*var\(--on-negative\)/);
  assert.match(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(componentSource, /:focus-visible/);
});

test("density mobile memakai token readable dan tidak mengecilkan kontrol pada layar sempit", async () => {
  const [tokens, responsive, pages] = await Promise.all([
    readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/pages.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokens, /--font-size-xs:\s*11px;/);
  assert.match(tokens, /--mobile-control-height:\s*44px;/);
  assert.match(responsive, /\.mobile-finance-summary span \{ font-size:\s*11px;/);
  assert.match(responsive, /\.mobile-transaction-item > div small \{[^}]*font-size:\s*11px;/);
  assert.doesNotMatch(pages, /\.premium-/);
  assert.match(pages, /\.google-login-button \{[^}]*min-height:\s*48px;/);
});

test("tipografi memakai system font yang tersedia dan bobot standar tanpa synthetic weight ekstrem", async () => {
  assert.match(tokenSource, /--font-sans:\s*"Segoe UI Variable Text", "Segoe UI", Inter/);
  assert.match(tokenSource, /--font-mono:\s*"Cascadia Mono", "SFMono-Regular", Consolas/);
  assert.match(tokenSource, /--font-weight-regular:\s*400;/);
  assert.match(tokenSource, /--font-weight-medium:\s*500;/);
  assert.match(tokenSource, /--font-weight-semibold:\s*600;/);
  assert.match(tokenSource, /--font-weight-bold:\s*700;/);

  const sharedStyles = await Promise.all([
    "app.css",
    "components.css",
    "pages.css",
    "responsive.css",
  ].map((name) => readFile(new URL(`../src/styles/${name}`, import.meta.url), "utf8")));
  assert.doesNotMatch(sharedStyles.join("\n"), /font-weight:\s*(?:[89]\d{2}|7[5-9]\d);/);
});

test("semua CSS custom property statis terdefinisi dan alias semantic yang salah tidak kembali", async () => {
  const cssFiles = await collectCssSources(new URL("../src/", import.meta.url));
  const defined = new Set();
  const runtimeProperties = new Set(["--note-delay", "--note-drift", "--note-duration", "--note-left", "--note-rotation"]);

  for (const file of cssFiles) {
    for (const match of file.source.matchAll(/(?<![\w-])(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(match[1]);
  }

  const unresolved = [];
  for (const file of cssFiles) {
    for (const match of file.source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)(\s*,)?/g)) {
      const [, name, fallback] = match;
      if (!defined.has(name) && !fallback && !runtimeProperties.has(name)) unresolved.push(`${name} @ ${file.path}`);
    }
  }

  assert.deepEqual(unresolved, []);
  assert.match(tokenSource, /--font-size-body:\s*16px;/);
  const combined = cssFiles.map((file) => file.source).join("\n");
  for (const invalidAlias of ["--border-subtle", "--surface-muted", "--text-primary", "--font-size-md", "--danger"]) {
    assert.doesNotMatch(combined, new RegExp(`var\\(${invalidAlias}\\)`));
  }
});

test("gradient avatar dan login logo-first tetap memiliki kontras serta focus state", async () => {
  const [app, pages] = await Promise.all([
    readFile(new URL("../src/styles/app.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/pages.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /\.desktop-user-avatar \{[^}]*background:\s*linear-gradient\(145deg, var\(--primary\), var\(--primary-strong\)\);/s);
  assert.match(app, /\.user-avatar \{[^}]*background:\s*linear-gradient\(145deg, var\(--primary\), var\(--primary-strong\)\);/s);
  assert.match(pages, /\.login-creator a:focus-visible/);
  assert.match(pages, /:root\[data-theme="dark"\] \.login-brand-lockup \.brand-wordmark span:first-child \{ color:\s*var\(--text\); \}/);
  assert.doesNotMatch(app, /\.desktop-user-avatar \{[^}]*var\(--secondary\)/s);
  assert.doesNotMatch(app, /\.user-avatar \{[^}]*var\(--secondary\)/s);
});

test("mobile form tidak memicu auto-zoom dan gesture rekening tidak memblokir scroll vertikal", async () => {
  const [responsive, accountStyles, indexHtml, components, modalStyles, reset, pages] = await Promise.all([
    readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/accounts/AccountsPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/components.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/Modal.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/reset.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/pages.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokenSource, /--font-size-body:\s*16px;/);
  assert.match(components, /\.field input,\s*\n\.field select,\s*\n\.field textarea,\s*\n\.toolbar select,\s*\n\.search-field \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(accountStyles, /\.paymentHistoryToolbar input \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(pages, /\.shared-transaction-tools input,\s*\n\.shared-transaction-tools select \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(pages, /\.shared-transaction-tools label \{[^}]*min-height:\s*var\(--control-height-md\);/s);
  assert.match(responsive, /scrollbar-width:\s*none;/);
  assert.match(responsive, /html::-webkit-scrollbar,\s*\n\s*body::-webkit-scrollbar \{[^}]*display:\s*none;/s);
  assert.match(responsive, /overflow-x:\s*hidden;/);
  assert.doesNotMatch(responsive, /overflow-y:\s*hidden/);
  assert.match(accountStyles, /\.mobileStackStage[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.match(accountStyles, /\.mobileStackCard\[aria-pressed="true"\][^{]*\{[^}]*touch-action: pan-x pinch-zoom;/s);
  assert.doesNotMatch(accountStyles, /touch-action: none/);
  assert.doesNotMatch(indexHtml, /user-scalable=no|maximum-scale=1/i);
  assert.doesNotMatch(components, /\.modal(?:-backdrop|--lg|__header|__body|__footer|\s*\{)/);
  assert.match(modalStyles, /max-height: min\(94dvh, 57\.5rem\)/);
  assert.match(reset, /body \{ margin: 0; min-width: 0;/);
  assert.match(reset, /body \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.match(reset, /#root \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.doesNotMatch(reset, /body \{[^}]*overflow:\s*hidden/);
  assert.match(responsive, /\.app-shell--accounts \.app-content \{ padding-top:\s*0; color:\s*var\(--on-hero\); \}/);
});
