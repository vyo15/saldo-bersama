import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { cleanEnvironmentFile, cleanEnvironmentText, writeEnvironmentFileAtomic } from "./clean-local-environment.mjs";
import { buildVercelInvocation } from "./push-vercel-production-env.mjs";
import {
  developmentEnvironmentStatus,
  parseEnvironmentText,
  PRODUCTION_AUTH_ENV_KEYS,
} from "./runtime-environment.mjs";

export const DEFAULT_VERCEL_PROJECT = "saldo-bersama";

export const normalizeVercelGitignore = async (projectRoot) => {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let source;
  try { source = await readFile(gitignorePath, "utf8"); } catch { return false; }
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const cleaned = lines.filter((line) => line !== ".vercel" && line !== ".env*").join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  if (cleaned === source) return false;
  await writeFile(gitignorePath, cleaned, "utf8");
  return true;
};


const localEnvironmentState = async (envPath) => {
  const cleaned = await cleanEnvironmentFile({ file: envPath, allowMissing: true });
  if (!cleaned.exists) return { exists: false, source: "", complete: false, missing: [], invalid: [], removed: [] };
  const status = developmentEnvironmentStatus(parseEnvironmentText(cleaned.text));
  return { exists: true, source: cleaned.text, removed: cleaned.removed, ...status };
};

export const runVercelCommand = ({ cwd, args, stdio = "pipe" }) => new Promise((resolve, reject) => {
  const invocation = buildVercelInvocation(args);
  const child = spawn(invocation.executable, invocation.args, {
    cwd,
    stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  if (stdio !== "inherit") {
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  }

  child.once("error", reject);
  child.once("close", (code) => resolve({ code, stdout, stderr }));
});

const assertSuccessful = (result, code, message) => {
  if (result?.code === 0) return;
  throw Object.assign(new Error(message), { code, exitCode: result?.code ?? null });
};

export const ensureVercelLogin = async ({ cwd, runner }) => {
  let result = await runner({ cwd, args: ["whoami", "--no-color"] });
  if (result.code === 0) return;

  console.log("Vercel CLI belum login. Membuka proses login satu kali...");
  result = await runner({ cwd, args: ["login"], stdio: "inherit" });
  assertSuccessful(result, "VERCEL_LOGIN_FAILED", "Login Vercel gagal atau dibatalkan.");

  result = await runner({ cwd, args: ["whoami", "--no-color"] });
  assertSuccessful(result, "VERCEL_LOGIN_UNAVAILABLE", "Vercel CLI belum memiliki sesi login yang valid.");
};

export const ensureVercelProject = async ({ cwd, projectName, runner }) => {
  console.log(`Memastikan repository terhubung ke project Vercel ${projectName}...`);
  let result = await runner({
    cwd,
    args: ["link", "--yes", "--project", projectName],
    stdio: "inherit",
  });

  if (result.code !== 0) {
    console.log("Link otomatis belum berhasil. Membuka pemilihan project Vercel satu kali...");
    result = await runner({ cwd, args: ["link"], stdio: "inherit" });
    assertSuccessful(result, "VERCEL_LINK_FAILED", "Project Vercel tidak berhasil dihubungkan.");
  }

  await normalizeVercelGitignore(cwd);
  result = await runner({ cwd, args: ["env", "ls", "development", "--no-color"] });
  assertSuccessful(
    result,
    "VERCEL_DEVELOPMENT_ENV_UNAVAILABLE",
    "Vercel Development Environment tidak dapat diakses untuk project yang terhubung.",
  );
};

const pullDevelopmentEnvironment = async ({ cwd, target, runner }) => {
  const result = await runner({
    cwd,
    args: ["env", "pull", target, "--yes", "--no-color"],
    stdio: "inherit",
  });
  assertSuccessful(
    result,
    "VERCEL_DEVELOPMENT_ENV_PULL_FAILED",
    "Environment Development gagal ditarik dari Vercel.",
  );
};

const developmentProblemMessage = (state) => {
  const details = [];
  if (state.missing?.length) details.push(`belum lengkap: ${state.missing.join(", ")}`);
  if (state.invalid?.length) details.push(`tidak valid: ${state.invalid.join(", ")}`);
  return details.join("; ");
};

export const developmentEnvironmentRemediation = (status = {}) => {
  const coreMissing = status.core?.missing || [];
  const databaseMarkerMissing = coreMissing.includes("DATABASE_ENVIRONMENT");
  const otherCoreMissing = coreMissing.filter((key) => key !== "DATABASE_ENVIRONMENT");

  if (databaseMarkerMissing && otherCoreMissing.length === 0) {
    return [
      "Vercel Development belum memiliki DATABASE_ENVIRONMENT.",
      "Source v15 tetap menolak satu Turso database dipakai bersamaan oleh Development dan Production.",
      "Jangan menambahkan DATABASE_ENVIRONMENT=development bila TURSO_DATABASE_URL/TURSO_AUTH_TOKEN masih menunjuk database Production.",
      "Buat database Turso Development terpisah, arahkan .env.local ke URL/token Development, set DATABASE_ENVIRONMENT=development,",
      "lalu jalankan npm run db:migrate, npm run db:bind-environment -- development, npm run db:integrity, dan npm run env:push:development.",
    ].join(" ");
  }

  if (coreMissing.length) {
    return "Lengkapi core environment pada .env.local di komputer tepercaya, lalu sinkronkan dengan npm run env:push:development. Untuk VITE_FIREBASE_AUTH_DOMAIN project ini gunakan saldo-bersama.firebaseapp.com.";
  }

  return "Seed konfigurasi settings dari komputer tepercaya menggunakan npm run env:push:development -- --settings-only.";
};

const environmentAssignmentKey = (line) => {
  const match = String(line).match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  return match?.[1] || null;
};

const withoutEnvironmentKeys = (source, keys) => {
  const blocked = new Set(keys);
  return `${String(source || "")
    .split(/\r?\n/)
    .filter((line) => !blocked.has(environmentAssignmentKey(line)))
    .join("\n")
    .replace(/\n*$/, "")}\n`;
};


export const mergeDevelopmentEnvironment = ({ pulledSource = "" } = {}) => {
  const cleanedPulled = cleanEnvironmentText(pulledSource);
  const developmentOnly = withoutEnvironmentKeys(cleanedPulled.text, PRODUCTION_AUTH_ENV_KEYS);
  return {
    text: developmentOnly,
    removed: [...new Set([
      ...cleanedPulled.removed,
      ...PRODUCTION_AUTH_ENV_KEYS.filter((key) => Object.hasOwn(parseEnvironmentText(cleanedPulled.text), key)),
    ])].sort(),
  };
};

export const ensureDevelopmentEnvironment = async ({
  projectRoot,
  projectName = DEFAULT_VERCEL_PROJECT,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  runner = runVercelCommand,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");

  const envPath = path.join(projectRoot, ".env.local");
  const local = await localEnvironmentState(envPath);

  if (!interactive) {
    if (local.complete) return { source: "local", envPath, missing: [], invalid: [], removed: local.removed };
    const localCode = local.exists ? "LOCAL_ENV_INCOMPLETE" : "LOCAL_ENV_NOT_FOUND";
    const localMessage = local.exists
      ? `.env.local ${developmentProblemMessage(local)}.`
      : ".env.local belum tersedia.";
    throw Object.assign(
      new Error(`${localMessage} Bootstrap Vercel memerlukan terminal interaktif.`),
      { code: localCode, envPath, missing: local.missing, invalid: local.invalid },
    );
  }

  if (local.complete) {
    console.log("Memperbarui environment canonical dari Vercel Development...");
  } else if (local.exists) {
    console.log(`.env.local ${developmentProblemMessage(local)}. Menyiapkan environment otomatis dari Vercel Development...`);
  } else {
    console.log(".env.local belum tersedia. Menyiapkan environment otomatis dari Vercel Development...");
  }

  const temporaryPath = path.join(projectRoot, `.env.local.vercel-${process.pid}-${Date.now()}.tmp`);

  try {
    await ensureVercelLogin({ cwd: projectRoot, runner });
    await ensureVercelProject({ cwd: projectRoot, projectName, runner });
    await pullDevelopmentEnvironment({ cwd: projectRoot, target: temporaryPath, runner });

    const pulledSource = await readFile(temporaryPath, "utf8");
    const merged = mergeDevelopmentEnvironment({ pulledSource });
    const values = parseEnvironmentText(withoutEnvironmentKeys(merged.text, PRODUCTION_AUTH_ENV_KEYS));
    const status = developmentEnvironmentStatus(values);
    if (!status.complete) {
      const problem = developmentProblemMessage(status);
      const remediation = developmentEnvironmentRemediation(status);
      throw Object.assign(
        new Error(`Vercel Development belum siap untuk runtime lokal: ${problem}. ${remediation}`),
        { code: "VERCEL_DEVELOPMENT_ENV_INCOMPLETE", missing: status.missing, invalid: status.invalid },
      );
    }

    await writeFile(temporaryPath, merged.text, { encoding: "utf8", mode: 0o600 });
    await writeEnvironmentFileAtomic(envPath, merged.text);
    console.log("Environment Development terbaru berhasil ditarik dan disimpan sebagai .env.local.");
    return { source: "vercel-development", envPath, missing: [], invalid: [], removed: merged.removed };
  } finally {
    await normalizeVercelGitignore(projectRoot).catch(() => false);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    const cleanedLocal = await cleanEnvironmentFile({ file: envPath, allowMissing: true });
    if (!local.exists && cleanedLocal.exists && !Object.keys(parseEnvironmentText(cleanedLocal.text)).length) {
      await rm(envPath, { force: true }).catch(() => undefined);
    }
  }
};
