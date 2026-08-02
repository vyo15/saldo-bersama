import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  WEB_PUSH_ENV_KEYS,
  parseEnvironmentText,
} from "./runtime-environment.mjs";
import { cleanEnvironmentFile, cleanEnvironmentText, writeEnvironmentFileAtomic } from "./clean-local-environment.mjs";
import { buildVercelInvocation } from "./push-vercel-production-env.mjs";
import {
  DEFAULT_VERCEL_PROJECT,
  ensureVercelLogin,
  ensureVercelProject,
  runVercelCommand,
} from "./bootstrap-development-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEVELOPMENT_ENV_KEYS = Object.freeze([
  ...CORE_RUNTIME_ENV_KEYS,
  ...OPTIONAL_LOGGING_ENV_KEYS,
  ...GOOGLE_BRIDGE_ENV_KEYS,
  ...WEB_PUSH_ENV_KEYS,
]);

const FORBIDDEN_DEVELOPMENT_KEYS = Object.freeze([
  "INTERNAL_SHARED_SECRET",
  "APPS_SCRIPT_WEB_APP_URL",
  "FIREBASE_WEB_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VITE_DEV_MODE",
  "VITE_DEMO_MODE",
  "SPREADSHEET_ID",
  "MIRROR_SPREADSHEET_ID",
  "GOOGLE_CALENDAR_ID",
  "BACKUP_FOLDER_ID",
  "JOBS_ENDPOINT_URL",
  "VERCEL_OIDC_TOKEN",
]);

const incompleteGroup = (values, keys) => {
  const present = keys.filter((key) => String(values[key] ?? "").trim());
  return present.length > 0 && present.length < keys.length
    ? keys.filter((key) => !present.includes(key))
    : [];
};

export const validateDevelopmentEnvironment = (values = {}) => {
  const missing = CORE_RUNTIME_ENV_KEYS.filter((key) => !String(values[key] ?? "").trim());
  const forbidden = FORBIDDEN_DEVELOPMENT_KEYS.filter((key) => Object.hasOwn(values, key));
  const incompleteGoogleBridge = incompleteGroup(values, GOOGLE_BRIDGE_ENV_KEYS);
  const incompleteWebPush = incompleteGroup(values, WEB_PUSH_ENV_KEYS);
  return {
    valid: !missing.length && !forbidden.length && !incompleteGoogleBridge.length && !incompleteWebPush.length,
    missing,
    forbidden,
    incompleteGoogleBridge,
    incompleteWebPush,
  };
};

const spawnVercel = ({ cwd, args, stdio }) => {
  const invocation = buildVercelInvocation(args);
  return spawn(invocation.executable, invocation.args, {
    cwd,
    stdio,
    windowsHide: true,
  });
};

const runProjectCheck = async ({ cwd }) => {
  await ensureVercelLogin({ cwd, runner: runVercelCommand });
  await ensureVercelProject({ cwd, projectName: DEFAULT_VERCEL_PROJECT, runner: runVercelCommand });
};

const runEnvAdd = ({ cwd, key, value }) => new Promise((resolve, reject) => {
  const child = spawnVercel({
    cwd,
    args: ["env", "add", key, "development", "--force"],
    stdio: ["pipe", "inherit", "inherit"],
  });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code === 0) return resolve();
    reject(Object.assign(
      new Error(`Gagal menyinkronkan ${key} ke Vercel Development.`),
      { code: "VERCEL_DEVELOPMENT_ENV_SYNC_FAILED", exitCode: code, key },
    ));
  });
  child.stdin.on("error", (error) => {
    if (error?.code !== "EPIPE") reject(error);
  });
  child.stdin.end(value);
});

export const pushDevelopmentEnvironment = async ({
  cwd = projectRoot,
  envPath = path.join(cwd, ".env.local"),
  projectRunner = runProjectCheck,
  runner = runEnvAdd,
} = {}) => {
  const source = await readFile(envPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw Object.assign(new Error(`Environment lokal tidak ditemukan: ${envPath}`), { code: "LOCAL_ENV_NOT_FOUND" });
    }
    throw error;
  });
  const cleanedSource = cleanEnvironmentText(source);
  if (cleanedSource.text !== source) await writeEnvironmentFileAtomic(envPath, cleanedSource.text);
  const values = parseEnvironmentText(cleanedSource.text);
  const status = validateDevelopmentEnvironment(values);
  if (!status.valid) {
    const messages = [];
    if (status.missing.length) messages.push(`key wajib belum lengkap: ${status.missing.join(", ")}`);
    if (status.forbidden.length) messages.push(`key legacy/forbidden terdeteksi: ${status.forbidden.join(", ")}`);
    if (status.incompleteGoogleBridge.length) messages.push(`Google bridge belum lengkap: ${status.incompleteGoogleBridge.join(", ")}`);
    if (status.incompleteWebPush.length) messages.push(`Web Push belum lengkap: ${status.incompleteWebPush.join(", ")}`);
    throw Object.assign(
      new Error(`Environment Development tidak valid — ${messages.join("; ")}.`),
      { code: "DEVELOPMENT_ENV_INVALID", ...status },
    );
  }

  const keysToSync = DEVELOPMENT_ENV_KEYS.filter((key) => String(values[key] ?? "").trim());
  try {
    await projectRunner({ cwd });
    for (const key of keysToSync) {
      console.log(`Sinkronisasi ${key} → Vercel Development`);
      await runner({ cwd, key, value: values[key] });
    }
  } finally {
    await cleanEnvironmentFile({ file: envPath, allowMissing: true });
  }

  console.log(`Selesai: ${keysToSync.length} environment canonical tersinkron ke Development.`);
  console.log("Komputer baru kini dapat membuat .env.local otomatis melalui npm run dev.");
  return { synced: [...keysToSync] };
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  pushDevelopmentEnvironment().catch((error) => {
    console.error(error?.message || "Sinkronisasi Development environment gagal.");
    process.exitCode = 1;
  });
}
