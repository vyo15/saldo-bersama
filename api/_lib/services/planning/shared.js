import { appError, publicRow } from "../core.js";

export const dueDayValue = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) throw appError("INVALID_DUE_DAY", "Tanggal jatuh tempo harus berupa angka 1-31.", 400);
  return parsed;
};

export const addMonths = (date, count) => {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + count;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
};

export const accountWithAccess = async (db, actor, accountId, { optional = false } = {}) => {
  if (!accountId && optional) return null;
  const row = await db.one("SELECT * FROM accounts WHERE account_id=? AND status='active'", [accountId]);
  if (!row) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  if (actor.role !== "owner" && row.owner_scope === "personal" && row.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_ACCOUNT", "Rekening pribadi bukan milik pengguna aktif.",403);
  return row;
};

export const ruleScopeFromAccount = (account) => account?.owner_scope === "personal"
  ? { scope:"personal", owner_user_id:account.owner_user_id }
  : { scope:"shared", owner_user_id:null };

export const assertOwnedAccess = (actor, row) => {
  if (actor.role !== "owner" && row.scope === "personal" && row.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_PERSONAL_DATA","Data pribadi ini bukan milik pengguna aktif.",403);
};

export const assertPlanningManageScope = (actor, row, { allowOwnedPersonal = false } = {}) => {
  if (actor.role === "owner") return;
  if (row?.scope === "shared" && !row?.owner_user_id) return;
  if (allowOwnedPersonal && row?.scope === "personal" && row?.owner_user_id === actor?.user_id) return;
  throw appError(
    "SHARED_PLANNING_ONLY",
    allowOwnedPersonal
      ? "Member hanya dapat mengelola perencanaan Bersama atau personal miliknya sendiri."
      : "Member hanya dapat mengelola perencanaan Bersama.",
    403,
  );
};

export const resolveEnvelopeAssignee = async (db, value) => {
  const userId = String(value || "").trim();
  if (!userId) return null;
  const user = await db.one("SELECT user_id,email,name,role,status FROM users WHERE user_id=?", [userId]);
  if (!user || user.status !== "active") throw appError("INVALID_ENVELOPE_ASSIGNEE", "Pengguna alokasi harus merupakan pengguna aktif.", 400);
  return publicRow(user);
};

export const assertEnvelopeAssigneeAccess = (actor, envelope) => {
  if (actor.role === "owner" || !envelope?.assignee_user_id || envelope.assignee_user_id === actor.user_id) return;
  throw appError("ENVELOPE_ASSIGNEE_FORBIDDEN", "Member hanya dapat menggunakan atau memindahkan Alokasi Dana Bersama dan alokasi miliknya sendiri.", 403);
};


export const canUseEnvelope = (actor, item) => {
  if (!actor || !item || item.status !== "active") return false;
  const scopeAllowed = actor.role === "owner"
    || (item.scope === "shared" && !item.owner_user_id)
    || (item.scope === "personal" && item.owner_user_id === actor.user_id);
  if (!scopeAllowed) return false;
  return actor.role === "owner" || !item.assignee_user_id || item.assignee_user_id === actor.user_id;
};

export const envelopeCapabilities = (actor, item) => {
  const canUse = canUseEnvelope(actor, item);
  return {
    can_manage: canUse,
    can_adjust: canUse,
    can_manage_needs: canUse,
    can_move: canUse,
    can_set_reminder: canUse,
    can_record_expense: canUse,
    can_close: actor?.role === "owner" && item?.status === "active",
    can_archive_rule: actor?.role === "owner" && item?.status === "active",
  };
};

export const hasSameEnvelopeAssignee = (left, right) => String(left?.assignee_user_id || "") === String(right?.assignee_user_id || "");
