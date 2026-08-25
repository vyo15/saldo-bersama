import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnvironmentText } from "./runtime-environment.mjs";

export const PRODUCTION_LOCAL_ENV_FILE = ".env.production.local";

const copyIfPresent = (values, key, fallback = "") => String(values?.[key] ?? fallback).trim();
const envLine = (key, value = "") => `${key}=${String(value ?? "").replace(/\r?\n/g, "")}`;

export const buildProductionProfileTemplate = ({ development = {} } = {}) => `${[
  "# Saldo Bersama — trusted workstation Production profile",
  "# Dibuat otomatis sekali. File ini tidak boleh masuk Git/ZIP/chat.",
  "# Nilai Production harus sama pada PC/laptop tepercaya dan Vercel Production.",
  "# Credential Production tidak dapat dipull kembali dari Vercel Sensitive, jadi isi dari secret store canonical.",
  "",
  envLine("VITE_APP_NAME", copyIfPresent(development, "VITE_APP_NAME", "Saldo Bersama")),
  envLine("VITE_GOOGLE_CLIENT_ID", copyIfPresent(development, "VITE_GOOGLE_CLIENT_ID")),
  envLine("VITE_FIREBASE_API_KEY", copyIfPresent(development, "VITE_FIREBASE_API_KEY")),
  envLine("VITE_FIREBASE_AUTH_DOMAIN", copyIfPresent(development, "VITE_FIREBASE_AUTH_DOMAIN", "saldo-bersama.firebaseapp.com")),
  "",
  envLine("ALLOWED_USERS_JSON", copyIfPresent(development, "ALLOWED_USERS_JSON")),
  envLine("ALLOWED_ORIGINS", copyIfPresent(development, "ALLOWED_ORIGINS")),
  "SESSION_SECRET=",
  "TURSO_DATABASE_URL=",
  "TURSO_AUTH_TOKEN=",
  "DATABASE_ENVIRONMENT=production",
  "",
  "GOOGLE_OAUTH_CLIENT_SECRET=",
  "",
  envLine("LOG_LEVEL", copyIfPresent(development, "LOG_LEVEL", "info")),
  "",
  "GOOGLE_BRIDGE_WEB_APP_URL=",
  "GOOGLE_BRIDGE_SHARED_SECRET=",
  "JOBS_SHARED_SECRET=",
  "",
  "VITE_VAPID_PUBLIC_KEY=",
  "VAPID_PRIVATE_KEY=",
  envLine("VAPID_SUBJECT", copyIfPresent(development, "VAPID_SUBJECT")),
  "",
].join("\n")}\n`;

export const ensureProductionLocalProfile = async ({ projectRoot, logger = console } = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");
  const productionPath = path.join(projectRoot, PRODUCTION_LOCAL_ENV_FILE);
  const existing = await readFile(productionPath, "utf8").then((source) => ({ exists: true, source })).catch((error) => {
    if (error?.code === "ENOENT") return { exists: false, source: "" };
    throw error;
  });
  if (existing.exists) return { created: false, productionPath };

  const developmentSource = await readFile(path.join(projectRoot, ".env.local"), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  const development = parseEnvironmentText(developmentSource);
  const template = buildProductionProfileTemplate({ development });
  try {
    await writeFile(productionPath, template, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return { created: false, productionPath };
    throw error;
  }
  logger.log?.(`${PRODUCTION_LOCAL_ENV_FILE} dibuat otomatis untuk workstation tepercaya.`);
  logger.log?.("Isi credential Production canonical satu kali; file existing tidak pernah ditimpa otomatis.");
  return { created: true, productionPath };
};
