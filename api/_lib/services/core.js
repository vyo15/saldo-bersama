import crypto from "node:crypto";
import { canonicalJson, stableValue } from "../serialization.js";

export { canonicalJson, stableValue };

export const appError = (code, message, status = 400, details = null) => Object.assign(new Error(message), { code, status, details });
export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

const jakartaParts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

export const todayJakarta = () => {
  const parts = jakartaParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const periodKey = (value) => {
  const candidate = String(value || todayJakarta().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate)) throw appError("INVALID_PERIOD", "Periode harus berformat YYYY-MM.", 400);
  return candidate;
};

export const dateValue = (value, label = "Tanggal") => {
  const candidate = String(value || "").slice(0, 10);
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(candidate)) throw appError("INVALID_DATE", `${label} tidak valid.`, 400);
  const parsed = new Date(`${candidate}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime()) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed) !== candidate) {
    throw appError("INVALID_DATE", `${label} tidak valid.`, 400);
  }
  return candidate;
};

export const monthBounds = (period) => {
  const [year, month] = periodKey(period).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
};

export const addDays = (date, days) => {
  const parsed = new Date(`${dateValue(date)}T00:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed);
};

export const sanitizeText = (value, max = 250) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
export const safeSpreadsheetText = (value) => {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

export const positiveInteger = (value, label = "Nominal") => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw appError("INVALID_AMOUNT", `${label} harus berupa bilangan bulat positif.`, 400);
  return number;
};

export const nonNegativeInteger = (value, label = "Nominal") => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw appError("INVALID_AMOUNT", `${label} harus berupa bilangan bulat nol atau positif.`, 400);
  return number;
};

export const boundedInteger = (value, fallback, min, max, label) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw appError("INVALID_NUMBER", `${label} harus antara ${min} dan ${max}.`, 400);
  return parsed;
};

export const strictBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw appError("INVALID_BOOLEAN", "Nilai boolean tidak valid.", 400);
};

export const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export const parseJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

export const publicRow = (row, booleanFields = []) => {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (booleanFields.includes(key)) result[key] = Boolean(value);
    else result[key] = value === null || value === undefined ? "" : value;
  }
  return result;
};

export const readableLedgerSql = (_actor, _alias = "") => ({ sql: "1=1", args: [] });
export const readableAccountSql = (_actor, _alias = "") => ({ sql: "1=1", args: [] });

export const operableScopeSql = (actor, alias = "") => {
  const prefix = alias ? `${alias}.` : "";
  if (actor.role === "owner") return { sql: "1=1", args: [] };
  return { sql: `(${prefix}scope = 'shared' OR (${prefix}scope = 'personal' AND ${prefix}owner_user_id = ?))`, args: [actor.user_id] };
};

export const operableAccountSql = (actor, alias = "") => {
  const prefix = alias ? `${alias}.` : "";
  if (actor.role === "owner") return { sql: "1=1", args: [] };
  return { sql: `(${prefix}owner_scope = 'shared' OR (${prefix}owner_scope = 'personal' AND ${prefix}owner_user_id = ?))`, args: [actor.user_id] };
};

// Backward-compatible aliases remain write-oriented. Read paths must opt into readable*Sql explicitly.
export const visibleScopeSql = operableScopeSql;
export const visibleAccountSql = operableAccountSql;

export const normalizeOwnedScope = async (db, actor, payload = {}, fallback = { scope: "shared", owner_user_id: null }) => {
  const requested = payload.scope === undefined ? fallback.scope : String(payload.scope);
  if (!new Set(["shared", "personal"]).has(requested)) throw appError("INVALID_SCOPE", "Scope harus personal atau shared.", 400);
  if (requested === "shared") return { scope: "shared", owner_user_id: null };
  const ownerUserId = actor.role === "owner" && payload.owner_user_id ? String(payload.owner_user_id) : String(fallback.owner_user_id || actor.user_id);
  const owner = await db.one("SELECT user_id FROM users WHERE user_id = ? AND status = 'active'", [ownerUserId]);
  if (!owner) throw appError("USER_NOT_FOUND", "Pemilik data personal tidak aktif.", 404);
  return { scope: "personal", owner_user_id: ownerUserId };
};

export const scopeFromAccountPair = (source, destination) => {
  const scoped = [source, destination].filter(Boolean).map((account) => account.owner_scope === "personal"
    ? { scope: "personal", owner_user_id: account.owner_user_id }
    : { scope: "shared", owner_user_id: null });
  if (!scoped.length) return { scope: "shared", owner_user_id: null };
  const first = scoped[0];
  if (scoped.some((item) => item.scope !== first.scope || String(item.owner_user_id || "") !== String(first.owner_user_id || ""))) {
    throw appError("CROSS_OWNERSHIP_TRANSFER", "Rekening sumber dan tujuan harus berada pada kepemilikan yang sama.", 409);
  }
  return first;
};

export const assertVersion = (row, expected) => {
  const version = Number(expected);
  if (!Number.isSafeInteger(version) || version !== Number(row?.row_version || 0)) {
    throw appError("CONFLICT", "Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409, { currentVersion: Number(row?.row_version || 0) });
  }
};

export const assertOwner = (actor) => {
  if (actor.role !== "owner") throw appError("OWNER_ONLY", "Operasi ini hanya dapat dilakukan Administrator.", 403);
};

export const redactErrorMessage = (error) => sanitizeText(error?.message || "Operasi gagal.", 300).replace(/(?:turso|libsql):\/\/[^\s]+/gi, "[database]");
