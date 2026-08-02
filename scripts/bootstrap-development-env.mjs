import { spawn } from "node:child_process";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { cleanEnvironmentFile, cleanEnvironmentText } from "./clean-local-environment.mjs";
import { buildVercelInvocation } from "./push-vercel-production-env.mjs";
import {
  environmentStatus,
  parseEnvironmentText,
} from "./runtime-environment.mjs";

export const DEFAULT_VERCEL_PROJECT = "saldo-bersama";

const localEnvironmentState = async (envPath) => {
  const cleaned = await cleanEnvironmentFile({ file: envPath, allowMissing: true });
  if (!cleaned.exists) return { exists: false, source: "", complete: false, missing: [], removed: [] };
  const status = environmentStatus(parseEnvironmentText(cleaned.text));
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

export const ensureDevelopmentEnvironment = async ({
  projectRoot,
  projectName = DEFAULT_VERCEL_PROJECT,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  runner = runVercelCommand,
} = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");

  const envPath = path.join(projectRoot, ".env.local");
  const local = await localEnvironmentState(envPath);
  if (local.complete) return { source: "local", envPath, missing: [], removed: local.removed };

  const localCode = local.exists ? "LOCAL_ENV_INCOMPLETE" : "LOCAL_ENV_NOT_FOUND";
  const localMessage = local.exists
    ? `.env.local belum lengkap: ${local.missing.join(", ")}.`
    : ".env.local belum tersedia.";

  if (!interactive) {
    throw Object.assign(
      new Error(`${localMessage} Bootstrap Vercel memerlukan terminal interaktif.`),
      { code: localCode, envPath, missing: local.missing },
    );
  }

  console.log(`${localMessage} Menyiapkan environment otomatis dari Vercel Development...`);
  const temporaryPath = path.join(projectRoot, `.env.local.vercel-${process.pid}-${Date.now()}.tmp`);

  try {
    await ensureVercelLogin({ cwd: projectRoot, runner });
    await ensureVercelProject({ cwd: projectRoot, projectName, runner });
    await pullDevelopmentEnvironment({ cwd: projectRoot, target: temporaryPath, runner });

    const pulledSource = await readFile(temporaryPath, "utf8");
    const cleaned = cleanEnvironmentText(pulledSource);
    const values = parseEnvironmentText(cleaned.text);
    const status = environmentStatus(values);
    if (!status.complete) {
      throw Object.assign(
        new Error(`Vercel Development belum memiliki environment core lengkap: ${status.missing.join(", ")}. Seed sekali dari komputer yang masih memiliki .env.local menggunakan npm run env:push:development.`),
        { code: "VERCEL_DEVELOPMENT_ENV_INCOMPLETE", missing: status.missing },
      );
    }

    await writeFile(temporaryPath, cleaned.text, { encoding: "utf8", mode: 0o600 });
    await chmod(temporaryPath, 0o600).catch(() => undefined);
    await rename(temporaryPath, envPath);
    console.log("Environment Development berhasil ditarik dan disimpan sebagai .env.local.");
    return { source: "vercel-development", envPath, missing: [], removed: cleaned.removed };
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    const cleanedLocal = await cleanEnvironmentFile({ file: envPath, allowMissing: true });
    if (!local.exists && cleanedLocal.exists && !Object.keys(parseEnvironmentText(cleanedLocal.text)).length) {
      await rm(envPath, { force: true }).catch(() => undefined);
    }
  }
};
