export const assertVerifiedProductionBackup = async ({ database, currentSchemaVersion, targetSchemaVersion, pendingMigrations = [] } = {}) => {
  const version = Number(currentSchemaVersion || 0);
  const target = Number(targetSchemaVersion || 0);
  const pending = [...pendingMigrations].map(String).filter(Boolean);
  if (!pending.length || version <= 0) {
    return { required: false, verified: false, currentSchemaVersion: version, targetSchemaVersion: target, pendingMigrations: pending };
  }

  const backup = await database.one(
    "SELECT schema_version,status,verified_at,created_at FROM backup_runs WHERE status='verified' AND schema_version=? ORDER BY COALESCE(verified_at,created_at) DESC LIMIT 1",
    [version],
  ).catch(() => null);
  if (!backup) {
    throw Object.assign(new Error(
      `Migration Production schema v${version} → v${target || "?"} ditolak: belum ada backup teknis terverifikasi untuk schema v${version}. Buat backup Production terverifikasi terlebih dahulu; migration tidak pernah membuat atau melewati backup secara otomatis.`,
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
    verifiedAt: String(backup.verified_at || backup.created_at || ""),
  };
};
