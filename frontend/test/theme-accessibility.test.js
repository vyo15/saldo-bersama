import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tokenSource = await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/styles/components.css", import.meta.url), "utf8");

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

test("token light dan dark memenuhi kontras teks serta tombol utama", () => {
  const light = blockFor(":root,");
  const dark = blockFor(':root[data-theme="dark"]');
  assert.ok(contrast(token(light, "--text"), token(light, "--surface")) >= 4.5);
  assert.ok(contrast(token(light, "--on-primary"), token(light, "--primary")) >= 4.5);
  assert.ok(contrast(token(light, "--on-negative"), token(light, "--negative")) >= 4.5);
  assert.ok(contrast(token(dark, "--text"), token(dark, "--surface")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-primary"), token(dark, "--primary")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-negative"), token(dark, "--negative")) >= 4.5);
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
  assert.match(pages, /Keep desktop information readable instead of simulating density with 7–10px text/);
  assert.match(pages, /\.google-login-button \{ min-height:\s*46px;/);
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
