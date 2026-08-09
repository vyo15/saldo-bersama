import { WEB_PUSH_ENV_KEYS, validateVapidConfiguration } from "../api/_lib/webPushConfiguration.js";
export { WEB_PUSH_ENV_KEYS };

export const CORE_RUNTIME_ENV_KEYS = Object.freeze([
  "VITE_APP_NAME",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_FIREBASE_API_KEY",
  "ALLOWED_USERS_JSON",
  "ALLOWED_ORIGINS",
  "SESSION_SECRET",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
]);

export const OPTIONAL_LOGGING_ENV_KEYS = Object.freeze([
  "LOG_LEVEL",
]);

export const LEGACY_ENV_KEYS = Object.freeze([
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

export const GOOGLE_BRIDGE_ENV_KEYS = Object.freeze([
  "GOOGLE_BRIDGE_WEB_APP_URL",
  "GOOGLE_BRIDGE_SHARED_SECRET",
  "JOBS_SHARED_SECRET",
]);

export const DEVELOPMENT_REQUIRED_ENV_KEYS = Object.freeze([
  ...CORE_RUNTIME_ENV_KEYS,
  ...WEB_PUSH_ENV_KEYS,
]);

export const SETTINGS_ENV_KEYS = Object.freeze([
  ...GOOGLE_BRIDGE_ENV_KEYS,
  ...WEB_PUSH_ENV_KEYS,
]);

export const PRODUCTION_SYNC_ENV_KEYS = Object.freeze([
  ...CORE_RUNTIME_ENV_KEYS,
  ...OPTIONAL_LOGGING_ENV_KEYS,
  ...GOOGLE_BRIDGE_ENV_KEYS,
  ...WEB_PUSH_ENV_KEYS,
]);

// Backward-compatible alias for existing imports that mean the eight core keys.
export const REQUIRED_RUNTIME_ENV_KEYS = CORE_RUNTIME_ENV_KEYS;

const unquote = (value) => {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1);
  return trimmed;
};

export const parseEnvironmentText = (source = "") => {
  const values = {};
  String(source).split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const separator = normalized.indexOf("=");
    if (separator <= 0) return;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
    values[key] = unquote(normalized.slice(separator + 1));
  });
  return values;
};

const present = (values, key) => Boolean(String(values[key] ?? "").trim());

export const optionalGroupStatus = (values, keys) => {
  const presentKeys = keys.filter((key) => present(values, key));
  const missing = keys.filter((key) => !present(values, key));
  return {
    enabled: presentKeys.length > 0,
    complete: presentKeys.length === keys.length,
    present: presentKeys,
    missing,
  };
};

export const validateWebPushEnvironment = (values = {}) => validateVapidConfiguration(values);

export const environmentStatus = (values = {}) => {
  const missing = CORE_RUNTIME_ENV_KEYS.filter((key) => !present(values, key));
  return { complete: missing.length === 0, missing };
};

export const developmentEnvironmentStatus = (values = {}) => {
  const core = environmentStatus(values);
  const webPush = validateWebPushEnvironment(values);
  const missingWebPush = webPush.enabled ? webPush.missing : [...WEB_PUSH_ENV_KEYS];
  const invalid = webPush.complete ? [...webPush.invalid] : [];
  const missing = [...core.missing, ...missingWebPush];
  return {
    complete: core.complete && webPush.enabled && webPush.complete && webPush.valid,
    missing,
    invalid,
    core,
    webPush,
  };
};
