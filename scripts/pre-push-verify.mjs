import process from "node:process";
import { runVerificationWithCleanup } from "./verify-project.mjs";

try {
  console.log("\nSaldo Bersama pre-push Auto Quality Guard...");
  await runVerificationWithCleanup();
  console.log("\nPre-push PASS. Push dilanjutkan.");
} catch (error) {
  console.error(`\nPUSH DIBATALKAN: ${error?.message || "Quality gate gagal."}`);
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
}
