import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_CLEAN_TARGETS, isWithinRoot } from "./artifact-policy.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const cleanGeneratedArtifacts = async ({
  projectRoot = defaultRoot,
  dryRun = false,
  logger = console,
} = {}) => {
  const root = path.resolve(projectRoot);
  const removed = [];

  for (const relative of GENERATED_CLEAN_TARGETS) {
    const target = path.resolve(root, relative);
    if (!isWithinRoot(root, target) || target === root) {
      throw new Error(`Target cleanup tidak aman: ${relative}`);
    }
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw new Error(`Cleanup menolak symbolic link: ${relative}`);
      removed.push(relative);
      if (!dryRun) await rm(target, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  if (!removed.length) {
    logger.log("Tidak ada artefak generated yang perlu dibersihkan.");
  } else {
    logger.log(`${dryRun ? "Akan menghapus" : "Artefak generated dihapus"}: ${removed.join(", ")}`);
  }
  return removed;
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const apply = process.argv.includes("--apply");
  await cleanGeneratedArtifacts({ dryRun: !apply });
  if (!apply) console.log("Dry-run saja. Jalankan `npm run clean -- --apply` untuk benar-benar menghapus artefak generated.");
}
