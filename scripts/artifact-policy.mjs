import path from "node:path";

export const MAX_SOURCE_ARCHIVE_BYTES = 5 * 1024 * 1024;

export const CANONICAL_ROOT_ENTRIES = new Set([
  ".env.example",
  ".gitattributes",
  ".github",
  ".gitignore",
  ".jscpd.json",
  ".npmrc",
  ".node-version",
  "AGENTS.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "api",
  "apps-script",
  "database",
  "docs",
  "eslint.backend.config.js",
  "frontend",
  "package-lock.json",
  "package.json",
  "scripts",
  "test",
  "vercel.json",
]);

const CANONICAL_ROOT_FILES = new Set([...CANONICAL_ROOT_ENTRIES].filter((entry) => ![
  ".github",
  "api",
  "apps-script",
  "database",
  "docs",
  "frontend",
  "scripts",
  "test",
].includes(entry)));

const extensionOf = (file) => path.posix.extname(file).toLowerCase();

export const isCanonicalSourceFile = (file) => {
  const normalized = String(file || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return false;
  if (!normalized.includes("/")) return CANONICAL_ROOT_FILES.has(normalized);

  const [rootSegment] = normalized.split("/");
  const extension = extensionOf(normalized);
  const basename = path.posix.basename(normalized);

  if (rootSegment === ".github") return basename === "CODEOWNERS" || [".yml", ".yaml", ".md"].includes(extension);
  if (rootSegment === "api") return extension === ".js";
  if (rootSegment === "apps-script") return [".gs", ".md"].includes(extension) || normalized === "apps-script/appsscript.json";
  if (rootSegment === "database") return [".sql", ".md"].includes(extension);
  if (rootSegment === "docs") return extension === ".md" || ["docs/tasks/active/.gitkeep", "docs/tasks/archive/.gitkeep"].includes(normalized);
  if (rootSegment === "scripts") return extension === ".mjs";
  if (rootSegment === "test") return [".js", ".mjs"].includes(extension);
  if (rootSegment === "frontend") {
    if (extension === ".json") return normalized === "frontend/package.json";
    return [".js", ".jsx", ".css", ".html", ".txt", ".webmanifest", ".webp", ".png", ".ico", ".svg"].includes(extension);
  }
  return false;
};

export const CLEAN_SOURCE_ARCHIVE_FILENAME_PATTERN = /^saldo-bersama-clean(?:\((?:\d+|\d{8}-\d{6})\)|-\d{8}-\d{6})?\.zip$/i;

export const isCleanSourceArchiveFilename = (name) => CLEAN_SOURCE_ARCHIVE_FILENAME_PATTERN.test(path.basename(name));

export const GENERATED_DIRECTORIES = Object.freeze([
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  ".vite",
  ".cache",
  "temp",
  "tmp",
  "cache",
  "logs",
]);

export const LOCAL_ONLY_DIRECTORIES = Object.freeze([
  ".git",
  ".vercel",
  ".sites-runtime",
  ".vinext",
  ".wrangler",
  ".next",
  ".nuxt",
  ".output",
  ".firebase",
  ".turbo",
  ".parcel-cache",
  "node_modules",
]);

export const ARCHIVE_IGNORED_SEGMENTS = new Set([
  ...GENERATED_DIRECTORIES,
  ...LOCAL_ONLY_DIRECTORIES,
]);

export const GENERATED_CLEAN_TARGETS = Object.freeze([
  "frontend/dist",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  "frontend/.vite",
  "frontend/node_modules/.vite",
  "frontend/node_modules/.vite-temp",
  ".vite",
  ".cache",
  "temp",
  "tmp",
  "cache",
  "logs",
]);

export const DEPENDENCY_CLEAN_TARGETS = Object.freeze([
  "node_modules",
  "frontend/node_modules",
]);

export const FORBIDDEN_ARCHIVE_FILE_PATTERNS = Object.freeze([
  /^\.env$/i,
  /^\.env\..+/i,
  /^\.clasp\.json$/i,
  /firebase-adminsdk-.*\.json$/i,
  /service-account.*\.json$/i,
  /credentials.*\.json$/i,
  /client[_-]secret.*\.json$/i,
  /private-key/i,
  /\.(?:pem|p12|pfx|key|crt|cer)$/i,
  /\.(?:log|tmp|temp|bak|zip|rar|7z|db|sqlite|sqlite3|dump|gz|csv|tsv|xls|xlsx|ods|parquet|ndjson|jsonl|patch|diff|pdf|docx|pptx)$/i,
]);

export const LOCAL_ONLY_FILE_PATTERNS = Object.freeze([
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /^\.clasp\.json$/i,
  /^(?:npm-debug|yarn-error|pnpm-debug|firebase-debug)\.log$/i,
  /^npm-audit-\d{8}(?:-\d{6})?\.json$/i,
  /\.(?:log|tmp|temp|bak|zip|rar|7z)$/i,
]);


export const isWithinRoot = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
