import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCleanArchive } from "./create-clean-archive.mjs";
import { installGitHooks } from "./install-git-hooks.mjs";
import { runVerificationWithCleanup } from "./verify-project.mjs";

export const createVerifiedCleanArchive = async (args = []) => {
  await installGitHooks();
  console.log("Menjalankan full verification sebelum membuat clean source ZIP...");
  await runVerificationWithCleanup();
  return createCleanArchive(args);
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    await createVerifiedCleanArchive(process.argv.slice(2));
  } catch (error) {
    console.error(`\nZIP DIBATALKAN: ${error?.message || "Verification atau packaging gagal."}`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
