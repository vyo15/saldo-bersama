import { formatDateTimeJakarta } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";

export const reconciliationStatusLabel = (item) => {
  if (!item) return "Belum pernah diperiksa";
  const checkedAt = formatDateTimeJakarta(item.reconciled_at, { fallback: "waktu tidak tersedia" });
  const difference = Number(item.difference || 0);
  if (difference === 0) return `Terakhir diperiksa ${checkedAt} · saldo sesuai`;
  return `Terakhir diperiksa ${checkedAt} · ada selisih ${formatRupiah(Math.abs(difference))} saat diperiksa`;
};

export const latestReconciliationByAccount = (items = []) => {
  const lookup = {};
  for (const item of items) {
    const accountId = String(item?.account_id || "");
    if (accountId && !lookup[accountId]) lookup[accountId] = item;
  }
  return lookup;
};
