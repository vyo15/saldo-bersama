const MONTH_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const budgetTotals = (items = []) => items.reduce((result, item) => ({
  amount: result.amount + Number(item.amount || 0),
  used: result.used + Number(item.used_amount || 0),
}), { amount: 0, used: 0 });

export const budgetPercentage = (item = {}) => {
  const amount = Number(item.amount || 0);
  return amount > 0 ? (Number(item.used_amount || 0) / amount) * 100 : 0;
};

export const budgetPeriodMeta = (period, today) => {
  const [yearText, monthText] = String(period || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const validPeriod = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
  if (!validPeriod) return {
    label: String(period || "Periode"),
    rangeLabel: String(period || "Periode"),
    daysLeft: 0,
    elapsedPercent: 100,
    isCurrent: false,
  };

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const label = MONTH_FORMATTER.format(start);
  const [todayYear, todayMonth, todayDay] = String(today || "").split("-").map(Number);
  const isCurrent = todayYear === year && todayMonth === month;
  const isFuture = todayYear < year || (todayYear === year && todayMonth < month);
  const currentDay = isCurrent ? clamp(todayDay || 1, 1, lastDay) : isFuture ? 1 : lastDay;
  const elapsedPercent = isCurrent ? (currentDay / lastDay) * 100 : isFuture ? 0 : 100;
  const daysLeft = isCurrent ? Math.max(0, lastDay - currentDay) : 0;

  return {
    label,
    rangeLabel: `1–${lastDay} ${label}`,
    daysLeft,
    elapsedPercent,
    isCurrent,
  };
};

export const budgetVisualState = (item = {}, periodMeta = {}) => {
  const usedPercent = budgetPercentage(item);
  const warningThreshold = Number(item.warning_threshold || 80);
  const amount = Number(item.amount || 0);
  const used = Number(item.used_amount || 0);
  const remaining = amount - used;
  const pacingAhead = Boolean(periodMeta.isCurrent)
    && usedPercent > Number(periodMeta.elapsedPercent || 0) + 8;

  if (usedPercent > 100) {
    return { key: "danger", label: "Melebihi anggaran", attention: true, usedPercent, warningThreshold, remaining };
  }
  if (usedPercent >= 100) {
    return { key: "danger", label: "Anggaran habis", attention: true, usedPercent, warningThreshold, remaining };
  }
  if (usedPercent >= warningThreshold) {
    return { key: "warning", label: "Hampir habis", attention: true, usedPercent, warningThreshold, remaining };
  }
  if (pacingAhead) {
    return { key: "pace", label: "Pemakaian cepat", attention: true, usedPercent, warningThreshold, remaining };
  }
  return { key: "safe", label: "Aman", attention: false, usedPercent, warningThreshold, remaining };
};

export const budgetSafeDailyAmount = (remaining, periodMeta = {}) => {
  if (!periodMeta.isCurrent || Number(periodMeta.daysLeft || 0) <= 0) return 0;
  return Math.max(0, Math.floor(Number(remaining || 0) / periodMeta.daysLeft));
};
