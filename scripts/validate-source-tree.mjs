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
  "database",
  "docs",
  "frontend",
  "package-lock.json",
  "package.json",
  "scripts",
  "test",
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

// Saldo, arus kas, dan pemakaian kantong dihitung oleh Turso/API.
// Menyimpan kalkulator kedua di frontend berisiko menghasilkan angka berbeda.
const retiredClientFinanceFiles = new Set([
  "frontend/src/domain/finance.js",
  "frontend/test/finance.test.js",
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

// Vercel memperlakukan file runtime di namespace api/ sebagai Function. Guard ini
// dibuat fail-closed agar test/helper baru tidak diam-diam menjadi route production.
const VERCEL_FUNCTION_LIMIT = 12;
const VERCEL_FUNCTION_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts"]);
const CANONICAL_API_ENDPOINTS = new Set([
  "gateway.js",
  "export.js",
  "health.js",
  "jobs.js",
  "session.js",
]);
const ALLOWED_API_PRIVATE_DIRECTORIES = new Set(["_lib"]);

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

const isVercelFunctionCandidate = (file) => {
  if (!file.startsWith("api/")) return false;
  const relative = file.slice("api/".length);
  const segments = relative.split("/");
  if (!VERCEL_FUNCTION_EXTENSIONS.has(path.posix.extname(relative))) return false;
  return !segments.some((segment, index) => index < segments.length - 1 && segment.startsWith("_"));
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
    || retiredClientFinanceFiles.has(file)
    || hasGeneratedSegment
    || (forbiddenNames.some((pattern) => pattern.test(file)) && file !== ".env.example");
});

const apiFiles = files.filter((file) => file.startsWith("api/"));
const apiNamespaceViolations = apiFiles.filter((file) => {
  const relative = file.slice("api/".length);
  const [firstSegment, ...remainingSegments] = relative.split("/");
  if (remainingSegments.length === 0) return !CANONICAL_API_ENDPOINTS.has(firstSegment);
  return !ALLOWED_API_PRIVATE_DIRECTORIES.has(firstSegment);
});
const apiTestViolations = apiFiles.filter((file) =>
  /(^|\/)(?:test|tests)(\/|$)|\.(?:test|spec)\.(?:[cm]?[jt]s)$/i.test(file));
const vercelFunctionCandidates = apiFiles.filter(isVercelFunctionCandidate).sort();
const unexpectedFunctionCandidates = vercelFunctionCandidates.filter((file) =>
  !CANONICAL_API_ENDPOINTS.has(file.slice("api/".length)));
const missingCanonicalApiEndpoints = [...CANONICAL_API_ENDPOINTS]
  .filter((endpoint) => !apiFiles.includes(`api/${endpoint}`))
  .sort();

const vercelConfig = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const configuredFunctions = Object.keys(vercelConfig.functions || {}).sort();
const canonicalConfiguredFunctions = [...CANONICAL_API_ENDPOINTS]
  .map((endpoint) => `api/${endpoint}`)
  .sort();
const vercelFunctionConfigMismatch = configuredFunctions.length !== canonicalConfiguredFunctions.length
  || configuredFunctions.some((file, index) => file !== canonicalConfiguredFunctions[index]);

const legacyViolations = [];
for (const file of files.filter((item) => !["scripts/validate-source-tree.mjs", "scripts/create-clean-archive.mjs"].includes(item) && /\.(?:js|jsx|mjs|json|md|css|yml|yaml|html|gs)$/.test(item))) {
  const content = await readFile(path.join(root, file), "utf8");
  if (forbiddenLegacyContent.some((pattern) => pattern.test(content))) legacyViolations.push(file);
}

const hasVercelFunctionLimitViolation = vercelFunctionCandidates.length > VERCEL_FUNCTION_LIMIT;
const hasViolation = missingRootEntries.length
  || unexpectedRootEntries.length
  || pathViolations.length
  || legacyViolations.length
  || apiNamespaceViolations.length
  || apiTestViolations.length
  || unexpectedFunctionCandidates.length
  || missingCanonicalApiEndpoints.length
  || hasVercelFunctionLimitViolation
  || vercelFunctionConfigMismatch;

if (hasViolation) {
  console.error("Source tree belum bersih.");
  missingRootEntries.forEach((entry) => console.error(`Root entry wajib tidak ditemukan: ${entry}`));
  unexpectedRootEntries.forEach((entry) => console.error(`Root entry tidak dikenal: ${entry}`));
  pathViolations.forEach((file) => console.error(`Path generated, retired, atau sensitif: ${file}`));
  legacyViolations.forEach((file) => console.error(`Referensi legacy: ${file}`));
  apiNamespaceViolations.forEach((file) => console.error(`File tidak diizinkan di namespace runtime api/: ${file}`));
  apiTestViolations.forEach((file) => console.error(`Test tidak boleh berada di namespace runtime api/: ${file}`));
  unexpectedFunctionCandidates.forEach((file) => console.error(`Kandidat Vercel Function tidak canonical: ${file}`));
  missingCanonicalApiEndpoints.forEach((file) => console.error(`Endpoint API canonical tidak ditemukan: api/${file}`));
  if (hasVercelFunctionLimitViolation) {
    console.error(`Jumlah kandidat Vercel Functions ${vercelFunctionCandidates.length} melebihi batas ${VERCEL_FUNCTION_LIMIT}: ${vercelFunctionCandidates.join(", ")}`);
  }
  if (vercelFunctionConfigMismatch) {
    console.error(`Konfigurasi vercel.json functions harus tepat: ${canonicalConfiguredFunctions.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Source tree bersih: ${files.length} file diperiksa; ${vercelFunctionCandidates.length}/${VERCEL_FUNCTION_LIMIT} Vercel Functions canonical.`,
);
