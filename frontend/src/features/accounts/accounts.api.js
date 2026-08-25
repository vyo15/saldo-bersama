import { apiClient } from "../../services/api/client.js";

export const createAccount = (payload, options) => apiClient.request("accounts.create", payload, options);
export const requestAccountCreation = (payload, options) => apiClient.request("accounts.requestCreate", payload, options);
export const updateAccount = (payload, options) => apiClient.request("accounts.update", payload, options);
export const previewAccountLifecycle = (payload, options) => apiClient.request("accounts.previewLifecycle", payload, options);
export const archiveAccount = (payload, options) => apiClient.request("accounts.archive", payload, options);
export const deleteUnusedAccount = (payload, options) => apiClient.request("accounts.deleteUnused", payload, options);

const isValidPeriod = (period) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || ""));
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
};

const addPeriodMonths = (period, offset) => {
  const [year, month] = String(period || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const loadAccountExpenseTrend = async ({ accountId, endPeriod, months }, options = {}) => {
  if (!accountId) throw new TypeError("Rekening wajib dipilih.");
  if (!isValidPeriod(endPeriod)) throw new TypeError("Periode akhir tidak valid.");
  if (![3, 6, 12].includes(months)) throw new RangeError("Rentang grafik harus 3, 6, atau 12 bulan.");
  const report = await apiClient.request("reports.monthly", {
    period: endPeriod,
    trend_months: months,
    account_id: accountId,
  }, options);
  const periods = Array.from({ length: months }, (_, index) => addPeriodMonths(endPeriod, index - months + 1));
  const lookup = new Map((report?.accountExpenseTrend?.items || []).map((item) => [item.period, Number(item.value || 0)]));
  return {
    months,
    items: periods.map((period) => ({ period, value: lookup.get(period) || 0 })),
  };
};
