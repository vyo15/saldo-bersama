import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createCleanArchive } from "./create-clean-archive.mjs";
import { installGitHooks } from "./install-git-hooks.mjs";
import { executeVerificationStep, runVerificationWithCleanup } from "./verify-project.mjs";

const UNVERIFIED_REPORT_PATH = "docs/UNVERIFIED_BUILD_REPORT.md";
const DEFAULT_UNVERIFIED_OUTPUT = "../saldo-bersama-UNVERIFIED.zip";
const MAX_REPORT_OUTPUT_CHARS = 60_000;
const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

const secretEnvironmentValues = () => Object.entries(process.env)
  .filter(([key, value]) => (
    /(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AUTH|COOKIE|SESSION|WEBHOOK|SIGNING)/i.test(key)
    && typeof value === "string"
    && value.length >= 6
  ))
  .map(([, value]) => value)
  .sort((a, b) => b.length - a.length);

export const sanitizeVerificationOutput = (value) => {
  let sanitized = String(value || "")
    .replace(ANSI_PATTERN, "")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|secret|password|credential|code|verifier)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(token|secret|password|credential|code|verifier)=([^\s&]+)/gi, "$1=[REDACTED]");

  for (const secret of secretEnvironmentValues()) {
    sanitized = sanitized.split(secret).join("[REDACTED_ENV]");
  }

  if (sanitized.length > MAX_REPORT_OUTPUT_CHARS) {
    sanitized = `[output dipotong; menampilkan ${MAX_REPORT_OUTPUT_CHARS} karakter terakhir]\n${sanitized.slice(-MAX_REPORT_OUTPUT_CHARS)}`;
  }
  return sanitized.trim();
};

const unverifiedArchiveArgs = (args = []) => {
  if (!args[0]) return [DEFAULT_UNVERIFIED_OUTPUT];
  const requested = String(args[0]);
  if (/UNVERIFIED/i.test(path.basename(requested))) return [requested];
  const extension = path.extname(requested);
  const stem = extension ? requested.slice(0, -extension.length) : requested;
  return [`${stem}-UNVERIFIED${extension || ".zip"}`];
};

export const buildVerificationFailureReport = ({ error, transcript = "", archiveName = "saldo-bersama-UNVERIFIED.zip" } = {}) => {
  const safeTranscript = sanitizeVerificationOutput(transcript);
  const safeMessage = sanitizeVerificationOutput(error?.message || "Quality gate gagal tanpa detail error.");
  const failedStep = sanitizeVerificationOutput(error?.step || "preflight/unknown");
  const errorCode = sanitizeVerificationOutput(error?.code || "VERIFY_FAILED");
  const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;

  return `# UNVERIFIED Build Report\n\n`
    + `> **STATUS: FAILED / UNVERIFIED**\n\n`
    + `Archive \`${archiveName}\` dibuat hanya untuk diagnosis dan pertukaran source. `
    + `Archive ini **bukan release/deployment artifact** dan tidak boleh dianggap lolos quality gate.\n\n`
    + `- Waktu (UTC): ${new Date().toISOString()}\n`
    + `- Verification step: \`${failedStep}\`\n`
    + `- Error code: \`${errorCode}\`\n`
    + `- Exit code: \`${exitCode}\`\n`
    + `- Ringkasan: ${safeMessage || "Verification gagal."}\n\n`
    + `## Cara melanjutkan\n\n`
    + `1. Perbaiki error quality gate di source utama.\n`
    + `2. Jalankan kembali \`npm run zip\`.\n`
    + `3. Hanya \`saldo-bersama-clean.zip\` yang dihasilkan setelah verification PASS yang boleh dianggap verified.\n`
    + `4. File laporan ini hanya ditambahkan ke staging ZIP UNVERIFIED; source project asli tidak diubah olehnya.\n\n`
    + `## Output verification yang sudah disanitasi\n\n`
    + `\`\`\`text\n${safeTranscript || safeMessage || "Tidak ada output step yang berhasil direkam."}\n\`\`\`\n`;
};

const runVerificationWithTranscript = async () => {
  const transcript = [];
  const logger = {
    log(message = "") {
      const text = String(message);
      transcript.push(text);
      console.log(text);
    },
  };

  try {
    await runVerificationWithCleanup({
      logger,
      runStep: (step) => {
        const result = executeVerificationStep(step, { stdio: "pipe" });
        if (result.stdout) {
          process.stdout.write(result.stdout);
          transcript.push(result.stdout);
        }
        if (result.stderr) {
          process.stderr.write(result.stderr);
          transcript.push(result.stderr);
        }
        return result;
      },
    });
    return { error: null, transcript: transcript.join("\n") };
  } catch (error) {
    return { error, transcript: transcript.join("\n") };
  }
};

export const createVerifiedCleanArchive = async (args = []) => {
  await installGitHooks();
  console.log("Menjalankan full verification sebelum membuat clean source ZIP...");

  const verification = await runVerificationWithTranscript();
  if (!verification.error) {
    const archive = await createCleanArchive(args);
    return { ...archive, verified: true, verificationError: null };
  }

  const fallbackArgs = unverifiedArchiveArgs(args);
  const archiveName = path.basename(fallbackArgs[0]);
  const report = buildVerificationFailureReport({
    error: verification.error,
    transcript: verification.transcript,
    archiveName,
  });

  console.error(`\nVERIFICATION GAGAL: ${verification.error?.message || "Quality gate gagal."}`);
  console.error("Clean ZIP diagnostik tetap akan dibuat dengan label UNVERIFIED; archive ini tidak boleh dipakai untuk release/deploy.");

  const archive = await createCleanArchive(fallbackArgs, {
    extraFiles: { [UNVERIFIED_REPORT_PATH]: report },
  });
  console.error(`ZIP diagnostik UNVERIFIED dibuat: ${archive.output}`);

  return {
    ...archive,
    verified: false,
    verificationError: verification.error,
    reportPath: UNVERIFIED_REPORT_PATH,
  };
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    const result = await createVerifiedCleanArchive(process.argv.slice(2));
    if (!result.verified) {
      process.exitCode = Number.isInteger(result.verificationError?.exitCode)
        ? result.verificationError.exitCode
        : 1;
    }
  } catch (error) {
    console.error(`\nZIP GAGAL DIBUAT: ${error?.message || "Verification atau packaging gagal."}`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
