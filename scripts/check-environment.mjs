import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  CORE_RUNTIME_ENV_KEYS,
  GOOGLE_BRIDGE_ENV_KEYS,
  optionalGroupStatus,
  parseEnvironmentText,
  validateWebPushEnvironment,
} from "./runtime-environment.mjs";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, ".env.local");
const forbidden = [
  "INTERNAL_SHARED_SECRET", "APPS_SCRIPT_WEB_APP_URL", "FIREBASE_WEB_API_KEY",
  "VAPID_PUBLIC_KEY", "VITE_DEV_MODE", "SPREADSHEET_ID", "MIRROR_SPREADSHEET_ID",
  "GOOGLE_CALENDAR_ID", "BACKUP_FOLDER_ID", "JOBS_ENDPOINT_URL",
  "VITE_DEMO_MODE", "VERCEL_OIDC_TOKEN",
];

let source;
try { source = await readFile(envPath, "utf8"); }
catch {
  console.error(`Environment tidak ditemukan: ${envPath}`);
  process.exit(1);
}
const values = parseEnvironmentText(source);
const present = (key) => Boolean(String(values[key] ?? "").trim());
const missingCore = CORE_RUNTIME_ENV_KEYS.filter((key) => !present(key));
const legacy = forbidden.filter((key) => key in values);
const google = optionalGroupStatus(values, GOOGLE_BRIDGE_ENV_KEYS);
const webPush = validateWebPushEnvironment(values);

const optionalGroupLabel = (group) => {
  if (!group.enabled) return "disabled";
  if (!group.complete) return `INCOMPLETE (${group.missing.join(", ")})`;
  return "complete";
};

const webPushLabel = () => {
  if (!webPush.enabled) return "MISSING (required for canonical local testing)";
  if (!webPush.complete) return `INCOMPLETE (${webPush.missing.join(", ")})`;
  if (webPush.invalid?.length) return `INVALID (${webPush.invalid.join(", ")})`;
  return "complete";
};

console.log(`Environment: ${envPath}`);
console.log(`Core: ${missingCore.length ? `INCOMPLETE (${missingCore.join(", ")})` : "complete"}`);
console.log(`Google bridge: ${optionalGroupLabel(google)}`);
console.log(`Web Push: ${webPushLabel()}`);
console.log(`Legacy/forbidden: ${legacy.length ? legacy.join(", ") : "none"}`);
if (missingCore.length || legacy.length || (google.enabled && !google.complete) || !webPush.enabled || !webPush.valid) process.exitCode = 1;
