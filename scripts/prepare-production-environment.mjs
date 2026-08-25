import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SHARED_PUBLIC_ENV_KEYS } from "./check-production-environment.mjs";
import {
  GOOGLE_BRIDGE_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
  developmentEnvironmentStatus,
  optionalGroupStatus,
  parseEnvironmentText,
} from "./runtime-environment.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEVELOPMENT_FILE = ".env.local";
const PRODUCTION_FILE = ".env.production.local";

const COPY_FROM_DEVELOPMENT = Object.freeze([
  ...SHARED_PUBLIC_ENV_KEYS,
  "ALLOWED_USERS_JSON",
  "LOG_LEVEL",
  "VAPID_SUBJECT",
]);

const serializeValue = (value) => String(value ?? "").replace(/[\r\n]+/g, "");

export const buildProductionSeed = (development = {}) => {
  const lines = [
    "# Saldo Bersama — Production profile lokal untuk workstation tepercaya",
    "# File ini wajib tetap gitignored. Isi secret Production dari secret store canonical; jangan generate per komputer.",
    "# Jangan menyalin TURSO token, SESSION_SECRET, atau VAPID Development ke Production.",
    "",
  ];

  const centralBridgeReady = optionalGroupStatus(development, GOOGLE_BRIDGE_ENV_KEYS).complete;
  for (const key of PRODUCTION_SYNC_ENV_KEYS) {
    let value = "";
    if (key === "DATABASE_ENVIRONMENT") value = "production";
    else if (COPY_FROM_DEVELOPMENT.includes(key)) value = development[key] ?? "";
    else if (centralBridgeReady && GOOGLE_BRIDGE_ENV_KEYS.includes(key)) value = development[key] ?? "";
    // Google bridge adalah konfigurasi pusat Apps Script; bila grup Development lengkap,
    // profile Production lokal memakai grup yang sama tanpa mencetak nilai secret.
    // VAPID pair wajib berbeda; hanya subject yang boleh diwariskan.
    if (key === "VITE_VAPID_PUBLIC_KEY" || key === "VAPID_PRIVATE_KEY") value = "";
    lines.push(`${key}=${serializeValue(value)}`);
  }
  lines.push("");
  return lines.join("\n");
};

export const prepareProductionEnvironment = async ({ cwd = projectRoot } = {}) => {
  const developmentPath = path.join(cwd, DEVELOPMENT_FILE);
  const productionPath = path.join(cwd, PRODUCTION_FILE);

  const developmentSource = await readFile(developmentPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw Object.assign(new Error(`${DEVELOPMENT_FILE} belum ada. Jalankan npm run env:pull:development terlebih dahulu.`), {
        code: "DEVELOPMENT_LOCAL_ENV_NOT_FOUND",
      });
    }
    throw error;
  });
  const development = parseEnvironmentText(developmentSource);
  const developmentStatus = developmentEnvironmentStatus(development);
  if (!developmentStatus.complete) {
    throw Object.assign(new Error(`${DEVELOPMENT_FILE} belum valid sebagai Development. Perbaiki/pull Development sebelum menyiapkan Production.`), {
      code: "DEVELOPMENT_LOCAL_ENV_INVALID",
    });
  }

  try {
    await readFile(productionPath, "utf8");
    throw Object.assign(new Error(`${PRODUCTION_FILE} sudah ada dan tidak akan ditimpa. Jalankan npm run env:status atau npm run env:check:production.`), {
      code: "PRODUCTION_LOCAL_ENV_ALREADY_EXISTS",
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await writeFile(productionPath, buildProductionSeed(development), { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log(`${PRODUCTION_FILE} dibuat tanpa credential Production yang environment-specific.`);
  console.log("Public config dan Google bridge pusat (bila lengkap) disalin dari Development; DATABASE_ENVIRONMENT di-set ke production.");
  console.log("Isi credential Production canonical dari secret store yang sama pada setiap workstation tepercaya, lalu jalankan npm run env:check:production.");
  console.log("Jangan generate SESSION_SECRET, token Turso, OAuth secret, atau VAPID baru per komputer.");
  return { path: productionPath };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  prepareProductionEnvironment().catch((error) => {
    console.error(error?.message || "Gagal menyiapkan profile Production lokal.");
    process.exitCode = 1;
  });
}
