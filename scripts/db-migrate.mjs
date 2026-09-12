import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertDatabaseProfileBinding, loadDatabaseProfile, resolveDatabaseProfileTarget } from "./database-profile.mjs";
import { ensureVerifiedProductionBackup } from "./production-migration-safety.mjs";
import { getDatabase } from "../api/_lib/db/httpClient.js";
import { DATABASE_SCHEMA_VERSION, invalidateSchemaCache } from "../api/_lib/db/schema.js";
import { integrityIssues } from "../api/_lib/services/reporting/index.js";

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

export const migrationTargetSchemaVersion = (source, file = "migration.sql") => {
  const text = String(source || "");
  const candidates = [];
  const updatePattern = /UPDATE\s+system_config\s+SET\s+value\s*=\s*['\"](\d+)['\"][\s\S]*?WHERE\s+key\s*=\s*['\"]schema_version['\"]/gi;
  for (const match of text.matchAll(updatePattern)) candidates.push(Number(match[1]));
  const insertPattern = /\(\s*['\"]schema_version['\"]\s*,\s*['\"](\d+)['\"]/gi;
  for (const match of text.matchAll(insertPattern)) candidates.push(Number(match[1]));
  const target = candidates.at(-1);
  if (!Number.isSafeInteger(target) || target <= 0) {
    throw Object.assign(new Error(`Migration ${file} tidak mendeklarasikan target schema_version canonical.`), {
      code: "MIGRATION_TARGET_SCHEMA_MISSING",
      file,
    });
  }
  return target;
};

export const loadMigrations = async ({ projectRoot = root } = {}) => {
  const migrationRoot = path.join(projectRoot, "database", "migrations");
  const files = (await readdir(migrationRoot)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("Migration SQL tidak ditemukan.");
  const migrations = [];
  for (const file of files) {
    const migrationId = Number(file.match(/^(\d+)/)?.[1]);
    const source = await readFile(path.join(migrationRoot, file), "utf8");
    const checksum = crypto.createHash("sha256").update(source).digest("hex");
    const targetSchemaVersion = migrationTargetSchemaVersion(source, file);
    migrations.push({ file, migrationId, targetSchemaVersion, source, checksum });
  }
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    const expectedId = index + 1;
    const expectedTarget = index + 3;
    if (migration.migrationId !== expectedId || migration.targetSchemaVersion !== expectedTarget) {
      throw Object.assign(new Error(
        `Migration chain tidak canonical pada ${migration.file}: ID ${migration.migrationId}→schema v${migration.targetSchemaVersion}, seharusnya ID ${expectedId}→schema v${expectedTarget}.`,
      ), { code: "MIGRATION_ORDER_INVALID", file: migration.file });
    }
  }
  if (migrations.at(-1)?.targetSchemaVersion !== DATABASE_SCHEMA_VERSION) {
    throw Object.assign(new Error(
      `Migration terakhir menuju schema v${migrations.at(-1)?.targetSchemaVersion ?? "?"}, runtime membutuhkan v${DATABASE_SCHEMA_VERSION}.`,
    ), { code: "MIGRATION_RUNTIME_VERSION_MISMATCH" });
  }
  return migrations;
};

const executableStatements = (migration) => migration.source
  .replace(/^\uFEFF?\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/i, "")
  .split(/^\s*-- migrate:split\s*$/m)
  .map((item) => item.trim())
  .filter(Boolean);

const assertAppliedChecksums = (migrations, appliedByMigrationId) => {
  for (const migration of migrations) {
    const appliedChecksum = appliedByMigrationId.get(migration.migrationId);
    if (appliedChecksum && appliedChecksum !== migration.checksum) {
      throw Object.assign(new Error(`Checksum migration ${migration.file} berubah setelah diterapkan.`), {
        code: "MIGRATION_CHECKSUM_CHANGED",
        file: migration.file,
      });
    }
  }
};

const assertMigrationHistory = ({ currentSchemaVersion, pending }) => {
  const stalePending = pending.filter((migration) => migration.targetSchemaVersion <= currentSchemaVersion);
  if (stalePending.length) {
    throw Object.assign(new Error(
      `Riwayat migration tidak konsisten: schema aktif v${currentSchemaVersion}, tetapi ${stalePending.map((item) => item.file).join(", ")} belum tercatat. Migration dihentikan agar ALTER TABLE tidak diputar ulang.`,
    ), { code: "MIGRATION_HISTORY_INCONSISTENT", currentSchemaVersion, files: stalePending.map((item) => item.file) });
  }
};

const assertIntegrityInsideMigration = async (tx) => {
  const [engine, foreignKeys, businessIssues] = await Promise.all([
    tx.one("PRAGMA integrity_check"),
    tx.all("PRAGMA foreign_key_check"),
    integrityIssues(tx),
  ]);
  const engineOk = String(Object.values(engine || {})[0] || "").toLowerCase() === "ok";
  if (!engineOk || foreignKeys.length || businessIssues.length) {
    throw Object.assign(new Error("Migration dibatalkan karena integrity database tidak lulus sebelum commit."), {
      code: "MIGRATION_INTEGRITY_FAILED",
      details: { engine: engineOk ? "ok" : engine, foreignKeyIssues: foreignKeys, businessIssues },
    });
  }
};

const applyPendingAtomically = async ({ db, pending }) => {
  if (!pending.length) return [];
  const applied = [];
  await db.transaction(async (tx) => {
    for (const migration of pending) {
      const statements = executableStatements(migration);
      await tx.batch(statements.map((sql) => ({ sql })));
      await tx.execute(
        "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        [migration.migrationId, migration.file, migration.checksum],
      );
      const schema = await tx.one("SELECT value FROM system_config WHERE key='schema_version'");
      const actualVersion = Number(schema?.value || 0);
      if (actualVersion !== migration.targetSchemaVersion) {
        throw Object.assign(new Error(`Migration ${migration.file} menghasilkan schema v${actualVersion}; target canonical v${migration.targetSchemaVersion}.`), {
          code: "MIGRATION_TARGET_SCHEMA_MISMATCH",
          file: migration.file,
          actualVersion,
          targetVersion: migration.targetSchemaVersion,
        });
      }
      applied.push({ ...migration, statementCount: statements.length });
    }
    await assertIntegrityInsideMigration(tx);
  });
  return applied;
};

export const runLocalDatabaseMigration = async ({ databaseEnvironment, projectRoot = root, logger = console } = {}) => {
  if (databaseEnvironment === "production" && isRemoteProductionContext()) assertRemoteProductionRuntime();
  else await loadDatabaseProfile({ root: projectRoot, environment: databaseEnvironment, refreshRemote: false });

  const migrations = await loadMigrations({ projectRoot });
  const db = getDatabase();
  await assertDatabaseProfileBinding({ database: db, environment: databaseEnvironment });

  let appliedRows = [];
  try { appliedRows = await db.all("SELECT version,checksum FROM schema_migrations"); } catch { appliedRows = []; }
  const appliedByMigrationId = new Map(appliedRows.map((row) => [Number(row.version), String(row.checksum || "")]));
  assertAppliedChecksums(migrations, appliedByMigrationId);

  let currentSchemaVersion = 0;
  try {
    const schemaRow = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
    currentSchemaVersion = Number(schemaRow?.value || 0);
  } catch { currentSchemaVersion = 0; }

  const pending = migrations.filter((migration) => !appliedByMigrationId.has(migration.migrationId));
  assertMigrationHistory({ currentSchemaVersion, pending });

  for (const migration of migrations) {
    if (appliedByMigrationId.has(migration.migrationId)) logger.log?.(`SKIP ${migration.file} (sudah diterapkan)`);
  }

  if (pending.length && databaseEnvironment === "production" && currentSchemaVersion > 0) {
    await ensureVerifiedProductionBackup({
      database: db,
      currentSchemaVersion,
      targetSchemaVersion: pending.at(-1).targetSchemaVersion,
      pendingMigrations: pending.map((item) => item.file),
      logger,
    });
    logger.log?.(`Seluruh ${pending.length} migration pending akan dijalankan dalam satu transaksi atomik; jika satu langkah/integrity gagal, semuanya rollback ke schema v${currentSchemaVersion}.`);
  }

  const applied = await applyPendingAtomically({ db, pending });
  for (const migration of applied) logger.log?.(`APPLY ${migration.file} → schema v${migration.targetSchemaVersion} (${migration.statementCount} langkah)`);

  invalidateSchemaCache();
  const schema = await db.one("SELECT value FROM system_config WHERE key='schema_version'");
  const finalVersion = Number(schema?.value || 0);
  if (finalVersion !== DATABASE_SCHEMA_VERSION) {
    throw Object.assign(new Error(`Migration ${databaseEnvironment} belum mencapai schema runtime: v${finalVersion}/${DATABASE_SCHEMA_VERSION}.`), {
      code: "MIGRATION_SCHEMA_INCOMPLETE",
      actualVersion: finalVersion,
      expectedVersion: DATABASE_SCHEMA_VERSION,
    });
  }
  logger.log?.(`Migration ${databaseEnvironment} selesai. Schema aktif: ${finalVersion}.`);
  return { environment: databaseEnvironment, version: finalVersion, pendingApplied: applied.length, pendingRemaining: 0 };
};

export const runDatabaseMigration = async ({ argv = process.argv.slice(2), projectRoot = root } = {}) => {
  const databaseEnvironment = resolveDatabaseProfileTarget({ argv });
  if (databaseEnvironment === "production" && !isRemoteProductionContext()) {
    const { runProductionUpdate } = await import("./production-update.mjs");
    return runProductionUpdate({ root: projectRoot });
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
