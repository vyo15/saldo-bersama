import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnvironmentText } from "./runtime-environment.mjs";
import { validateProductionEnvironment } from "./push-vercel-production-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PRODUCTION_LOCAL_ENV_FILE = ".env.production.local";

export const SHARED_PUBLIC_ENV_KEYS = Object.freeze([
  "VITE_APP_NAME",
  "VITE_GOOGLE_CLIENT_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "ALLOWED_ORIGINS",
]);

const present = (values, key) => Boolean(String(values?.[key] ?? "").trim());
const normalizedDatabaseHost = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.replace(/^libsql:/i, "https:"));
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const environmentIsolationStatus = ({ development = {}, production = {} } = {}) => {
  const issues = [];
  const devEnvironment = String(development.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  const prodEnvironment = String(production.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  if (present(development, "DATABASE_ENVIRONMENT") && devEnvironment !== "development") issues.push("DEVELOPMENT_MARKER_MISMATCH");
  if (prodEnvironment !== "production") issues.push("PRODUCTION_MARKER_MISMATCH");

  const devHost = normalizedDatabaseHost(development.TURSO_DATABASE_URL);
  const prodHost = normalizedDatabaseHost(production.TURSO_DATABASE_URL);
  if (devHost && prodHost && devHost === prodHost) issues.push("DATABASE_SHARED");
  if (present(development, "TURSO_AUTH_TOKEN") && present(production, "TURSO_AUTH_TOKEN")
    && development.TURSO_AUTH_TOKEN === production.TURSO_AUTH_TOKEN) issues.push("DATABASE_TOKEN_SHARED");
  if (present(development, "SESSION_SECRET") && present(production, "SESSION_SECRET")
    && development.SESSION_SECRET === production.SESSION_SECRET) issues.push("SESSION_SECRET_SHARED");
  if (present(development, "VITE_VAPID_PUBLIC_KEY") && present(production, "VITE_VAPID_PUBLIC_KEY")
    && development.VITE_VAPID_PUBLIC_KEY === production.VITE_VAPID_PUBLIC_KEY) issues.push("VAPID_KEYPAIR_SHARED");
  if (present(development, "VAPID_PRIVATE_KEY") && present(production, "VAPID_PRIVATE_KEY")
    && development.VAPID_PRIVATE_KEY === production.VAPID_PRIVATE_KEY && !issues.includes("VAPID_KEYPAIR_SHARED")) issues.push("VAPID_KEYPAIR_SHARED");

  return { valid: issues.length === 0, issues };
};

const normalizeSharedValue = (key, value) => {
  const normalized = String(value ?? "").trim();
  if (key !== "ALLOWED_ORIGINS") return normalized;
  return normalized.split(",").map((item) => item.trim()).filter(Boolean).sort().join(",");
};

export const environmentSharedConfigStatus = ({ development = {}, production = {} } = {}) => {
  const mismatched = SHARED_PUBLIC_ENV_KEYS.filter((key) => {
    if (!present(development, key) || !present(production, key)) return false;
    return normalizeSharedValue(key, development[key]) !== normalizeSharedValue(key, production[key]);
  });
  return { valid: mismatched.length === 0, mismatched };
};

const validationMessages = (status) => {
  const messages = [];
  if (status.missing.length) messages.push(`key wajib belum lengkap: ${status.missing.join(", ")}`);
  if (status.forbidden.length) messages.push(`key legacy terdeteksi: ${status.forbidden.join(", ")}`);
  if (status.environmentMismatch) messages.push("DATABASE_ENVIRONMENT wajib production");
  if (status.incompleteGoogleBridge.length) messages.push(`Google bridge belum lengkap: ${status.incompleteGoogleBridge.join(", ")}`);
  if (status.incompleteWebPush.length) messages.push(`Web Push belum lengkap: ${status.incompleteWebPush.join(", ")}`);
  if (status.invalidWebPush.length) messages.push(`Web Push tidak valid: ${status.invalidWebPush.join(", ")}`);
  return messages;
};

const isolationMessages = (issues) => issues.map((issue) => ({
  DEVELOPMENT_MARKER_MISMATCH: ".env.local bukan profile Development",
  PRODUCTION_MARKER_MISMATCH: ".env.production.local bukan profile Production",
  DATABASE_SHARED: "Development dan Production menunjuk host Turso yang sama",
  DATABASE_TOKEN_SHARED: "Development dan Production memakai TURSO_AUTH_TOKEN yang sama",
  SESSION_SECRET_SHARED: "Development dan Production memakai SESSION_SECRET yang sama",
  VAPID_KEYPAIR_SHARED: "Development dan Production memakai pasangan VAPID yang sama; setelah database terpisah Web Push wajib memakai key per-environment",
}[issue] || issue));

export const checkProductionEnvironment = async ({
  cwd = projectRoot,
  productionPath = path.join(cwd, PRODUCTION_LOCAL_ENV_FILE),
  developmentPath = path.join(cwd, ".env.local"),
} = {}) => {
  const productionSource = await readFile(productionPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw Object.assign(new Error(`${PRODUCTION_LOCAL_ENV_FILE} belum tersedia. Profile Production lokal harus disiapkan satu kali pada komputer tepercaya; Vercel Sensitive tidak dapat dipull kembali.`), { code: "PRODUCTION_LOCAL_ENV_NOT_FOUND" });
    }
    throw error;
  });
  const production = parseEnvironmentText(productionSource);
  const productionStatus = validateProductionEnvironment(production);
  if (!productionStatus.valid) {
    throw Object.assign(new Error(`Profile Production lokal tidak valid — ${validationMessages(productionStatus).join("; ")}.`), { code: "PRODUCTION_LOCAL_ENV_INVALID", ...productionStatus });
  }

  let development = {};
  try { development = parseEnvironmentText(await readFile(developmentPath, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const isolation = environmentIsolationStatus({ development, production });
  if (!isolation.valid) {
    throw Object.assign(new Error(`Isolasi Development/Production tidak valid — ${isolationMessages(isolation.issues).join("; ")}.`), { code: "ENVIRONMENT_ISOLATION_INVALID", issues: isolation.issues });
  }
  const shared = environmentSharedConfigStatus({ development, production });
  if (!shared.valid) {
    throw Object.assign(new Error(`Konfigurasi publik Development/Production drift — samakan: ${shared.mismatched.join(", ")}.`), { code: "ENVIRONMENT_SHARED_CONFIG_DRIFT", mismatched: shared.mismatched });
  }

  console.log(`Production profile: ${PRODUCTION_LOCAL_ENV_FILE} complete`);
  console.log("Database/session/Web Push isolation: Development/Production terpisah");
  console.log("Shared public config: aligned");
  console.log("Production secret source: local trusted profile; tidak dipull dari Vercel Sensitive");
  return { productionStatus, isolation, shared };
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkProductionEnvironment().catch((error) => {
    console.error(error?.message || "Profile Production lokal tidak valid.");
    process.exitCode = 1;
  });
}
