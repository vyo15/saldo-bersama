import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertDatabaseProfileBinding, loadDatabaseProfile, resolveDatabaseProfileTarget } from "./database-profile.mjs";
import { assertVerifiedProductionBackup } from "./production-migration-safety.mjs";
import { runRemoteProductionDatabaseOperation } from "./remote-production-database-operation.mjs";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { DATABASE_SCHEMA_VERSION, invalidateSchemaCache } from "../api/_lib/db/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isRemoteProductionContext = () => process.env.SALDO_BERSAMA_REMOTE_DB_CONTEXT === "1";

const assertRemoteProductionRuntime = () => {
  if (String(process.env.VERCEL_ENV || "").trim().toLowerCase() !== "production") {
    throw Object.assign(new Error("Remote migration Production hanya boleh berjalan pada Vercel Production build."), { code: "REMOTE_PRODUCTION_CONTEXT_INVALID" });
  }
  if (!String(process.env.TURSO_DATABASE_URL || "").trim() || !String(process.env.TURSO_AUTH_TOKEN || "").trim()) {
    throw Object.assign(new Error("Credential Turso Production tidak tersedia pada Vercel Production build."), { code: "REMOTE_PRODUCTION_DATABASE_CREDENTIALS_MISSING" });
  }
  process.env.DATABASE_ENVIRONMENT = "production";
  process.env.NODE_ENV = "production";
};

export const runLocalDatabaseMigration = async ({ databaseEnvironment, projectRoot = root } = {}) => {
  if (databaseEnvironment === "production" && isRemoteProductionContext()) assertRemoteProductionRuntime();
  else await loadDatabaseProfile({ root: projectRoot, environment: databaseEnvironment, refreshRemote: false });

  const migrationRoot = path.join(projectRoot, "database", "migrations");
  const files = (await readdir(migrationRoot)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("Migration SQL tidak ditemukan.");
  const db = getDatabase();
  await assertDatabaseProfileBinding({ database: db, environment: databaseEnvironment });

  const migrations = [];
  for (const file of files) {
    const version = Number(file.match(/^(\d+)/)?.[1]);
    const source = await readFile(path.join(migrationRoot, file), "utf8");
    const checksum = crypto.createHash("sha256").update(source).digest("hex");
    migrations.push({ file, version, source, checksum });
  }

  let appliedRows = [];
  try { appliedRows = await db.all("SELECT version,checksum FROM schema_migrations"); } catch { appliedRows = []; }
  const appliedByVersion = new Map(appliedRows.map((row) => [Number(row.version), String(row.checksum || "")]));
  for (const migration of migrations) {
    const appliedChecksum = appliedByVersion.get(migration.version);
    if (appliedChecksum && appliedChecksum !== migration.checksum) throw new Error(`Checksum migration ${migration.file} berubah setelah diterapkan.`);
  }
  const pending = migrations.filter((migration) => !appliedByVersion.has(migration.version));

  let currentSchemaVersion = 0;
  try {
    const schemaRow = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
    currentSchemaVersion = Number(schemaRow?.value || 0);
  } catch { currentSchemaVersion = 0; }

  if (databaseEnvironment === "production" && pending.length) {
    const backup = await assertVerifiedProductionBackup({
      database: db,
      currentSchemaVersion,
      targetSchemaVersion: DATABASE_SCHEMA_VERSION,
      pendingMigrations: pending.map((migration) => migration.file),
    });
    if (backup.required) console.log(`Production migration preflight: verified backup schema v${backup.currentSchemaVersion} tersedia.`);
  }

  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) {
      console.log(`SKIP ${migration.file} (sudah diterapkan)`);
      continue;
    }
    const executableSource = migration.source.replace(/^\uFEFF?\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/i, "");
    const statements = executableSource.split(/^\s*-- migrate:split\s*$/m).map((item) => item.trim()).filter(Boolean);
    await db.transaction(async (tx) => {
      await tx.batch(statements.map((sql) => ({ sql })));
      await tx.execute(
        "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        [migration.version, migration.file, migration.checksum],
      );
    });
    console.log(`APPLY ${migration.file} (${statements.length} langkah)`);
  }

  invalidateSchemaCache();
  const schema = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
  console.log(`Migration ${databaseEnvironment} selesai. Schema aktif: ${schema?.value || "unknown"}.`);
  return { environment: databaseEnvironment, version: Number(schema?.value || 0), pendingApplied: pending.length };
};

export const runDatabaseMigration = async ({ argv = process.argv.slice(2), projectRoot = root } = {}) => {
  const databaseEnvironment = resolveDatabaseProfileTarget({ argv });
  if (databaseEnvironment === "production" && !isRemoteProductionContext()) {
    return runRemoteProductionDatabaseOperation({ operation: "migrate", root: projectRoot });
  }
  return runLocalDatabaseMigration({ databaseEnvironment, projectRoot });
};

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runDatabaseMigration().catch((error) => {
    console.error(error?.message || "Migration database gagal.");
    process.exitCode = 1;
  });
}
