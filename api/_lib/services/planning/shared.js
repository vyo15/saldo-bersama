import { appError } from "../core.js";

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
