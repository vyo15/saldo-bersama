import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureDevelopmentEnvironment } from "./bootstrap-development-env.mjs";
import { checkProductionEnvironment } from "./check-production-environment.mjs";
import { loadDatabaseProfile } from "./database-profile.mjs";
import { ensureProductionLocalProfile } from "./production-local-profile.mjs";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";

export const PRODUCTION_ORIGIN = "https://saldo-bersama.vercel.app";
const HEALTH_URL = `${PRODUCTION_ORIGIN}/api/health`;
const REQUEST_TIMEOUT_MS = 12_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fetchWithTimeout = async (fetchImpl, url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetchImpl(url, { ...options, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
};

export const checkProductionRuntime = async ({ fetchImpl = fetch } = {}) => {
  let healthResponse;
  try {
    healthResponse = await fetchWithTimeout(fetchImpl, HEALTH_URL, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw Object.assign(new Error(`Vercel Production tidak dapat dihubungi (${error?.name === "AbortError" ? "timeout" : "network"}).`), { code: "PRODUCTION_UNREACHABLE" });
  }
  const healthBody = await healthResponse.json().catch(() => null);
  const serviceStatus = healthBody?.data?.status;
  if (!healthResponse.ok || healthBody?.ok !== true || serviceStatus !== "ok") {
    throw Object.assign(new Error(`Vercel Production belum sehat (HTTP ${healthResponse.status}, status ${serviceStatus || "unknown"}).`), { code: "PRODUCTION_DEGRADED", status: healthResponse.status, serviceStatus: serviceStatus || null });
  }

  let shellResponse;
  try {
    shellResponse = await fetchWithTimeout(fetchImpl, PRODUCTION_ORIGIN, { headers: { Accept: "text/html" }, redirect: "follow" });
  } catch (error) {
    throw Object.assign(new Error(`Frontend Production tidak dapat dihubungi (${error?.name === "AbortError" ? "timeout" : "network"}).`), { code: "PRODUCTION_FRONTEND_UNREACHABLE" });
  }
  const contentType = String(shellResponse.headers?.get?.("content-type") || "").toLowerCase();
  if (!shellResponse.ok || !contentType.includes("text/html")) {
    throw Object.assign(new Error(`Frontend Production belum siap (HTTP ${shellResponse.status}).`), { code: "PRODUCTION_FRONTEND_DEGRADED", status: shellResponse.status });
  }

  console.log("Vercel Production: ready");
  console.log(`URL: ${PRODUCTION_ORIGIN}`);
  console.log("Health: API + database/schema/operations healthy; frontend shell reachable");
  return { origin: PRODUCTION_ORIGIN, serviceStatus };
};

export const checkProductionDatabaseProfile = async ({
  root = projectRoot,
  databaseFactory = getDatabase,
  schemaReader = readSchemaStatus,
} = {}) => {
  await loadDatabaseProfile({ root, environment: "production" });
  const database = databaseFactory();
  if (!await database.health()) {
    throw Object.assign(new Error("Turso Production dari .env.production.local tidak dapat dihubungi."), { code: "PRODUCTION_DATABASE_UNREACHABLE" });
  }
  const schema = await schemaReader(database, { force: true });
  if (!schema.ready) {
    throw Object.assign(new Error(`Turso Production belum siap: schema v${schema.version}/${schema.expectedVersion}; binding=${schema.databaseEnvironment}; expected=${schema.expectedEnvironment}.`), {
      code: "PRODUCTION_DATABASE_NOT_READY",
      schema,
    });
  }
  console.log(`Turso Production local profile: reachable; schema v${schema.version}; binding=${schema.databaseEnvironment}`);
  return schema;
};

export const prepareTrustedProductionRuntime = async ({
  root = projectRoot,
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  environmentEnsurer = ensureDevelopmentEnvironment,
  productionProfileEnsurer = ensureProductionLocalProfile,
  productionEnvironmentChecker = checkProductionEnvironment,
  productionDatabaseChecker = checkProductionDatabaseProfile,
} = {}) => {
  await environmentEnsurer({ projectRoot: root, interactive });
  const productionProfile = await productionProfileEnsurer({ projectRoot: root });
  if (productionProfile.created) {
    throw Object.assign(new Error(".env.production.local sudah dibuat. Isi credential Production canonical yang sama seperti workstation tepercaya lain, lalu jalankan kembali `npm run prod`."), {
      code: "PRODUCTION_PROFILE_SETUP_REQUIRED",
      productionPath: productionProfile.productionPath,
    });
  }
  await productionEnvironmentChecker({ cwd: root });
  await productionDatabaseChecker({ root });
  return productionProfile;
};

export const openProductionInBrowser = ({ platform = process.platform, spawnImpl = spawn } = {}) => {
  if (!process.stdout.isTTY) return false;
  let command;
  let args;
  if (platform === "win32") {
    command = process.env.ComSpec || "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", PRODUCTION_ORIGIN];
  } else if (platform === "darwin") {
    command = "open";
    args = [PRODUCTION_ORIGIN];
  } else {
    command = "xdg-open";
    args = [PRODUCTION_ORIGIN];
  }
  const child = spawnImpl(command, args, { stdio: "ignore", detached: true, windowsHide: true });
  child.unref?.();
  return true;
};

export const runProductionRuntime = async ({
  root = projectRoot,
  open = false,
  prepare = prepareTrustedProductionRuntime,
  runtimeCheck = checkProductionRuntime,
} = {}) => {
  await prepare({ root });
  const status = await runtimeCheck();
  if (open) {
    const opened = openProductionInBrowser();
    if (!opened) console.log("Buka URL Production di browser dari terminal interaktif.");
  }
  return status;
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  runProductionRuntime({ open: process.argv.includes("--open") })
    .catch((error) => {
      console.error(error?.message || "Production check gagal.");
      process.exitCode = 1;
    });
}
