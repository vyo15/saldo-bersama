import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEPENDENCY_CLEAN_TARGETS, isWithinRoot } from "./artifact-policy.mjs";

if (!process.argv.includes("--force")) {
  console.error("Cleanup dependency sengaja dibuat eksplisit. Jalankan: npm run clean:dependencies -- --force");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const removed = [];
for (const relative of DEPENDENCY_CLEAN_TARGETS) {
  const target = path.resolve(root, relative);
  if (!isWithinRoot(root, target) || target === root) throw new Error(`Target dependency tidak aman: ${relative}`);
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`Cleanup menolak symbolic link: ${relative}`);
    await rm(target, { recursive: true, force: true });
    removed.push(relative);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
console.log(removed.length ? `Dependency lokal dihapus: ${removed.join(", ")}` : "Dependency lokal sudah bersih.");
