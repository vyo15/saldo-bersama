import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ignoredSegments = new Set([
  ".git",
  ".vercel",
  ".sites-runtime",
  ".vinext",
  ".wrangler",
  ".vite",
  ".cache",
  ".next",
  ".nuxt",
  ".output",
  ".firebase",
  ".turbo",
  ".parcel-cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  "temp",
  "tmp",
  "cache",
  "logs",
]);

const ignoredLocalFilePatterns = [
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /^\.clasp\.json$/i,
  /^(?:npm-debug|yarn-error|pnpm-debug|firebase-debug)\.log$/i,
  /\.(?:log|tmp|temp|bak|zip|rar|7z)$/i,
];

const isIgnoredLocalFile = (file) => {
  const name = path.posix.basename(file);
  return name !== ".env.example"
    && ignoredLocalFilePatterns.some((pattern) => pattern.test(name));
};

const allowedRootEntries = new Set([
  ".env.example",
  ".gitattributes",
  ".github",
  ".gitignore",
  ".npmrc",
  "README.md",
  "api",
  "apps-script",
  "docs",
  "frontend",
  "package-lock.json",
  "package.json",
  "scripts",
  "vercel.json",
]);

const retiredRootEntries = new Set([
  ".openai",
  "app",
  "db",
  "drizzle",
  "examples",
  "integrations",
  "lib",
  "public",
  "tests",
  "worker",
]);

const forbiddenNames = [
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.clasp\.json$/i,
  /firebase-adminsdk-.*\.json$/i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /client[_-]secret.*\.json$/i,
  /private-key/i,
  /\.(?:pem|p12|pfx|key)$/i,
];

const forbiddenLegacyContent = [
  /dicekout/i,
  /affiliate/i,
  /catalog-manager/i,
  /integrations\/apps-script/i,
  /\bvinext\b/i,
  /codex-preview/i,
  /openai sites/i,
];

const walk = async (directory = root, relative = "") => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const rel = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredSegments.has(entry.name)) files.push(...await walk(path.join(directory, entry.name), rel));
    } else if (entry.isFile() && !isIgnoredLocalFile(rel)) {
      files.push(rel);
    }
  }
  return files;
};

const getTracked = () => {
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (inside !== "true") return null;
    return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null;
  }
};

const rootEntries = await readdir(root);
const requiredRootEntries = [".env.example", "README.md", "package.json", "package-lock.json"];
const missingRootEntries = requiredRootEntries.filter((entry) => !rootEntries.includes(entry));
const unexpectedRootEntries = rootEntries
  .filter((entry) => !ignoredSegments.has(entry))
  .filter((entry) => !isIgnoredLocalFile(entry))
  .filter((entry) => !allowedRootEntries.has(entry));

const trackedFiles = getTracked() || [];
const files = await walk();
const pathViolations = [...new Set([...files, ...trackedFiles])].filter((file) => {
  const firstSegment = file.split("/")[0];
  const hasGeneratedSegment = file.split("/").some((segment) => ignoredSegments.has(segment));
  return retiredRootEntries.has(firstSegment)
    || hasGeneratedSegment
    || (forbiddenNames.some((pattern) => pattern.test(file)) && file !== ".env.example");
});

const legacyViolations = [];
for (const file of files.filter((item) => !["scripts/validate-source-tree.mjs", "scripts/create-clean-archive.mjs"].includes(item) && /\.(?:js|jsx|mjs|json|md|css|yml|yaml|html|gs)$/.test(item))) {
  const content = await readFile(path.join(root, file), "utf8");
  if (forbiddenLegacyContent.some((pattern) => pattern.test(content))) legacyViolations.push(file);
}

if (missingRootEntries.length || unexpectedRootEntries.length || pathViolations.length || legacyViolations.length) {
  console.error("Source tree belum bersih.");
  missingRootEntries.forEach((entry) => console.error(`Root entry wajib tidak ditemukan: ${entry}`));
  unexpectedRootEntries.forEach((entry) => console.error(`Root entry tidak dikenal: ${entry}`));
  pathViolations.forEach((file) => console.error(`Path generated, retired, atau sensitif: ${file}`));
  legacyViolations.forEach((file) => console.error(`Referensi legacy: ${file}`));
  process.exit(1);
}

console.log(`Source tree bersih: ${files.length} file diperiksa; hanya arsitektur canonical yang tersisa.`);
