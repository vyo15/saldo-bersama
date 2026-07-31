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
