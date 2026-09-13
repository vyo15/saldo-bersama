import { appendAudit } from "../audit.js";
import { appError, assertVersion, nowIso, sanitizeText } from "../core.js";

const RECONCILIATION_DAYS = new Set([0, 14, 30, 60]);
const RECORDING_CONSISTENCY_DAYS = new Set([0, 3, 5, 7]);
const READ_STATE_LIMIT = 600;
const MARK_READ_LIMIT = 120;

export const defaultNotificationSettings = () => ({
  reconciliation_days: 30,
  recording_consistency_days: 0,
  row_version: null,
  updated_at: null,
  source: "default",
});

export const notificationSettingsForUser = async (db, userId) => {
  const row = await db.one(`SELECT reconciliation_days,recording_consistency_days,row_version,updated_at
    FROM notification_settings WHERE user_id=?`, [userId]);
  if (!row) return defaultNotificationSettings();
  return {
    reconciliation_days: Number(row.reconciliation_days),
    recording_consistency_days: Number(row.recording_consistency_days),
    row_version: Number(row.row_version),
    updated_at: row.updated_at,
    source: "stored",
  };
};

export const notificationReadStatesForUser = async (db, userId) => {
  const rows = await db.all(`SELECT notification_key,fingerprint,read_at
    FROM notification_read_states
    WHERE user_id=?
    ORDER BY read_at DESC
    LIMIT ?`, [userId, READ_STATE_LIMIT]);
  return rows.map((row) => ({
    key: row.notification_key,
    fingerprint: row.fingerprint,
    readAt: row.read_at,
  }));
};

const readIdentity = (item = {}) => {
  const key = sanitizeText(item.key, 200);
  const fingerprint = sanitizeText(item.fingerprint, 240);
  if (!key || !fingerprint) throw appError("INVALID_NOTIFICATION_READ_STATE", "Identitas status baca notifikasi tidak valid.", 400);
  return { key, fingerprint };
};

export const markNotificationRead = async (db, context) => {
  const rawItems = Array.isArray(context.payload?.items) ? context.payload.items : [];
  if (!rawItems.length || rawItems.length > MARK_READ_LIMIT) {
    throw appError("INVALID_NOTIFICATION_READ_STATE", `Status baca wajib berisi 1-${MARK_READ_LIMIT} item.`, 400);
  }
  const items = [...new Map(rawItems.map((item) => {
    const identity = readIdentity(item);
    return [`${identity.key}\u0000${identity.fingerprint}`, identity];
  })).values()];
  const timestamp = nowIso();
  const statements = items.map((item) => ({
    sql: `INSERT INTO notification_read_states(user_id,notification_key,fingerprint,read_at,created_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(user_id,notification_key,fingerprint) DO UPDATE SET read_at=excluded.read_at`,
    args: [context.actor.user_id, item.key, item.fingerprint, timestamp, timestamp],
  }));
  if (typeof db.batch === "function") await db.batch(statements);
  else for (const statement of statements) await db.execute(statement.sql, statement.args);
  return { marked: items.length, readAt: timestamp };
};

const cadenceValue = (value, allowed, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || !allowed.has(number)) throw appError("INVALID_NOTIFICATION_CADENCE", `${label} tidak valid.`, 400);
  return number;
};

export const updateNotificationSettings = async (db, context) => {
  const p = context.payload || {};
  const reconciliationDays = cadenceValue(p.reconciliation_days, RECONCILIATION_DAYS, "Jadwal pengingat cocokkan saldo");
  const recordingConsistencyDays = cadenceValue(p.recording_consistency_days, RECORDING_CONSISTENCY_DAYS, "Jadwal pengingat pencatatan");
  const current = await db.one("SELECT * FROM notification_settings WHERE user_id=?", [context.actor.user_id]);
  const timestamp = nowIso();
  let next;
  if (current) {
    assertVersion(current, context.rowVersion ?? p.row_version);
    next = {
      ...current,
      reconciliation_days: reconciliationDays,
      recording_consistency_days: recordingConsistencyDays,
      row_version: Number(current.row_version) + 1,
      updated_at: timestamp,
    };
    const result = await db.execute(`UPDATE notification_settings
      SET reconciliation_days=?,recording_consistency_days=?,row_version=?,updated_at=?
      WHERE user_id=? AND row_version=?`, [
      next.reconciliation_days,
      next.recording_consistency_days,
      next.row_version,
      timestamp,
      context.actor.user_id,
      current.row_version,
    ]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengaturan notifikasi berubah di perangkat lain.", 409);
  } else {
    if (context.rowVersion !== undefined && context.rowVersion !== null || p.row_version !== undefined && p.row_version !== null) {
      throw appError("CONFLICT", "Pengaturan notifikasi belum memiliki versi yang dapat diperbarui.", 409);
    }
    next = {
      user_id: context.actor.user_id,
      reconciliation_days: reconciliationDays,
      recording_consistency_days: recordingConsistencyDays,
      row_version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    };
    try {
      await db.execute(`INSERT INTO notification_settings(
        user_id,reconciliation_days,recording_consistency_days,row_version,created_at,updated_at
      ) VALUES(?,?,?,?,?,?)`, [
        next.user_id,
        next.reconciliation_days,
        next.recording_consistency_days,
        next.row_version,
        next.created_at,
        next.updated_at,
      ]);
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) throw appError("CONFLICT", "Pengaturan notifikasi berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
      throw error;
    }
  }
  await appendAudit(db, context, {
    entityType: "notification_settings",
    entityId: context.actor.user_id,
    previous: current ? {
      reconciliation_days: Number(current.reconciliation_days),
      recording_consistency_days: Number(current.recording_consistency_days),
      row_version: Number(current.row_version),
    } : null,
    next: {
      reconciliation_days: next.reconciliation_days,
      recording_consistency_days: next.recording_consistency_days,
      row_version: Number(next.row_version),
    },
  });
  return {
    reconciliation_days: next.reconciliation_days,
    recording_consistency_days: next.recording_consistency_days,
    row_version: Number(next.row_version),
    updated_at: next.updated_at,
    source: "stored",
  };
};
