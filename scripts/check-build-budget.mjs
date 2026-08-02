import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const assets = path.join(dist, "assets");
const limits = Object.freeze({
  mainJsGzip: 110 * 1024,
  globalCssGzip: 20 * 1024,
  routeChunkGzip: 8 * 1024,
});

const files = await readdir(assets);
const measurements = [];
for (const name of files) {
  if (!/\.(?:js|css)$/.test(name)) continue;
  const buffer = await readFile(path.join(assets, name));
  measurements.push({ name, raw: buffer.length, gzip: gzipSync(buffer).length });
}

const mainJs = measurements.filter((item) => /^index-.*\.js$/.test(item.name)).sort((a, b) => b.raw - a.raw)[0];
const globalCss = measurements.filter((item) => /^index-.*\.css$/.test(item.name)).sort((a, b) => b.raw - a.raw)[0];
if (!mainJs || !globalCss) throw new Error("Build budget tidak menemukan bundle utama Vite.");

const violations = [];
if (mainJs.gzip > limits.mainJsGzip) violations.push(`${mainJs.name} gzip ${mainJs.gzip} > ${limits.mainJsGzip}`);
if (globalCss.gzip > limits.globalCssGzip) violations.push(`${globalCss.name} gzip ${globalCss.gzip} > ${limits.globalCssGzip}`);
for (const item of measurements.filter((entry) => /Page-.*\.js$/.test(entry.name))) {
  if (item.gzip > limits.routeChunkGzip) violations.push(`${item.name} gzip ${item.gzip} > ${limits.routeChunkGzip}`);
}

console.log(`Build budget: main JS ${mainJs.gzip} B gzip; global CSS ${globalCss.gzip} B gzip; ${measurements.length} asset diperiksa.`);
if (violations.length) {
  violations.forEach((item) => console.error(`Budget terlampaui: ${item}`));
  process.exit(1);
}
await stat(path.join(dist, "index.html"));
