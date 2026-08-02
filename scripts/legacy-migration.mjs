import crypto from "node:crypto";

const MAX_ROWS_PER_TABLE = 200_000;
const intColumns = new Set([
  "row_version", "initial_balance", "allow_negative", "amount", "expected_amount", "actual_amount", "due_day",
  "auto_debit", "default_amount", "allocated_amount", "reserved_amount", "target_amount", "warning_threshold",
  "system_balance", "actual_balance", "difference",
]);
const booleanColumns = new Set(["allow_negative", "auto_debit"]);
const nullableColumns = new Set([
  "firebase_uid", "owner_user_id", "source_account_id", "destination_account_id", "category_id", "envelope_period_id",
  "recurring_occurrence_id", "goal_id", "end_date", "default_account_id", "closed_by", "closed_at", "transaction_id",
  "reversed_by", "reversed_at", "target_date", "reopened_by", "reopened_at", "external_file_id", "verified_at", "error_code",
]);

const table = (legacy, target, columns, transform = null) => ({ legacy, target, columns, transform });
export const LEGACY_TABLES = Object.freeze([
  table("Users", "users", ["user_id","firebase_uid","email","name","role","status","row_version","created_at","updated_at"], (row) => ({ firebase_uid: null, row_version: 1, ...row })),
  table("Accounts", "accounts", ["account_id","name","account_type","owner_scope","owner_user_id","initial_balance","initial_balance_date","allow_negative","status","row_version","created_by","created_at","updated_by","updated_at"]),
  table("Categories", "categories", ["category_id","name","transaction_type","nature","icon","status","row_version","created_by","created_at","updated_by","updated_at"]),
  table("Envelope_Rules", "envelope_rules", ["envelope_rule_id","name","period_type","scope","owner_user_id","default_amount","source_account_id","rollover_policy","overspend_policy","status","row_version","created_by","created_at","updated_by","updated_at"]),
  table("Envelope_Periods", "envelope_periods", ["envelope_period_id","envelope_rule_id","name","period_start","period_end","allocated_amount","reserved_amount","status","row_version","created_by","created_at","updated_by","updated_at","closed_by","closed_at"]),
  table("Recurring_Rules", "recurring_rules", ["recurring_rule_id","name","kind","category_id","expected_amount","frequency","due_day","default_account_id","payment_method","auto_debit","start_date","end_date","priority","status","row_version","created_by","created_at","updated_by","updated_at","scope","owner_user_id"]),
  table("Recurring_Occurrences", "recurring_occurrences", ["occurrence_id","recurring_rule_id","period_key","due_date","expected_amount","actual_amount","status","transaction_ids_json","row_version","created_at","updated_at"], (row) => ({ ...row, transaction_ids_json: normalizeJsonArray(row.transaction_ids_json ?? row.transaction_ids) })),
  table("Savings_Goals", "savings_goals", ["goal_id","name","goal_type","target_amount","target_date","account_id","priority","status","row_version","created_by","created_at","updated_by","updated_at","scope","owner_user_id"]),
  table("Transactions", "transactions", ["transaction_id","transaction_date","transaction_type","source_account_id","destination_account_id","category_id","envelope_period_id","recurring_occurrence_id","goal_id","amount","description","overspend_reason","merchant","payment_method","scope","owner_user_id","status","row_version","idempotency_key","created_by","created_at","updated_by","updated_at","cancelled_by","cancelled_at","cancellation_reason"], (row) => ({ ...row, idempotency_key: row.idempotency_key || `legacy:${row.transaction_id}` })),
  table("Budgets", "budgets", ["budget_id","period_key","category_id","envelope_rule_id","name","amount","warning_threshold","status","row_version","created_by","created_at","updated_by","updated_at","scope","owner_user_id"]),
  table("Envelope_Movements", "envelope_movements", ["movement_id","from_envelope_period_id","to_envelope_period_id","amount","movement_type","reason","status","row_version","created_by","created_at"]),
  table("Goal_Movements", "goal_movements", ["goal_movement_id","goal_id","transaction_id","movement_type","amount","reason","status","row_version","created_by","created_at","reversed_by","reversed_at","reversal_reason"], (row) => ({
    row_version: 1, reversed_by: null, reversed_at: null, reversal_reason: "", ...row,
    movement_type: row.movement_type === "contribution" ? "deposit" : row.movement_type === "withdraw" ? "withdrawal" : row.movement_type,
    status: row.status === "cancelled" ? "reversed" : row.status,
  })),
  table("Reconciliations", "reconciliations", ["reconciliation_id","account_id","reconciled_at","system_balance","actual_balance","difference","notes","status","created_by","created_at"]),
  table("Period_Closures", "period_closures", ["closure_id","period_key","scope","status","snapshot_json","snapshot_hash","reason","row_version","closed_by","closed_at","reopened_by","reopened_at"], (row) => {
    const snapshot = typeof row.snapshot_json === "string" && row.snapshot_json.trim()
      ? row.snapshot_json
      : JSON.stringify({ migratedFromLegacy: true, periodKey: row.period_key, legacySnapshotUnavailable: true });
    return { ...row, snapshot_json: snapshot, snapshot_hash: sha256(snapshot) };
  }),
  table("Audit_Log", "audit_log", ["audit_id","request_id","timestamp","actor_id","actor_email","action","entity_type","entity_id","previous_value","new_value","result"], (row, context) => ({
    previous_value: null, new_value: null, ...row,
    actor_id: row.actor_id || context.userIdByEmail.get(String(row.actor_email || "").toLowerCase()) || "",
  })),
]);

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === null || value === undefined || value === "") return "[]";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error();
    return JSON.stringify(parsed);
  } catch { throw new Error("transaction_ids legacy bukan JSON array yang valid."); }
};
const normalizeCell = (column, value) => {
  if (nullableColumns.has(column) && (value === "" || value === undefined || value === null)) return null;
  if (booleanColumns.has(column)) {
    if ([true, 1, "1", "true"].includes(value)) return 1;
    if ([false, 0, "0", "false", "", null, undefined].includes(value)) return 0;
    throw new Error(`${column} bukan boolean legacy yang valid.`);
  }
  if (intColumns.has(column)) {
    const number = Number(value ?? 0);
    if (!Number.isSafeInteger(number)) throw new Error(`${column} bukan integer aman.`);
    return number;
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
};

export const transformLegacyPayload = (payload) => {
  if (!payload?.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new Error("Format export legacy tidak dikenali.");
  const sourceVersion = Number(payload.schemaVersion);
  if (sourceVersion !== 2) throw new Error(`Schema legacy ${payload.schemaVersion ?? "unknown"} tidak didukung. Gunakan export schema v2.`);
  const userRows = Array.isArray(payload.data.Users) ? payload.data.Users : [];
  const userIdByEmail = new Map(userRows.map((row) => [String(row.email || "").trim().toLowerCase(), row.user_id]));
  const context = { userIdByEmail };
  const records = LEGACY_TABLES.map((definition) => {
    const sourceRows = payload.data[definition.legacy];
    if (sourceRows !== undefined && !Array.isArray(sourceRows)) throw new Error(`${definition.legacy} harus berupa array.`);
    const rows = sourceRows || [];
    if (rows.length > MAX_ROWS_PER_TABLE) throw new Error(`${definition.legacy} melebihi batas ${MAX_ROWS_PER_TABLE} row.`);
    const transformed = rows.map((input, index) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${definition.legacy}[${index}] bukan object.`);
      const raw = definition.transform ? definition.transform({ ...input }, context) : { ...input };
      if (definition.target === "accounts" && raw.account_type === "e-wallet") raw.account_type = "ewallet";
      const output = {};
      for (const column of definition.columns) output[column] = normalizeCell(column, raw[column]);
      const requiredId = definition.columns[0];
      if (!String(output[requiredId] || "").trim()) throw new Error(`${definition.legacy}[${index}].${requiredId} kosong.`);
      if (definition.target === "audit_log" && !output.actor_id) throw new Error(`Audit_Log[${index}] actor_email tidak cocok dengan Users.`);
      return output;
    });
    return { ...definition, rows: transformed };
  });
  const skipped = ["System_Config", "Calendar_Sync", "Notification_Queue", "Push_Subscriptions", "Idempotency", "Backup_Log"]
    .filter((name) => Array.isArray(payload.data[name]) && payload.data[name].length)
    .map((name) => ({ name, count: payload.data[name].length }));
  return { sourceVersion, records, skipped };
};

export const migrationFingerprint = (payload) => sha256(JSON.stringify(payload));
