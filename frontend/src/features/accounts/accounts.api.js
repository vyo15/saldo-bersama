import { apiClient } from "../../services/api/client.js";

export const createAccount = (payload, options) => apiClient.request("accounts.create", payload, options);
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

const loadExpensePeriod = async (accountId, period, { signal } = {}) => {
  const report = await apiClient.request("reports.monthly", { period, trend_months: 3 }, { signal });
  const accountExpense = (report?.accountExpenses || []).find((item) => item.account_id === accountId);
  return Number(accountExpense?.amount || 0);
};

export const loadAccountExpenseTrend = async ({ accountId, endPeriod, months }, options = {}) => {
  if (!accountId) throw new TypeError("Rekening wajib dipilih.");
  if (!isValidPeriod(endPeriod)) throw new TypeError("Periode akhir tidak valid.");
  if (![3, 6, 12].includes(months)) throw new RangeError("Rentang grafik harus 3, 6, atau 12 bulan.");
  const periods = Array.from({ length: months }, (_, index) => addPeriodMonths(endPeriod, index - months + 1));
  const values = [];
  for (const period of periods) values.push(await loadExpensePeriod(accountId, period, options));
  return {
    months,
    items: periods.map((period, index) => ({ period, value: values[index] })),
  };
};
