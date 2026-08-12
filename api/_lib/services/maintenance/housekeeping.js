import { nowIso } from "../core.js";

export const cleanupExpiredEphemeralState = async (db, timestamp = nowIso()) => db.transaction(async (tx) => {
  const idempotency = await tx.execute("DELETE FROM idempotency_keys WHERE expires_at<?", [timestamp]);
  const importPreviews = await tx.execute("DELETE FROM import_previews WHERE expires_at<? AND status<>'applying'", [timestamp]);
  const restorePreviews = await tx.execute("DELETE FROM restore_previews WHERE expires_at<? AND status<>'applying'", [timestamp]);
  return {
    idempotencyKeys: Number(idempotency.rowsAffected || 0),
    importPreviews: Number(importPreviews.rowsAffected || 0),
    restorePreviews: Number(restorePreviews.rowsAffected || 0),
  };
});
