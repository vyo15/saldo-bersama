import { runIntegrity } from "../reporting/index.js";
import { assertOwner, nowIso } from "../core.js";

export const integrityWithMaintenanceRecovery = async (db, context) => {
  assertOwner(context.actor);
  const result = await runIntegrity(db, context);
  if (result.ok && context.payload?.clearMaintenance === true) await db.execute("UPDATE system_config SET value='false',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
  return result;
};
