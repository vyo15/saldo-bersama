import { createTechnicalBackup } from "../api/_lib/services/maintenance/backup.js";

const verifiedBackupForSchema = async (database, schemaVersion) => database.one(
  "SELECT backup_id,backup_type,schema_version,status,verified_at,created_at,external_file_id FROM backup_runs WHERE status='verified' AND schema_version=? ORDER BY COALESCE(verified_at,created_at) DESC LIMIT 1",
  [Number(schemaVersion || 0)],
).catch(() => null);

export const assertVerifiedProductionBackup = async ({ database, currentSchemaVersion, targetSchemaVersion, pendingMigrations = [] } = {}) => {
  const version = Number(currentSchemaVersion || 0);
  const target = Number(targetSchemaVersion || 0);
  const pending = [...pendingMigrations].map(String).filter(Boolean);
  if (!pending.length || version <= 0) {
    return { required: false, verified: false, currentSchemaVersion: version, targetSchemaVersion: target, pendingMigrations: pending };
  }

  const backup = await verifiedBackupForSchema(database, version);
  if (!backup) {
    throw Object.assign(new Error(
      `Migration Production schema v${version} → v${target || "?"} ditolak: belum ada backup teknis terverifikasi untuk schema v${version}.`,
    ), {
      code: "PRODUCTION_MIGRATION_BACKUP_REQUIRED",
      currentSchemaVersion: version,
      targetSchemaVersion: target || null,
      pendingMigrations: pending,
    });
  }
  return {
    required: true,
    verified: true,
    currentSchemaVersion: version,
    targetSchemaVersion: target || null,
    pendingMigrations: pending,
    backupId: String(backup.backup_id || ""),
    fileId: String(backup.external_file_id || ""),
    verifiedAt: String(backup.verified_at || backup.created_at || ""),
  };
};

const activeOwner = async (database) => database.one(
  "SELECT user_id,email,role,status FROM users WHERE role='owner' AND status='active' ORDER BY created_at ASC LIMIT 1",
).catch(() => null);

export const ensureVerifiedProductionBackup = async ({ database, currentSchemaVersion, targetSchemaVersion, pendingMigrations = [], logger = console, backupCreator = createTechnicalBackup } = {}) => {
  const version = Number(currentSchemaVersion || 0);
  const target = Number(targetSchemaVersion || 0);
  const pending = [...pendingMigrations].map(String).filter(Boolean);
  if (!pending.length || version <= 0) {
    return { required: false, verified: false, created: false, currentSchemaVersion: version, targetSchemaVersion: target, pendingMigrations: pending };
  }

  const owner = await activeOwner(database);
  if (!owner?.user_id) {
    throw Object.assign(new Error(`Backup otomatis sebelum migration v${version} → v${target || "?"} gagal: Administrator aktif tidak ditemukan.`), {
      code: "PRODUCTION_MIGRATION_BACKUP_OWNER_MISSING",
      currentSchemaVersion: version,
      targetSchemaVersion: target || null,
    });
  }

  logger.log?.(`Membuat backup fresh Production schema v${version} sebelum update atomik ke v${target || "?"}...`);
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const context = {
    actor: owner,
    action: "backup.create",
    payload: { type: "pre-migration" },
    requestId: `production-migration-backup-v${version}-${nonce}`,
    idempotencyKey: `production-migration-backup-v${version}-${nonce}`,
  };
  const created = await backupCreator(database, context, { type: "pre-migration", audit: true });
  if (created?.status !== "verified") {
    throw Object.assign(new Error(`Backup Production schema v${version} belum verified; migration dibatalkan sebelum data diubah.`), {
      code: "PRODUCTION_MIGRATION_BACKUP_NOT_VERIFIED",
      currentSchemaVersion: version,
      targetSchemaVersion: target || null,
    });
  }

  const verified = await assertVerifiedProductionBackup({
    database,
    currentSchemaVersion: version,
    targetSchemaVersion: target,
    pendingMigrations: pending,
  });
  logger.log?.(`Backup fresh schema v${version} verified (${verified.backupId || "backup"}). Update database aman dilanjutkan.`);
  return { ...verified, created: true };
};
