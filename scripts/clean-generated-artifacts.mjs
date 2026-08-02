import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_CLEAN_TARGETS, isWithinRoot } from "./artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const removed = [];

for (const relative of GENERATED_CLEAN_TARGETS) {
  const target = path.resolve(root, relative);
  if (!isWithinRoot(root, target) || target === root) {
    throw new Error(`Target cleanup tidak aman: ${relative}`);
  }
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new Error(`Cleanup menolak symbolic link: ${relative}`);
    removed.push(relative);
    if (!dryRun) await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (!removed.length) {
  console.log("Tidak ada artefak generated yang perlu dibersihkan.");
} else {
  console.log(`${dryRun ? "Akan menghapus" : "Artefak generated dihapus"}: ${removed.join(", ")}`);
}
