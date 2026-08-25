import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  LEGACY_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_AUTH_ENV_KEYS,
  SETTINGS_ENV_KEYS,
  WEB_PUSH_ENV_KEYS,
  optionalGroupStatus,
  parseEnvironmentText,
  validateWebPushEnvironment,
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

export const DEVELOPMENT_SETTINGS_ENV_KEYS = SETTINGS_ENV_KEYS;

const FORBIDDEN_DEVELOPMENT_KEYS = Object.freeze([...LEGACY_ENV_KEYS, ...PRODUCTION_AUTH_ENV_KEYS]);

const groupValidation = (values = {}) => {
  const googleBridge = optionalGroupStatus(values, GOOGLE_BRIDGE_ENV_KEYS);
  const webPush = validateWebPushEnvironment(values);
  const incompleteGoogleBridge = googleBridge.enabled && !googleBridge.complete ? googleBridge.missing : [];
  const incompleteWebPush = webPush.enabled && !webPush.complete ? webPush.missing : [];
  const missingWebPush = webPush.enabled ? [] : [...WEB_PUSH_ENV_KEYS];
  const invalidWebPush = webPush.complete ? webPush.invalid : [];
  return { googleBridge, webPush, incompleteGoogleBridge, incompleteWebPush, missingWebPush, invalidWebPush };
};

export const validateDevelopmentEnvironment = (values = {}) => {
  const missing = CORE_RUNTIME_ENV_KEYS.filter((key) => !String(values[key] ?? "").trim());
  const forbidden = FORBIDDEN_DEVELOPMENT_KEYS.filter((key) => Object.hasOwn(values, key));
  const groups = groupValidation(values);
  const environmentMismatch = String(values.DATABASE_ENVIRONMENT || "").trim().toLowerCase() !== "development";
  return {
    valid: !missing.length
      && !environmentMismatch
      && !forbidden.length
      && !groups.incompleteGoogleBridge.length
      && !groups.incompleteWebPush.length
      && !groups.missingWebPush.length
      && !groups.invalidWebPush.length,
    missing,
    forbidden,
    environmentMismatch,
    ...groups,
  };
};

export const validateDevelopmentSettingsEnvironment = (values = {}) => {
  const forbidden = FORBIDDEN_DEVELOPMENT_KEYS.filter((key) => Object.hasOwn(values, key));
  const groups = groupValidation(values);
  return {
    valid: !forbidden.length
      && !groups.incompleteGoogleBridge.length
      && !groups.incompleteWebPush.length
      && !groups.missingWebPush.length
      && !groups.invalidWebPush.length,
    forbidden,
    ...groups,
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

const validationError = (status, { settingsOnly }) => {
  const messages = [];
  if (!settingsOnly && status.missing?.length) messages.push(`key wajib belum lengkap: ${status.missing.join(", ")}`);
  if (status.forbidden.length) messages.push(`key legacy/forbidden terdeteksi: ${status.forbidden.join(", ")}`);
  if (status.environmentMismatch) messages.push("DATABASE_ENVIRONMENT untuk Development wajib bernilai development");
  if (status.incompleteGoogleBridge.length) messages.push(`Google bridge belum lengkap: ${status.incompleteGoogleBridge.join(", ")}`);
  if (status.missingWebPush.length) messages.push(`Web Push wajib belum tersedia: ${status.missingWebPush.join(", ")}`);
  if (status.incompleteWebPush.length) messages.push(`Web Push belum lengkap: ${status.incompleteWebPush.join(", ")}`);
  if (status.invalidWebPush.length) messages.push(`Web Push tidak valid: ${status.invalidWebPush.join(", ")}`);
  return messages;
};

export const pushDevelopmentEnvironment = async ({
  cwd = projectRoot,
  envPath = path.join(cwd, ".env.local"),
  projectRunner = runProjectCheck,
  runner = runEnvAdd,
  settingsOnly = false,
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
  const status = settingsOnly
    ? validateDevelopmentSettingsEnvironment(values)
    : validateDevelopmentEnvironment(values);
  if (!status.valid) {
    throw Object.assign(
      new Error(`Environment Development tidak valid — ${validationError(status, { settingsOnly }).join("; ")}.`),
      { code: "DEVELOPMENT_ENV_INVALID", ...status },
    );
  }

  const keysToSync = (settingsOnly ? DEVELOPMENT_SETTINGS_ENV_KEYS : DEVELOPMENT_ENV_KEYS)
    .filter((key) => String(values[key] ?? "").trim());
  try {
    await projectRunner({ cwd });
    for (const key of keysToSync) {
      console.log(`Sinkronisasi ${key} → Vercel Development`);
      await runner({ cwd, key, value: values[key] });
    }
  } finally {
    await cleanEnvironmentFile({ file: envPath, allowMissing: true });
  }

  console.log(`Selesai: ${keysToSync.length} environment ${settingsOnly ? "settings" : "canonical"} tersinkron ke Development.`);
  console.log("npm run dev pada komputer tepercaya akan menarik Development terbaru secara otomatis.");
  return { synced: [...keysToSync], settingsOnly };
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  pushDevelopmentEnvironment({ settingsOnly: process.argv.includes("--settings-only") }).catch((error) => {
    console.error(error?.message || "Sinkronisasi Development environment gagal.");
    process.exitCode = 1;
  });
}
