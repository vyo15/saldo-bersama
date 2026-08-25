import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { operationalCoreBlockers, operationalWarningCodes } from "../api/_lib/services/operationalHealth.js";
import { checkProductionEnvironment } from "./check-production-environment.mjs";
import { ensureProductionLocalProfile, synchronizeCentralGoogleBridgeProfile } from "./production-local-profile.mjs";
import { checkProductionDatabaseProfile, inspectProductionDatabaseHealth } from "./production-database-preflight.mjs";

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

  await checkProductionFrontend({ fetchImpl });

  console.log("Vercel Production: ready");
  console.log(`URL: ${PRODUCTION_ORIGIN}`);
  console.log("Health: API + database/schema/operations healthy; frontend shell reachable");
  return { origin: PRODUCTION_ORIGIN, serviceStatus };
};

export const prepareTrustedProductionRuntime = async ({
  root = projectRoot,
  productionProfileEnsurer = ensureProductionLocalProfile,
  centralBridgeSynchronizer = synchronizeCentralGoogleBridgeProfile,
  productionEnvironmentChecker = checkProductionEnvironment,
  productionDatabaseChecker = checkProductionDatabaseProfile,
} = {}) => {
  const productionProfile = await productionProfileEnsurer({ projectRoot: root });
  if (productionProfile.created) {
    throw Object.assign(new Error(".env.production.local sudah dibuat. Isi credential Production canonical yang environment-specific, lalu jalankan kembali `npm run prod`."), {
      code: "PRODUCTION_PROFILE_SETUP_REQUIRED",
      productionPath: productionProfile.productionPath,
    });
  }
  // `npm run prod` tidak boleh menarik/menimpa Development. Ia hanya membaca kedua
  // profile untuk validasi isolasi dan menyelaraskan grup Apps Script yang memang pusat.
  await centralBridgeSynchronizer({ projectRoot: root });
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

const diagnosticSummary = (diagnostics) => {
  const items = [];
  if (diagnostics.databaseStatus !== "ok") items.push("database tidak dapat dijangkau dari profile Production lokal");
  if (diagnostics.schema && diagnostics.schema.ready === false) {
    items.push(`schema/binding belum siap (v${diagnostics.schema.version ?? "?"}/${diagnostics.schema.expectedVersion ?? "?"})`);
  }
  if (diagnostics.maintenanceMode) items.push("maintenance_mode masih aktif");
  if (diagnostics.scheduler?.status === "degraded") {
    const schedulerReason = diagnostics.scheduler.errorCode
      ? `scheduler gagal (${diagnostics.scheduler.errorCode})`
      : diagnostics.scheduler.stale ? "scheduler belum memiliki heartbeat sukses terbaru" : "scheduler degraded";
    items.push(schedulerReason);
  }
  if (diagnostics.operations?.status === "degraded") {
    items.push(`operational health: ${(diagnostics.operations.codes || []).join(", ") || "degraded"}`);
  }
  return items;
};

export const productionCoreReadiness = (diagnostics = {}) => {
  const blockers = [];
  if (diagnostics.databaseStatus !== "ok") blockers.push("DATABASE_UNAVAILABLE");
  if (!diagnostics.schema?.ready) blockers.push("SCHEMA_NOT_READY");
  if (diagnostics.maintenanceMode) blockers.push("MAINTENANCE_MODE");
  blockers.push(...operationalCoreBlockers(diagnostics.operations));
  const warnings = [];
  if (diagnostics.scheduler?.status === "degraded") warnings.push(diagnostics.scheduler.errorCode || "SCHEDULER_DEGRADED");
  warnings.push(...operationalWarningCodes(diagnostics.operations));
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)] };
};

export const reportProductionDegradation = async ({
  root = projectRoot,
  diagnosticsReader = inspectProductionDatabaseHealth,
  logger = console,
} = {}) => {
  let diagnostics;
  try { diagnostics = await diagnosticsReader({ root }); }
  catch (error) {
    logger.error?.(`Diagnosis read-only Production gagal: ${error?.message || "unknown error"}`);
    return null;
  }

  logger.log?.("Diagnosis Production read-only:");
  logger.log?.(`- database/schema: ${diagnostics.databaseStatus === "ok" && diagnostics.schema?.ready ? `ready v${diagnostics.schema.version}` : "belum ready"}`);
  logger.log?.(`- maintenance: ${diagnostics.maintenanceMode ? "aktif" : "off"}`);
  logger.log?.(`- scheduler: ${diagnostics.scheduler?.status || "unknown"}${diagnostics.scheduler?.stale ? " (stale)" : ""}${diagnostics.scheduler?.errorCode ? `; code=${diagnostics.scheduler.errorCode}` : ""}`);
  logger.log?.(`- operations: ${diagnostics.operations?.status || "unknown"}${diagnostics.operations?.codes?.length ? `; codes=${diagnostics.operations.codes.join(",")}` : ""}`);
  logger.log?.(`- Google bridge profile lokal: ${diagnostics.googleBridge?.complete ? "complete" : diagnostics.googleBridge?.enabled ? "partial" : "not configured"}`);

  const issues = diagnosticSummary(diagnostics);
  if (!issues.length) {
    logger.log?.("Database Production lokal sehat. Degradasi berada pada runtime/config Vercel atau signal server-side; jangan migrate ulang hanya karena health live degraded.");
  } else {
    logger.log?.(`Kemungkinan penyebab health degraded: ${issues.join("; ")}.`);
    if (diagnostics.scheduler?.status === "degraded") {
      logger.log?.("Scheduler Apps Script canonical berjalan setiap 10 menit; health baru pulih setelah satu heartbeat sukses. Jika tetap degraded setelah trigger berikutnya, cek Integrasi Google/jobs sebelum mengubah database lagi.");
    }
  }
  return diagnostics;
};

export const runProductionRuntime = async ({
  root = projectRoot,
  open = false,
  prepare = prepareTrustedProductionRuntime,
  runtimeCheck = checkProductionRuntime,
  frontendCheck = checkProductionFrontend,
  degradationReporter = reportProductionDegradation,
  diagnosticsReader = inspectProductionDatabaseHealth,
} = {}) => {
  await prepare({ root });
  let status;
  try {
    status = await runtimeCheck();
  } catch (error) {
    if (error?.code !== "PRODUCTION_DEGRADED") throw error;
    const diagnostics = await degradationReporter({ root });
    const readiness = productionCoreReadiness(diagnostics || {});
    if (!readiness.ready) {
      error.details = { ...(error.details || {}), blockers: readiness.blockers };
      throw error;
    }
    await frontendCheck();
    console.warn(`Vercel Production core siap; operational warning tidak memblokir aplikasi${readiness.warnings.length ? ` (${readiness.warnings.join(", ")})` : ""}.`);
    console.log(`URL: ${PRODUCTION_ORIGIN}`);
    console.log("Health aggregate masih degraded sampai scheduler/integrasi pulih; database/schema/frontend tetap siap.");
    status = { origin: PRODUCTION_ORIGIN, serviceStatus: "degraded", coreReady: true, warnings: readiness.warnings };
  }
  if (status?.serviceStatus === "ok") {
    const diagnostics = await diagnosticsReader({ root }).catch(() => null);
    if (diagnostics) {
      const readiness = productionCoreReadiness(diagnostics);
      if (readiness.warnings.length) {
        console.warn(`Production core siap; operational warning: ${readiness.warnings.join(", ")}.`);
        console.warn("Warning scheduler/integrasi/backup/notifikasi tidak memblokir login atau ledger. Periksa Pengaturan → Integrasi/Status secara terpisah.");
      }
    }
  }
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
