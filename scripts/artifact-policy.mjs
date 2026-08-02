import path from "node:path";

export const MAX_SOURCE_ARCHIVE_BYTES = 5 * 1024 * 1024;

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
  /\.(?:log|tmp|temp|bak|zip|rar|7z|db|sqlite|sqlite3|dump|gz)$/i,
]);

export const IGNORED_LOCAL_FILE_PATTERNS = Object.freeze([
  /^\.env$/i,
  /^\.env\.(?!example$).+/i,
  /^\.clasp\.json$/i,
  /^(?:npm-debug|yarn-error|pnpm-debug|firebase-debug)\.log$/i,
  /\.(?:log|tmp|temp|bak|zip|rar|7z)$/i,
]);

export const isWithinRoot = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
