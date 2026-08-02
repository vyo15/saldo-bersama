import { canonicalJson, nowIso, publicRow, uuid } from "./core.js";

export const appendAudit = async (db, context, { action = context.action, entityType, entityId = "", previous = null, next = null, result = "success" }) => {
  const record = {
    audit_id: uuid(), request_id: context.requestId, timestamp: nowIso(), actor_id: context.actor.user_id,
    actor_email: context.actor.email, action, entity_type: entityType, entity_id: String(entityId || ""),
    previous_value: previous === null ? null : canonicalJson(previous),
    new_value: next === null ? null : canonicalJson(next), result,
  };
  await db.execute(`INSERT INTO audit_log(audit_id,request_id,timestamp,actor_id,actor_email,action,entity_type,entity_id,previous_value,new_value,result)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return publicRow(record);
};

export const listAudit = async (db, context) => {
  const limit = Math.min(200, Math.max(1, Number(context.payload?.limit || 50)));
  const rows = await db.all(`SELECT audit_id,timestamp,actor_email,action,entity_type,entity_id,result
    FROM audit_log ORDER BY timestamp DESC LIMIT ?`, [limit]);
  return { items: rows.map((row) => publicRow(row)) };
};
