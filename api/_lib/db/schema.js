import crypto from "node:crypto";
import { getDatabase } from "./httpClient.js";

export const DATABASE_SCHEMA_VERSION = 10;
const CACHE_MS = 60_000;
let cached = null;

export const readSchemaStatus = async (database = null, { force = false } = {}) => {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const db = database || getDatabase();
  let row = null;
  try { row = await db.one("SELECT value FROM system_config WHERE key='schema_version'"); }
  catch { row = null; }
  const version = Number(row?.value || 0);
  const value = { ready: version === DATABASE_SCHEMA_VERSION, version, expectedVersion: DATABASE_SCHEMA_VERSION };
  cached = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
};

export const schemaStatus = ({ force = false } = {}) => readSchemaStatus(null, { force });
export const assertDatabaseReady = async (database = null) => {
  const status = await readSchemaStatus(database);
  if (!status.ready) throw Object.assign(new Error("Schema database belum siap. Jalankan npm run db:migrate."), { code: "DATABASE_SCHEMA_MISMATCH", status: 503, details: status });
  return status;
};
export const invalidateSchemaCache = () => { cached = null; };
export const checksumText = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
