import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadDatabaseProfile, resolveDatabaseProfileTarget } from "./database-profile.mjs";
import { runRemoteProductionDatabaseOperation } from "./remote-production-database-operation.mjs";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { readSchemaStatus } from "../api/_lib/db/schema.js";
import { integrityIssues } from "../api/_lib/services/reporting/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isRemoteProductionContext = () => process.env.SALDO_BERSAMA_REMOTE_DB_CONTEXT === "1";

const assertRemoteProductionRuntime = () => {
  if (String(process.env.VERCEL_ENV || "").trim().toLowerCase() !== "production") {
    throw Object.assign(new Error("Remote integrity Production hanya boleh berjalan pada Vercel Production build."), { code: "REMOTE_PRODUCTION_CONTEXT_INVALID" });
  }
  if (!String(process.env.TURSO_DATABASE_URL || "").trim() || !String(process.env.TURSO_AUTH_TOKEN || "").trim()) {
    throw Object.assign(new Error("Credential Turso Production tidak tersedia pada Vercel Production build."), { code: "REMOTE_PRODUCTION_DATABASE_CREDENTIALS_MISSING" });
  }
  process.env.DATABASE_ENVIRONMENT = "production";
  process.env.NODE_ENV = "production";
};

export const runLocalDatabaseIntegrity = async ({ databaseEnvironment, projectRoot = root, logger = console } = {}) => {
  if (databaseEnvironment === "production" && isRemoteProductionContext()) assertRemoteProductionRuntime();
  else await loadDatabaseProfile({ root: projectRoot, environment: databaseEnvironment, refreshRemote: false });

  const db = getDatabase();
  const schema = await readSchemaStatus(db, { force: true });
  if (!schema.ready) {
    const result = {
      schema,
      engine: "not_checked",
      foreignKeyIssues: [],
      businessIssues: [],
      message: databaseEnvironment === "production"
        ? "Schema database Production belum siap. Jalankan npm run db:migrate -- production; operasi tersebut berjalan di Vercel Production build dan memakai secret Production langsung dari Vercel."
        : "Schema database Development belum siap. Jalankan npm run db:migrate, lalu ulangi integrity.",
    };
    logger.log(JSON.stringify(result, null, 2));
    throw Object.assign(new Error(result.message), { code: "DATABASE_INTEGRITY_SCHEMA_NOT_READY", result });
  }

  const [integrity, foreignKeys, business] = await Promise.all([
    db.one("PRAGMA integrity_check"),
    db.all("PRAGMA foreign_key_check"),
    integrityIssues(db),
  ]);
  const engineOk = String(Object.values(integrity || {})[0] || "").toLowerCase() === "ok";
  const result = { schema, engine: engineOk ? "ok" : integrity, foreignKeyIssues: foreignKeys, businessIssues: business };
  logger.log(JSON.stringify(result, null, 2));
  if (!engineOk || foreignKeys.length || business.length) {
    throw Object.assign(new Error("Integrity database menemukan masalah."), { code: "DATABASE_INTEGRITY_FAILED", result });
  }
  return result;
};

export const runDatabaseIntegrity = async ({ argv = process.argv.slice(2), projectRoot = root } = {}) => {
  const databaseEnvironment = resolveDatabaseProfileTarget({ argv });
  if (databaseEnvironment === "production" && !isRemoteProductionContext()) {
    return runRemoteProductionDatabaseOperation({ operation: "integrity", root: projectRoot });
  }
  return runLocalDatabaseIntegrity({ databaseEnvironment, projectRoot });
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runDatabaseIntegrity().catch((error) => {
    if (error?.code !== "DATABASE_INTEGRITY_SCHEMA_NOT_READY" && error?.code !== "DATABASE_INTEGRITY_FAILED") {
      console.error(error?.message || "Integrity database gagal.");
    }
    process.exitCode = 1;
  });
}
