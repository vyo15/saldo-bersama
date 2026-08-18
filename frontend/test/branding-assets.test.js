import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "..");

const read = (relativePath) => readFile(path.join(frontendRoot, relativePath));

test("branding assets and favicon references stay complete", async () => {
  const expected = [
    "public/brand/saldo-bersama-mark.png",
    "public/icons/favicon.ico",
    "public/icons/favicon-16.png",
    "public/icons/favicon-32.png",
    "public/icons/favicon-64.png",
    "public/icons/apple-touch-icon.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/icon-maskable-192.png",
    "public/icons/icon-maskable-512.png",
    "public/icons/notification-badge-96.png",
  ];
  await Promise.all(expected.map(read));

  const [html, manifestRaw, sw, logo] = await Promise.all([
    read("index.html").then(String),
    read("public/site.webmanifest").then(String),
    read("public/sw.js").then(String),
    read("public/brand/saldo-bersama-mark.png"),
  ]);
  const manifest = JSON.parse(manifestRaw);
  assert.match(html, /favicon-32\.png\?v=4/);
  assert.match(html, /apple-touch-icon\.png\?v=4/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.equal(manifest.icons.some((icon) => icon.purpose === "maskable"), true);
  assert.match(sw, /saldo-bersama-static-v10/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /notification-badge-96\.png/);
  assert.match(sw, /isInfrastructurePath\(url\.pathname\)\) return;/);
  assert.match(sw, /pathname === "\/api"/);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /key\.startsWith\("saldo-bersama-"\)/);
  assert.equal(logo.subarray(1, 4).toString(), "PNG");
  // PNG color type 6 means RGBA, so the source logo keeps an alpha channel.
  assert.equal(logo[25], 6);
});
