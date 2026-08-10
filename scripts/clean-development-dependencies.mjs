import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPENDENCY_CLEAN_TARGETS, isWithinRoot } from "./artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retryableWindowsLockCodes = new Set(["EPERM", "EBUSY"]);
const maxRemoveAttempts = 4;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const displayPath = (candidate) => {
  if (!candidate) return "node_modules";
  const resolved = path.resolve(String(candidate));
  return isWithinRoot(root, resolved) ? path.relative(root, resolved) || "." : path.basename(resolved);
};

const dependencyLockedError = (relative, error) => Object.assign(
  new Error(
    `Dependency masih dikunci Windows: ${displayPath(error?.path || relative)}. `
    + "Hentikan npm run dev/Vite/Node yang memakai project ini, lalu jalankan kembali "
    + "`npm run clean:dependencies -- --force` dan setelah berhasil `npm ci`. "
    + "Jika tetap terkunci setelah semua proses development ditutup, restart Windows lalu ulangi dua command tersebut.",
  ),
  { code: "DEPENDENCY_LOCKED", cause: error },
);

const removeDependencyTarget = async (relative) => {
  const target = path.resolve(root, relative);
  if (!isWithinRoot(root, target) || target === root) throw new Error(`Target dependency tidak aman: ${relative}`);

  for (let attempt = 1; attempt <= maxRemoveAttempts; attempt += 1) {
    try {
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error(`Cleanup menolak symbolic link: ${relative}`);
      await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      const retryableLock = process.platform === "win32" && retryableWindowsLockCodes.has(error?.code);
      if (!retryableLock) throw error;
      if (attempt === maxRemoveAttempts) throw dependencyLockedError(relative, error);
      await delay(200 * attempt);
    }
  }

  return false;
};

export const cleanDevelopmentDependencies = async () => {
  const removed = [];
  for (const relative of DEPENDENCY_CLEAN_TARGETS) {
    if (await removeDependencyTarget(relative)) removed.push(relative);
  }
  console.log(removed.length ? `Dependency lokal dihapus: ${removed.join(", ")}` : "Dependency lokal sudah bersih.");
  return removed;
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  if (!process.argv.includes("--force")) {
    console.error("Cleanup dependency sengaja dibuat eksplisit. Jalankan: npm run clean:dependencies -- --force");
    process.exit(2);
  }

  cleanDevelopmentDependencies().catch((error) => {
    console.error(error?.message || "Cleanup dependency gagal.");
    process.exitCode = 1;
  });
}
