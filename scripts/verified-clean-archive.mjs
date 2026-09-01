import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCleanArchive } from "./create-clean-archive.mjs";
import { installGitHooks } from "./install-git-hooks.mjs";
import { runVerificationWithCleanup } from "./verify-project.mjs";

export const createVerifiedCleanArchive = async (
  args = [],
  {
    installHooks = installGitHooks,
    verify = runVerificationWithCleanup,
    createArchive = createCleanArchive,
  } = {},
) => {
  await installHooks();
  console.log("Menjalankan full verification sebelum membuat clean source ZIP...");

  // Clean archive hanya boleh dibuat setelah quality gate final PASS.
  // Verification failure harus tetap fail-closed dan tidak boleh menghasilkan
  // artifact baru yang dapat tertukar dengan source release/review.
  await verify();

  const archive = await createArchive(args);
  return { ...archive, verified: true, verificationError: null };
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    await createVerifiedCleanArchive(process.argv.slice(2));
  } catch (error) {
    console.error(`\nZIP GAGAL DIBUAT: ${error?.message || "Verification atau packaging gagal."}`);
    console.error("Tidak ada archive baru yang dibuat. Perbaiki quality gate lalu jalankan kembali `npm run zip`.");
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
