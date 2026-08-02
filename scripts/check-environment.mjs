import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseEnvironmentText } from "./runtime-environment.mjs";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, ".env.local");
const core = [
  "VITE_APP_NAME", "VITE_GOOGLE_CLIENT_ID", "VITE_FIREBASE_API_KEY",
  "ALLOWED_USERS_JSON", "ALLOWED_ORIGINS", "SESSION_SECRET",
  "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN",
];
const google = ["GOOGLE_BRIDGE_WEB_APP_URL", "GOOGLE_BRIDGE_SHARED_SECRET", "JOBS_SHARED_SECRET"];
const push = ["VITE_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
const forbidden = [
  "INTERNAL_SHARED_SECRET", "APPS_SCRIPT_WEB_APP_URL", "FIREBASE_WEB_API_KEY",
  "VAPID_PUBLIC_KEY", "VITE_DEV_MODE", "SPREADSHEET_ID", "MIRROR_SPREADSHEET_ID",
  "GOOGLE_CALENDAR_ID", "BACKUP_FOLDER_ID", "JOBS_ENDPOINT_URL",
];

let source;
try { source = await readFile(envPath, "utf8"); }
catch (error) {
  console.error(`Environment tidak ditemukan: ${envPath}`);
  process.exit(1);
}
const values = parseEnvironmentText(source);
const present = (key) => Boolean(String(values[key] ?? "").trim());
const missingCore = core.filter((key) => !present(key));
const legacy = forbidden.filter((key) => key in values);
const groupStatus = (keys) => {
  const count = keys.filter(present).length;
  return count === 0 ? "disabled" : count === keys.length ? "complete" : `INCOMPLETE (${keys.filter((key) => !present(key)).join(", ")})`;
};

console.log(`Environment: ${envPath}`);
console.log(`Core: ${missingCore.length ? `INCOMPLETE (${missingCore.join(", ")})` : "complete"}`);
console.log(`Google bridge: ${groupStatus(google)}`);
console.log(`Web Push: ${groupStatus(push)}`);
console.log(`Legacy/forbidden: ${legacy.length ? legacy.join(", ") : "none"}`);
if (missingCore.length || legacy.length || groupStatus(google).startsWith("INCOMPLETE") || groupStatus(push).startsWith("INCOMPLETE")) process.exitCode = 1;
