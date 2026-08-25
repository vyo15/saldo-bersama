import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GOOGLE_BRIDGE_ENV_KEYS,
  developmentEnvironmentStatus,
  optionalGroupStatus,
  parseEnvironmentText,
  validateWebPushEnvironment,
} from "./runtime-environment.mjs";
import {
  environmentIsolationStatus,
  environmentSharedConfigStatus,
} from "./check-production-environment.mjs";
import { validateProductionEnvironment } from "./push-vercel-production-env.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");


const present = (values, key) => Boolean(String(values?.[key] ?? "").trim());

export const safeFingerprint = (value, length = 12) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, length);
};

export const normalizedDatabaseHost = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw.replace(/^libsql:/i, "https:")).hostname.toLowerCase();
  } catch {
    return "invalid";
  }
};

const readEnvironmentFile = async (file, { optional = false } = {}) => {
  try {
    return { exists: true, values: parseEnvironmentText(await readFile(file, "utf8")) };
  } catch (error) {
    if (optional && error?.code === "ENOENT") return { exists: false, values: {} };
    throw error;
  }
};

const webPushSummary = (values) => {
  const status = validateWebPushEnvironment(values);
  return {
    ...status,
    fingerprint: status.complete && status.valid ? safeFingerprint(values.VITE_VAPID_PUBLIC_KEY) : null,
    subjectKind: present(values, "VAPID_SUBJECT")
      ? (String(values.VAPID_SUBJECT).trim().toLowerCase().startsWith("mailto:") ? "mailto" : "https")
      : null,
  };
};

export const environmentProfileSummary = ({ values = {}, environment }) => {
  const googleBridge = optionalGroupStatus(values, GOOGLE_BRIDGE_ENV_KEYS);
  const webPush = webPushSummary(values);
  const validation = environment === "production"
    ? validateProductionEnvironment(values)
    : developmentEnvironmentStatus(values);
  return {
    environment,
    databaseHost: normalizedDatabaseHost(values.TURSO_DATABASE_URL),
    databaseEnvironment: String(values.DATABASE_ENVIRONMENT || "").trim().toLowerCase() || null,
    valid: environment === "production" ? validation.valid : validation.complete,
    googleBridge,
    webPush,
  };
};

const printProfile = (label, summary) => {
  console.log(`${label}:`);
  console.log(`  Marker: ${summary.databaseEnvironment || "missing"}`);
  console.log(`  Turso host: ${summary.databaseHost || "missing"}`);
  console.log(`  Core profile: ${summary.valid ? "ready" : "INCOMPLETE/INVALID"}`);
  if (!summary.webPush.enabled) console.log("  Web Push: missing");
  else if (!summary.webPush.complete) console.log(`  Web Push: incomplete (${summary.webPush.missing.join(", ")})`);
  else if (!summary.webPush.valid) console.log(`  Web Push: invalid (${summary.webPush.invalid.join(", ")})`);
  else console.log(`  Web Push: ready (public fingerprint ${summary.webPush.fingerprint}; subject ${summary.webPush.subjectKind})`);
  if (!summary.googleBridge.enabled) console.log("  Google bridge: disabled");
  else if (!summary.googleBridge.complete) console.log(`  Google bridge: incomplete (${summary.googleBridge.missing.join(", ")})`);
  else console.log("  Google bridge: complete");
};

export const inspectEnvironmentProfiles = async ({ cwd = projectRoot } = {}) => {
  const developmentFile = path.join(cwd, ".env.local");
  const productionFile = path.join(cwd, ".env.production.local");
  const development = await readEnvironmentFile(developmentFile, { optional: true });
  const production = await readEnvironmentFile(productionFile, { optional: true });

  const developmentSummary = development.exists
    ? environmentProfileSummary({ values: development.values, environment: "development" })
    : null;
  const productionSummary = production.exists
    ? environmentProfileSummary({ values: production.values, environment: "production" })
    : null;

  const isolation = development.exists && production.exists
    ? environmentIsolationStatus({ development: development.values, production: production.values })
    : null;
  const shared = development.exists && production.exists
    ? environmentSharedConfigStatus({ development: development.values, production: production.values })
    : null;

  return {
    development,
    production,
    developmentSummary,
    productionSummary,
    isolation,
    shared,
  };
};

export const printEnvironmentProfiles = async ({ cwd = projectRoot } = {}) => {
  const result = await inspectEnvironmentProfiles({ cwd });
  console.log("Saldo Bersama environment status (nilai secret tidak ditampilkan)");

  if (!result.development.exists) {
    console.log("Development: .env.local belum ada. Jalankan npm run env:pull:development.");
  } else {
    printProfile("Development (.env.local)", result.developmentSummary);
  }

  if (!result.production.exists) {
    console.log("Production admin profile: .env.production.local tidak ada (normal pada komputer non-admin). npm run prod tetap dapat mengecek Production live tanpa secret lokal.");
  } else {
    printProfile("Production admin (.env.production.local)", result.productionSummary);
  }

  if (result.isolation) {
    console.log(`Isolation Dev/Prod: ${result.isolation.valid ? "ready" : `INVALID (${result.isolation.issues.join(", ")})`}`);
  }
  if (result.shared) {
    console.log(`Shared public config: ${result.shared.valid ? "aligned" : `DRIFT (${result.shared.mismatched.join(", ")})`}`);
  }

  const invalid = (result.development.exists && !result.developmentSummary.valid)
    || (result.production.exists && !result.productionSummary.valid)
    || (result.isolation && !result.isolation.valid)
    || (result.shared && !result.shared.valid);
  if (invalid) process.exitCode = 1;
  return result;
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  printEnvironmentProfiles().catch((error) => {
    console.error(error?.message || "Pemeriksaan environment gagal.");
    process.exitCode = 1;
  });
}
