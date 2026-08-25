import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GOOGLE_BRIDGE_ENV_KEYS, optionalGroupStatus, parseEnvironmentText } from "./runtime-environment.mjs";

export const PRODUCTION_LOCAL_ENV_FILE = ".env.production.local";

const copyIfPresent = (values, key, fallback = "") => String(values?.[key] ?? fallback).trim();
const envLine = (key, value = "") => `${key}=${String(value ?? "").replace(/\r?\n/g, "")}`;

const centralBridgeValues = (development = {}) => (
  optionalGroupStatus(development, GOOGLE_BRIDGE_ENV_KEYS).complete
    ? Object.fromEntries(GOOGLE_BRIDGE_ENV_KEYS.map((key) => [key, copyIfPresent(development, key)]))
    : {}
);

const updateEnvironmentSource = (source, updates) => {
  const pending = new Map(Object.entries(updates));
  const lines = String(source || "").split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !pending.has(match[1])) return line;
    const key = match[1];
    const value = pending.get(key);
    pending.delete(key);
    return envLine(key, value);
  });
  if (pending.size) {
    if (lines.length && lines.at(-1) !== "") lines.push("");
    for (const [key, value] of pending) lines.push(envLine(key, value));
  }
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
};

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
  envLine("GOOGLE_BRIDGE_WEB_APP_URL", centralBridgeValues(development).GOOGLE_BRIDGE_WEB_APP_URL),
  envLine("GOOGLE_BRIDGE_SHARED_SECRET", centralBridgeValues(development).GOOGLE_BRIDGE_SHARED_SECRET),
  envLine("JOBS_SHARED_SECRET", centralBridgeValues(development).JOBS_SHARED_SECRET),
  "",
  "VITE_VAPID_PUBLIC_KEY=",
  "VAPID_PRIVATE_KEY=",
  envLine("VAPID_SUBJECT", copyIfPresent(development, "VAPID_SUBJECT")),
  "",
].join("\n")}\n`;

export const synchronizeCentralGoogleBridgeProfile = async ({ projectRoot, logger = console } = {}) => {
  if (!projectRoot) throw new TypeError("projectRoot wajib diisi.");
  const developmentPath = path.join(projectRoot, ".env.local");
  const productionPath = path.join(projectRoot, PRODUCTION_LOCAL_ENV_FILE);
  const [developmentSource, productionSource] = await Promise.all([
    readFile(developmentPath, "utf8"),
    readFile(productionPath, "utf8"),
  ]);
  const development = parseEnvironmentText(developmentSource);
  const production = parseEnvironmentText(productionSource);
  const developmentGroup = optionalGroupStatus(development, GOOGLE_BRIDGE_ENV_KEYS);
  const productionGroup = optionalGroupStatus(production, GOOGLE_BRIDGE_ENV_KEYS);

  if (!developmentGroup.complete) return { changed: false, reason: "development-bridge-not-configured" };
  if (productionGroup.enabled && !productionGroup.complete) {
    throw Object.assign(new Error("Google bridge Production lokal terisi parsial. Lengkapi atau kosongkan seluruh grup sebelum npm run prod."), {
      code: "PRODUCTION_GOOGLE_BRIDGE_PARTIAL",
      missing: productionGroup.missing,
    });
  }
  if (productionGroup.complete) {
    const mismatched = GOOGLE_BRIDGE_ENV_KEYS.filter((key) => String(production[key] || "").trim() !== String(development[key] || "").trim());
    if (mismatched.length) {
      throw Object.assign(new Error(`Google bridge pusat Development/Production drift: ${mismatched.join(", ")}. Jangan overwrite otomatis; pulihkan nilai canonical Apps Script.`), {
        code: "CENTRAL_GOOGLE_BRIDGE_DRIFT",
        mismatched,
      });
    }
    return { changed: false, reason: "already-aligned" };
  }

  const updates = centralBridgeValues(development);
  await writeFile(productionPath, updateEnvironmentSource(productionSource, updates), { encoding: "utf8", mode: 0o600 });
  logger.log?.("Google bridge pusat diselaraskan DEV → PROD lokal (hanya profile workstation; Vercel tidak diubah)." );
  return { changed: true, reason: "seeded-from-development" };
};

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
