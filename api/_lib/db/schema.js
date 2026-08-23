import crypto from "node:crypto";
import { getDatabase } from "./httpClient.js";

export const DATABASE_SCHEMA_VERSION = 12;
export const DATABASE_ENVIRONMENTS = Object.freeze(["development", "production"]);
const CACHE_MS = 60_000;
let cached = null;

const environmentStatus = (config) => {
  const expectedEnvironment = String(process.env.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  const runtimeEnvironment = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  const databaseEnvironment = String(config.database_environment || "unbound").trim().toLowerCase();
  const runtimeEnvironmentPresent = Boolean(runtimeEnvironment);
  const environmentRequired = runtimeEnvironmentPresent || Boolean(expectedEnvironment);
  const environmentConfigured = DATABASE_ENVIRONMENTS.includes(expectedEnvironment);
  const runtimeEnvironmentSupported = !runtimeEnvironmentPresent || DATABASE_ENVIRONMENTS.includes(runtimeEnvironment);
  const runtimeMatchesExpected = !runtimeEnvironmentPresent
    || (runtimeEnvironmentSupported && environmentConfigured && runtimeEnvironment === expectedEnvironment);
  const environmentReady = !environmentRequired
    || (environmentConfigured && runtimeMatchesExpected && databaseEnvironment === expectedEnvironment);
  return {
    databaseEnvironment,
    expectedEnvironment: expectedEnvironment || null,
    runtimeEnvironment: runtimeEnvironment || null,
    environmentReady,
  };
};

export const readSchemaStatus = async (database = null, { force = false } = {}) => {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const db = database || getDatabase();
  let rows = [];
  try { rows = await db.all("SELECT key,value FROM system_config WHERE key IN ('schema_version','database_environment')"); }
  catch { rows = []; }
  const config = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const version = Number(config.schema_version || 0);
  const environment = environmentStatus(config);
  const value = {
    ready: version === DATABASE_SCHEMA_VERSION && environment.environmentReady,
    version,
    expectedVersion: DATABASE_SCHEMA_VERSION,
    ...environment,
  };
  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
};

export const schemaStatus = ({ force = false } = {}) => readSchemaStatus(null, { force });
export const assertDatabaseReady = async (database = null) => {
  const status = await readSchemaStatus(database);
  if (!status.ready) {
    const environmentMismatch = status.version === DATABASE_SCHEMA_VERSION && !status.environmentReady;
    throw Object.assign(new Error(environmentMismatch
      ? "Environment database tidak cocok. Jalankan binding database untuk environment ini."
      : "Schema database belum siap. Jalankan npm run db:migrate."), {
      code: environmentMismatch ? "DATABASE_ENVIRONMENT_MISMATCH" : "DATABASE_SCHEMA_MISMATCH",
      status: 503,
      details: status,
    });
  }
  return status;
};
export const invalidateSchemaCache = () => { cached = null; };
export const checksumText = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
