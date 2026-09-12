import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DATABASE_SCHEMA_VERSION } from "../api/_lib/db/schema.js";
import { checkProductionRuntime } from "./production-runtime.mjs";
import { runRemoteProductionDatabaseOperation } from "./remote-production-database-operation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForProductionRuntime = async ({ runtimeCheck = checkProductionRuntime, attempts = 8, delayMs = 2_000, logger = console } = {}) => {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await runtimeCheck(); }
    catch (error) {
      lastError = error;
      if (attempt < attempts) {
        logger.log?.(`Menunggu alias/runtime Production sinkron (${attempt}/${attempts})...`);
        await sleep(delayMs);
      }
    }
  }
  throw lastError || new Error("Runtime Production belum dapat diverifikasi.");
};

export const runProductionUpdate = async ({
  root: projectRoot = root,
  remoteRunner = runRemoteProductionDatabaseOperation,
  runtimeCheck = checkProductionRuntime,
  logger = console,
} = {}) => {
  logger.log?.(`Saldo Bersama Production update → target schema v${DATABASE_SCHEMA_VERSION}.`);
  logger.log?.("Satu command ini membuat backup fresh schema aktif, menjalankan seluruh migration pending secara atomik + integrity, lalu promote runtime candidate yang sama.");
  const remote = await remoteRunner({ operation: "update", root: projectRoot, logger });
  const runtime = await waitForProductionRuntime({ runtimeCheck, logger });
  logger.log?.(`Production normal kembali: schema v${runtime?.health?.schema?.version ?? DATABASE_SCHEMA_VERSION}, runtime target v${DATABASE_SCHEMA_VERSION}.`);
  return { ...remote, runtime };
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runProductionUpdate().catch((error) => {
    console.error(error?.message || "Update Production gagal.");
    if (error?.code) console.error(`Kode: ${error.code}`);
    process.exitCode = 1;
  });
}
