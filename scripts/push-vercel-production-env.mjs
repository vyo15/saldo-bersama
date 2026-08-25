import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_AUTH_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
  optionalGroupStatus,
  parseEnvironmentText,
  validateWebPushEnvironment,
} from "./runtime-environment.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLIC_PRODUCTION_KEYS = Object.freeze([
  "VITE_APP_NAME",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "ALLOWED_ORIGINS",
  "DATABASE_ENVIRONMENT",
  "GOOGLE_BRIDGE_WEB_APP_URL",
  "VITE_VAPID_PUBLIC_KEY",
  "VAPID_SUBJECT",
  ...OPTIONAL_LOGGING_ENV_KEYS,
]);

export const SENSITIVE_PRODUCTION_KEYS = Object.freeze(
  PRODUCTION_SYNC_ENV_KEYS.filter((key) => !PUBLIC_PRODUCTION_KEYS.includes(key)),
);

export const PRODUCTION_ENV_KEYS = PRODUCTION_SYNC_ENV_KEYS;

const forbiddenKeys = Object.freeze([
  "INTERNAL_SHARED_SECRET",
  "APPS_SCRIPT_WEB_APP_URL",
  "FIREBASE_WEB_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VITE_DEV_MODE",
  "VITE_DEMO_MODE",
]);

export const validateProductionEnvironment = (values = {}) => {
  const missing = [...CORE_RUNTIME_ENV_KEYS, ...PRODUCTION_AUTH_ENV_KEYS].filter((key) => !String(values[key] ?? "").trim());
  const forbidden = forbiddenKeys.filter((key) => Object.hasOwn(values, key));
  const googleBridge = optionalGroupStatus(values, GOOGLE_BRIDGE_ENV_KEYS);
  const webPush = validateWebPushEnvironment(values);
  const environmentMismatch = String(values.DATABASE_ENVIRONMENT || "").trim().toLowerCase() !== "production";
  const incompleteGoogleBridge = googleBridge.enabled && !googleBridge.complete ? googleBridge.missing : [];
  const incompleteWebPush = webPush.enabled && !webPush.complete ? webPush.missing : [];
  const invalidWebPush = webPush.complete ? webPush.invalid : [];
  return {
    valid: !missing.length && !forbidden.length && !environmentMismatch && !incompleteGoogleBridge.length && !incompleteWebPush.length && !invalidWebPush.length,
    missing,
    forbidden,
    environmentMismatch,
    incompleteGoogleBridge,
    incompleteWebPush,
    invalidWebPush,
  };
};

export const buildVercelInvocation = (vercelArgs, { platform = process.platform, comspec = process.env.ComSpec } = {}) => {
  if (platform === "win32") {
    return {
      executable: comspec || "cmd.exe",
      args: ["/d", "/s", "/c", "npx.cmd", "--yes", "vercel", ...vercelArgs],
    };
  }
  return { executable: "npx", args: ["--yes", "vercel", ...vercelArgs] };
};

const spawnVercel = ({ cwd, vercelArgs, stdio }) => {
  const invocation = buildVercelInvocation(vercelArgs);
  return spawn(invocation.executable, invocation.args, {
    cwd,
    stdio,
    windowsHide: true,
  });
};

const runVercelProjectCheck = ({ cwd }) => new Promise((resolve, reject) => {
  const child = spawnVercel({
    cwd,
    vercelArgs: ["env", "ls", "production", "--no-color"],
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) resolve();
    else reject(Object.assign(
      new Error("Project Vercel tidak dapat dipastikan. Pastikan CLI sudah login dan repository terhubung ke project yang benar."),
      { code: "VERCEL_PROJECT_UNAVAILABLE", exitCode: code, reason: stderr.trim() || null },
    ));
  });
});

const runVercelEnvAdd = ({ cwd, key, value, sensitive }) => new Promise((resolve, reject) => {
  const vercelArgs = ["env", "add", key, "production", "--force"];
  if (sensitive) vercelArgs.push("--sensitive");

  const child = spawnVercel({
    cwd,
    vercelArgs,
    stdio: ["pipe", "inherit", "inherit"],
  });

  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) resolve();
    else reject(Object.assign(new Error(`Gagal menyinkronkan ${key} ke Vercel Production.`), { code: "VERCEL_ENV_SYNC_FAILED", exitCode: code, key }));
  });

  child.stdin.on("error", (error) => {
    if (error?.code !== "EPIPE") reject(error);
  });
  child.stdin.end(value);
});

export const pushProductionEnvironment = async ({
  cwd = projectRoot,
  envPath = path.join(cwd, ".env.production.local"),
  projectRunner = runVercelProjectCheck,
  runner = runVercelEnvAdd,
} = {}) => {
  const source = await readFile(envPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") throw Object.assign(new Error(`Profile Production lokal tidak ditemukan: ${envPath}`), { code: "LOCAL_ENV_NOT_FOUND" });
    throw error;
  });
  const values = parseEnvironmentText(source);
  const status = validateProductionEnvironment(values);
  if (!status.valid) {
    const messages = [];
    if (status.missing.length) messages.push(`key wajib belum lengkap: ${status.missing.join(", ")}`);
    if (status.forbidden.length) messages.push(`key legacy terdeteksi: ${status.forbidden.join(", ")}`);
    if (status.environmentMismatch) messages.push("DATABASE_ENVIRONMENT untuk Production wajib bernilai production");
    if (status.incompleteGoogleBridge.length) messages.push(`Google bridge belum lengkap: ${status.incompleteGoogleBridge.join(", ")}`);
    if (status.incompleteWebPush.length) messages.push(`Web Push belum lengkap: ${status.incompleteWebPush.join(", ")}`);
    if (status.invalidWebPush.length) messages.push(`Web Push tidak valid: ${status.invalidWebPush.join(", ")}`);
    throw Object.assign(new Error(`Environment Production tidak valid — ${messages.join("; ")}.`), { code: "PRODUCTION_ENV_INVALID", ...status });
  }

  await projectRunner({ cwd });

  const keysToSync = PRODUCTION_ENV_KEYS.filter((key) => String(values[key] ?? "").trim());
  for (const key of keysToSync) {
    const sensitive = SENSITIVE_PRODUCTION_KEYS.includes(key);
    console.log(`Sinkronisasi ${key} → Vercel Production${sensitive ? " (sensitive)" : ""}`);
    await runner({ cwd, key, value: values[key], sensitive });
  }

  console.log(`Selesai: ${keysToSync.length} environment canonical tersinkron ke Production.`);
  console.log("Jalankan deployment Production baru agar nilai terbaru dipakai.");
  return { synced: [...keysToSync] };
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  pushProductionEnvironment().catch((error) => {
    console.error(error?.message || "Sinkronisasi environment gagal.");
    process.exitCode = 1;
  });
}
