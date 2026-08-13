import { appendAudit } from "../audit.js";
import { runIntegrity } from "../reporting/index.js";
import { assertOwner, nowIso } from "../core.js";

export const integrityWithMaintenanceRecovery = async (db, context) => {
  assertOwner(context.actor);
  const clearRequested = context.payload?.clearMaintenance === true;
  const before = clearRequested ? await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'") : null;
  const result = await runIntegrity(db, context);
  let maintenanceCleared = false;
  if (result.ok && clearRequested && before?.value === "true") {
    const timestamp = nowIso();
    maintenanceCleared = await db.transaction(async (tx) => {
      const update = await tx.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode' AND value='true'", [timestamp]);
      if (update.rowsAffected !== 1) return false;
      await appendAudit(tx, context, {
        action: "maintenance.recover",
        entityType: "system_config",
        entityId: "maintenance_mode",
        previous: { value: true },
        next: { value: false, recoveredAt: timestamp, integrityCheckedAt: result.checkedAt },
      });
      return true;
    });
  }
  return { ...result, maintenanceCleared };
};
