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
const warningRatio = 0.9;

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
const warnings = [];
const measureBudget = (item, limit, label) => {
  if (item.gzip > limit) {
    violations.push(`${item.name} gzip ${item.gzip} > ${limit}`);
    return;
  }
  if (item.gzip >= Math.floor(limit * warningRatio)) {
    warnings.push({ label, name: item.name, gzip: item.gzip, limit, headroom: limit - item.gzip });
  }
};

measureBudget(mainJs, limits.mainJsGzip, "main JS");
measureBudget(globalCss, limits.globalCssGzip, "global CSS");
const routeChunks = measurements.filter((entry) => /Page-.*\.js$/.test(entry.name));
for (const item of routeChunks) measureBudget(item, limits.routeChunkGzip, "route");

console.log(`Build budget: main JS ${mainJs.gzip} B gzip; global CSS ${globalCss.gzip} B gzip; ${measurements.length} asset diperiksa.`);
if (warnings.length) {
  console.warn(`Build budget warning: asset >= ${Math.round(warningRatio * 100)}% batas harus dianggap sinyal refactor sebelum patch berikutnya.`);
  warnings
    .sort((left, right) => (left.headroom - right.headroom) || left.name.localeCompare(right.name))
    .forEach((item) => console.warn(`Mendekati batas [${item.label}]: ${item.name} gzip ${item.gzip}/${item.limit} B; headroom ${item.headroom} B.`));
}
if (violations.length) {
  violations.forEach((item) => console.error(`Budget terlampaui: ${item}`));
  process.exit(1);
}
await stat(path.join(dist, "index.html"));
