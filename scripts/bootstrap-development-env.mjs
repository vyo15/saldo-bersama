import { spawn } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  environmentStatus,
  parseEnvironmentText,
  sanitizePulledEnvironment,
} from "./runtime-environment.mjs";

const VERCEL_CLI_VERSION = "58.4.4";

const defaultRunCli = (args, { cwd, stdio = "inherit" } = {}) => new Promise((resolve, reject) => {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(executable, ["--yes", `vercel@${VERCEL_CLI_VERSION}`, ...args], {
    cwd,
    stdio,
    env: process.env,
    windowsHide: false,
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve({ code: 0 });
    else reject(Object.assign(new Error(`Vercel CLI gagal (${signal || code || "unknown"}).`), { code: "VERCEL_CLI_FAILED", exitCode: code, signal }));
  });
});

const preserveExistingFile = async (sourcePath, backupPath) => {
  try {
    await rename(sourcePath, backupPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
};

export const ensureDevelopmentEnvironment = async ({
  projectRoot,
  runCli = defaultRunCli,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  log = console.log,
  warn = console.warn,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");
  const envPath = path.join(projectRoot, ".env.local");
  let originalEnvironment = null;
  try { originalEnvironment = await readFile(envPath, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const currentValues = originalEnvironment === null ? {} : parseEnvironmentText(originalEnvironment);
  const currentStatus = environmentStatus(currentValues);
  if (currentStatus.complete) return { source: "existing", envPath, missing: [] };

  if (!interactive) {
    throw Object.assign(new Error(`Konfigurasi development belum lengkap: ${currentStatus.missing.join(", ")}. Jalankan npm run dev dari terminal interaktif.`), { code: "DEV_ENV_INTERACTIVE_REQUIRED" });
  }

  log("\n  Konfigurasi lokal belum lengkap. Menyiapkan Vercel Development Environment...");
  try {
    await runCli(["whoami"], { cwd: projectRoot, stdio: "ignore" });
  } catch {
    log("  Login Vercel diperlukan satu kali pada perangkat ini.");
    await runCli(["login"], { cwd: projectRoot, stdio: "inherit" });
  }

  const temporaryPath = path.join(projectRoot, `.env.local.vercel-${process.pid}.tmp`);
  const backupPath = path.join(projectRoot, `.env.local.bootstrap-${process.pid}.bak`);
  let linked = false;
  try {
    try {
      await runCli(["env", "pull", temporaryPath, "--environment=development", "--yes"], { cwd: projectRoot, stdio: "inherit" });
    } catch {
      log("  Folder belum terhubung ke project Vercel. Menghubungkan berdasarkan repository Git...");
      await runCli(["link", "--yes"], { cwd: projectRoot, stdio: "inherit" });
      linked = true;
      await runCli(["env", "pull", temporaryPath, "--environment=development", "--yes"], { cwd: projectRoot, stdio: "inherit" });
    }

    const sanitized = sanitizePulledEnvironment(await readFile(temporaryPath, "utf8"));
    const pulledStatus = environmentStatus(parseEnvironmentText(sanitized));
    if (!pulledStatus.complete) {
      throw Object.assign(new Error(`Vercel Development Environment belum lengkap: ${pulledStatus.missing.join(", ")}. Lengkapi melalui Vercel Project Settings.`), { code: "VERCEL_ENV_INCOMPLETE", missing: pulledStatus.missing });
    }

    await writeFile(temporaryPath, sanitized, { encoding: "utf8", mode: 0o600 });
    const hadExisting = await preserveExistingFile(envPath, backupPath);
    try {
      await rename(temporaryPath, envPath);
      if (hadExisting) await rm(backupPath, { force: true });
    } catch (error) {
      if (hadExisting) await rename(backupPath, envPath).catch(() => {});
      throw error;
    }
    log(`  Environment Development siap${linked ? " dan project berhasil dihubungkan" : ""}. Secret tidak ditampilkan.`);
    return { source: "vercel", envPath, missing: [] };
  } catch (error) {
    // `vercel link` dapat menulis VERCEL_OIDC_TOKEN ke .env.local.  Bila
    // bootstrap gagal, kembalikan persis file sebelum proses agar secret
    // sementara tidak tertinggal dan konfigurasi parsial pengguna tidak rusak.
    if (originalEnvironment === null) await rm(envPath, { force: true }).catch(() => {});
    else await writeFile(envPath, originalEnvironment, { encoding: "utf8", mode: 0o600 }).catch(() => {});
    warn(`  Penyiapan environment gagal: ${error.message}`);
    throw error;
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
    await rm(backupPath, { force: true }).catch(() => {});
  }
};
