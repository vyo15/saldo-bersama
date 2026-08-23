import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { DATABASE_ENVIRONMENTS, DATABASE_SCHEMA_VERSION, invalidateSchemaCache } from "../api/_lib/db/schema.js";
import { nowIso } from "../api/_lib/services/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env.local")); } catch (error) { if (error.code !== "ENOENT") throw error; }

export const bindDatabaseEnvironment = async ({ database = null, environment = process.env.DATABASE_ENVIRONMENT } = {}) => {
  const target = String(environment || "").trim().toLowerCase();
  if (!DATABASE_ENVIRONMENTS.includes(target)) {
    throw Object.assign(new Error("DATABASE_ENVIRONMENT harus bernilai development atau production."), { code: "DATABASE_ENVIRONMENT_INVALID" });
  }
  const db = database || getDatabase();
  const schema = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
  if (Number(schema?.value || 0) !== DATABASE_SCHEMA_VERSION) {
    throw Object.assign(new Error(`Schema harus v${DATABASE_SCHEMA_VERSION} sebelum database di-bind.`), { code: "DATABASE_SCHEMA_MISMATCH" });
  }
  return db.transaction(async (tx) => {
    const current = await tx.one("SELECT value FROM system_config WHERE key='database_environment'");
    const value = String(current?.value || "unbound").trim().toLowerCase();
    if (value !== "unbound" && value !== target) {
      throw Object.assign(new Error(`Database sudah terikat ke ${value}; rebind ke ${target} ditolak.`), { code: "DATABASE_ENVIRONMENT_REBIND_DENIED", current: value, target });
    }
    await tx.execute("INSERT INTO system_config(key,value,updated_at) VALUES('database_environment',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at", [target, nowIso()]);
    invalidateSchemaCache();
    return { environment: target, changed: value !== target };
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bindDatabaseEnvironment().then(({ environment, changed }) => {
    console.log(`Database ${changed ? "diikat" : "sudah terikat"} ke environment: ${environment}.`);
  }).catch((error) => {
    console.error(error?.message || "Binding environment database gagal.");
    process.exitCode = 1;
  });
}
