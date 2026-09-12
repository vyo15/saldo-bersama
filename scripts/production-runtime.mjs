import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { DATABASE_SCHEMA_VERSION } from "../api/_lib/db/schema.js";

export const PRODUCTION_ORIGIN = "https://saldo-bersama.vercel.app";
const HEALTH_URL = `${PRODUCTION_ORIGIN}/api/health`;
const REQUEST_TIMEOUT_MS = 12_000;

const fetchWithTimeout = async (fetchImpl, url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetchImpl(url, { ...options, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
};

export const checkProductionFrontend = async ({ fetchImpl = fetch } = {}) => {
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
  return { status: shellResponse.status };
};

export const productionCoreReadiness = (health = {}, { localExpectedSchemaVersion = DATABASE_SCHEMA_VERSION } = {}) => {
  const blockers = [];
  if (!health?.schema?.ready) blockers.push("SCHEMA_NOT_READY");
  if (health?.maintenanceMode) blockers.push("MAINTENANCE_MODE");
  if (health?.coreOperationsHealthy === false) blockers.push("CORE_OPERATIONS_DEGRADED");
  const liveVersion = Number(health?.schema?.version || 0);
  const liveExpected = Number(health?.schema?.expectedVersion || 0);
  const localExpected = Number(localExpectedSchemaVersion || 0);
  if (localExpected > 0 && (liveVersion < localExpected || liveExpected < localExpected)) blockers.push("PRODUCTION_RELEASE_BEHIND_SOURCE");
  return { ready: blockers.length === 0, blockers, localExpectedSchemaVersion: localExpected };
};

export const checkProductionRuntime = async ({ fetchImpl = fetch } = {}) => {
  let healthResponse;
  try {
    healthResponse = await fetchWithTimeout(fetchImpl, HEALTH_URL, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw Object.assign(new Error(`Vercel Production tidak dapat dihubungi (${error?.name === "AbortError" ? "timeout" : "network"}).`), { code: "PRODUCTION_UNREACHABLE" });
  }
  const healthBody = await healthResponse.json().catch(() => null);
  const data = healthBody?.data || {};
  const readiness = productionCoreReadiness(data);
  if (!healthResponse.ok || healthBody?.ok !== true || data.status !== "ok" || !readiness.ready) {
    throw Object.assign(
      new Error(readiness.blockers.includes("PRODUCTION_RELEASE_BEHIND_SOURCE")
        ? `Vercel Production masih tertinggal dari source lokal: live schema v${data?.schema?.version ?? "?"}/${data?.schema?.expectedVersion ?? "?"}, source membutuhkan v${readiness.localExpectedSchemaVersion}.`
        : `Vercel Production belum sehat (HTTP ${healthResponse.status}, status ${data.status || "unknown"}).`),
      { code: "PRODUCTION_DEGRADED", status: healthResponse.status, serviceStatus: data.status || null, health: data, blockers: readiness.blockers },
    );
  }
  await checkProductionFrontend({ fetchImpl });
  console.log("Vercel Production: ready");
  console.log(`URL: ${PRODUCTION_ORIGIN}`);
  if (data.schema) console.log(`Schema: v${data.schema.version ?? "?"}/${data.schema.expectedVersion ?? "?"}; binding=${data.schema.databaseEnvironment || "unknown"}`);
  console.log("Credential Production tetap berada di Vercel; npm run prod tidak memerlukan .env.production.local.");
  return { origin: PRODUCTION_ORIGIN, serviceStatus: data.status, health: data };
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

export const runProductionRuntime = async ({ open = false, runtimeCheck = checkProductionRuntime } = {}) => {
  const status = await runtimeCheck();
  if (open) {
    const opened = openProductionInBrowser();
    if (!opened) console.log(`Buka ${PRODUCTION_ORIGIN} di browser.`);
  }
  return status;
};

const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  runProductionRuntime({ open: process.argv.includes("--open") }).catch((error) => {
    console.error(error?.message || "Production check gagal.");
    if (error?.health?.schema) {
      console.error(`Schema live: v${error.health.schema.version ?? "?"}/${error.health.schema.expectedVersion ?? "?"}; binding=${error.health.schema.databaseEnvironment || "unknown"}.`);
    }
    console.error("Jika schema tertinggal, jalankan `npm run prod:update`; operasi tersebut memakai secret langsung di Vercel Production build.");
    process.exitCode = 1;
  });
}
