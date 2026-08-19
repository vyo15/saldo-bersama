import { appError } from "./core.js";

const COST_SHARE_MODES = new Set(["unspecified", "equal", "percentage"]);

const parseStoredSplits = (value) => {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        user_id: String(item.user_id || ""),
        basis_points: Number(item.basis_points || 0),
        share_amount: Number(item.share_amount || 0),
      }))
      .filter((item) => item.user_id && Number.isInteger(item.basis_points) && Number.isInteger(item.share_amount));
  } catch {
    return [];
  }
};

const activeParticipants = async (db) => (await db.all("SELECT user_id,name,role FROM users WHERE status='active' ORDER BY user_id"))
  .map((item) => ({ user_id: String(item.user_id), name: String(item.name || "Pengguna"), role: item.role }));

const equalBasisPoints = (participants) => {
  const total = participants.length;
  const base = Math.floor(10_000 / total);
  let remainder = 10_000 - (base * total);
  return participants.map((item) => ({ ...item, basis_points: base + (remainder-- > 0 ? 1 : 0) }));
};

const percentageBasisPoints = (participants, percentages) => {
  if (!Array.isArray(percentages)) throw appError("COST_SHARE_PERCENTAGES_REQUIRED", "Persentase pembagian biaya wajib diisi.", 400);
  const byUser = new Map();
  for (const raw of percentages) {
    const userId = String(raw?.user_id || "");
    const percentage = Number(raw?.percentage);
    if (!userId || byUser.has(userId) || !Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      throw appError("COST_SHARE_PERCENTAGE_INVALID", "Persentase pembagian biaya tidak valid.", 400);
    }
    byUser.set(userId, percentage * 100);
  }
  if (byUser.size !== participants.length || participants.some((item) => !byUser.has(item.user_id))) {
    throw appError("COST_SHARE_PARTICIPANTS_INVALID", "Pembagian biaya harus mencakup seluruh pengguna aktif.", 400);
  }
  const total = [...byUser.values()].reduce((sum, value) => sum + value, 0);
  if (total !== 10_000) throw appError("COST_SHARE_TOTAL_INVALID", "Total pembagian biaya harus tepat 100%.", 400);
  return participants.map((item) => ({ ...item, basis_points: byUser.get(item.user_id) }));
};

const allocateRupiah = (amount, participants) => {
  const rows = participants.map((item) => {
    const weighted = amount * item.basis_points;
    return {
      ...item,
      share_amount: Math.floor(weighted / 10_000),
      remainder: weighted % 10_000,
    };
  });
  let missing = amount - rows.reduce((sum, item) => sum + item.share_amount, 0);
  const order = [...rows].sort((a, b) => b.remainder - a.remainder || a.user_id.localeCompare(b.user_id));
  for (let index = 0; index < order.length && missing > 0; index += 1, missing -= 1) order[index].share_amount += 1;
  return rows
    .sort((a, b) => a.user_id.localeCompare(b.user_id))
    .map(({ user_id, basis_points, share_amount }) => ({ user_id, basis_points, share_amount }));
};

const storedSnapshotBasisPoints = (current) => {
  const stored = parseStoredSplits(current?.cost_share_json);
  if (stored.length < 2) return null;
  const userIds = new Set();
  let total = 0;
  for (const item of stored) {
    if (!item.user_id || userIds.has(item.user_id) || item.basis_points < 0) return null;
    userIds.add(item.user_id);
    total += item.basis_points;
  }
  if (total !== 10_000) return null;
  return stored.map((item) => ({ user_id: item.user_id, basis_points: item.basis_points }));
};

const percentagesMatchStoredSnapshot = (percentages, stored) => {
  if (!Array.isArray(percentages) || percentages.length !== stored.length) return false;
  const requested = new Map();
  for (const item of percentages) {
    const userId = String(item?.user_id || "");
    const percentage = Number(item?.percentage);
    if (!userId || requested.has(userId) || !Number.isInteger(percentage)) return false;
    requested.set(userId, percentage * 100);
  }
  return stored.every((item) => requested.get(item.user_id) === item.basis_points);
};

const requestedCostShareMode = (payload, current) => payload.cost_share_mode === undefined || payload.cost_share_mode === null
  ? String(current?.cost_share_mode || "unspecified")
  : String(payload.cost_share_mode);

const storedWeightsForUpdate = ({ payload, current, mode }) => {
  if (!current || mode !== String(current.cost_share_mode || "unspecified")) return null;
  const snapshot = storedSnapshotBasisPoints(current);
  if (!snapshot) throw appError("COST_SHARE_SNAPSHOT_INVALID", "Snapshot pembagian biaya transaksi tidak valid. Jalankan integrity check sebelum mengubah transaksi.", 409);
  if (mode === "equal") return snapshot;
  if (mode === "percentage" && (payload.cost_share_percentages === undefined || percentagesMatchStoredSnapshot(payload.cost_share_percentages, snapshot))) return snapshot;
  return null;
};

const currentParticipantWeights = async (db, payload, mode) => {
  const participants = await activeParticipants(db);
  if (participants.length < 2) throw appError("COST_SHARE_PARTICIPANTS_INSUFFICIENT", "Pembagian biaya membutuhkan minimal dua pengguna aktif.", 409);
  return mode === "equal" ? equalBasisPoints(participants) : percentageBasisPoints(participants, payload.cost_share_percentages);
};

export const resolveTransactionCostShare = async (db, payload, current, transaction) => {
  if (transaction.transaction_type !== "expense" || transaction.scope !== "shared") {
    return { cost_share_mode: "unspecified", cost_share_json: "[]" };
  }

  const requestedMode = requestedCostShareMode(payload, current);
  if (!COST_SHARE_MODES.has(requestedMode)) throw appError("COST_SHARE_MODE_INVALID", "Mode pembagian biaya tidak valid.", 400);
  if (requestedMode === "unspecified") return { cost_share_mode: requestedMode, cost_share_json: "[]" };

  const storedWeights = storedWeightsForUpdate({ payload, current, mode: requestedMode });
  const weighted = storedWeights || await currentParticipantWeights(db, payload, requestedMode);
  const splits = allocateRupiah(Number(transaction.amount), weighted);
  return { cost_share_mode: requestedMode, cost_share_json: JSON.stringify(splits) };
};

export const transactionCostSharePresentation = (row) => ({
  cost_share_mode: String(row?.cost_share_mode || "unspecified"),
  cost_share: parseStoredSplits(row?.cost_share_json),
});

export const aggregateCostShareRows = (transactionRows, userRows) => {
  const totals = new Map();
  for (const row of transactionRows || []) {
    for (const split of parseStoredSplits(row.cost_share_json)) {
      totals.set(split.user_id, (totals.get(split.user_id) || 0) + Number(split.share_amount || 0));
    }
  }
  const users = new Map((userRows || []).map((item) => [String(item.user_id), item]));
  return [...totals.entries()]
    .map(([userId, amount]) => ({ user_id: userId, label: users.get(userId)?.name || "Pengguna", amount }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
};
