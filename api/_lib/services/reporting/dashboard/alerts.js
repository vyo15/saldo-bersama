import { readableAccountSql, todayJakarta } from "../../core.js";

// Alerts are read-model interpretations only. They never change ledger/planning state;
// actionable mutations continue through their canonical domain services.
const ALERT_PRIORITY = Object.freeze({ danger: 3, warning: 2, info: 1 });

const dayDifference = (from, to) => Math.floor((new Date(`${to}T00:00:00+07:00`) - new Date(`${from}T00:00:00+07:00`)) / 86_400_000);

const usageThreshold = (percentage, custom = 75) => {
  if (percentage >= 100) return { threshold: 100, severity: "danger" };
  if (percentage >= 90) return { threshold: 90, severity: "warning" };
  if (percentage >= custom) return { threshold: custom, severity: "warning" };
  return null;
};

export const reconciliationAlertStatement = (actor) => {
  const access = readableAccountSql(actor, "a");
  return {
    sql: `SELECT a.account_id,a.name,r.reconciled_at,r.difference
      FROM accounts a
      LEFT JOIN (
        SELECT account_id,reconciled_at,difference FROM (
          SELECT account_id,reconciled_at,difference,ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY reconciled_at DESC,created_at DESC) AS rn
          FROM reconciliations
        ) latest WHERE latest.rn=1
      ) r ON r.account_id=a.account_id
      WHERE a.status='active' AND ${access.sql}
      ORDER BY a.name COLLATE NOCASE`,
    args: access.args,
  };
};

const reconciliationAlertsFromRows = (rows, accounts) => {
  const balanceLookup = new Map(accounts.map((item) => [item.account_id, Number(item.balance || 0)]));
  const accountLabelLookup = new Map(accounts.map((item) => [
    item.account_id,
    item.owner_scope === "personal" ? `${item.name} · Pribadi · ${item.owner_name || "Pengguna"}` : `${item.name} · Bersama`,
  ]));
  const today = todayJakarta();
  const alerts = [];
  for (const row of rows) {
    const accountLabel = accountLabelLookup.get(row.account_id) || row.name;
    if (Number(row.difference || 0) !== 0) {
      alerts.push({
        id: `reconciliation-difference:${row.account_id}`,
        type: "reconciliation_difference",
        severity: "danger",
        title: `Saldo ${accountLabel} berbeda`,
        message: "Saldo yang terakhir Anda cek berbeda dari catatan aplikasi.",
        targetPath: "/rekonsiliasi",
      });
      continue;
    }
    const age = row.reconciled_at ? dayDifference(String(row.reconciled_at).slice(0, 10), today) : Number.POSITIVE_INFINITY;
    if (balanceLookup.get(row.account_id) !== 0 && age > 30) {
      alerts.push({
        id: `reconciliation-stale:${row.account_id}`,
        type: "reconciliation_stale",
        severity: "info",
        title: row.reconciled_at ? `Saatnya cocokkan saldo ${accountLabel}` : `Saldo ${accountLabel} belum pernah dicocokkan`,
        message: row.reconciled_at ? "Sudah lebih dari 30 hari sejak saldo terakhir dicocokkan." : "Pastikan saldo aplikasi sama dengan saldo yang benar-benar Anda lihat di bank atau uang tunai.",
        targetPath: "/rekonsiliasi",
      });
    }
  }
  return alerts;
};

const unallocatedAlerts = (period, count) => count > 0 ? [{
  id: `unallocated:${period}`,
  type: "unallocated_expense",
  severity: "warning",
  title: `${count} pengeluaran belum masuk Alokasi Dana`,
  message: "Pilih Alokasi Dana agar dana tersisa dan laporan perencanaan tetap akurat.",
  targetPath: "/transaksi",
}] : [];

const budgetAlerts = (budgets) => {
  const alerts = [];
  for (const item of budgets) {
    const amount = Number(item.amount || 0);
    if (!amount) continue;
    const percentage = Math.round((Number(item.used_amount || 0) / amount) * 100);
    const crossed = usageThreshold(percentage, Number(item.warning_threshold || 80));
    if (!crossed) continue;
    alerts.push({
      id: `budget:${item.budget_id}:${crossed.threshold}`,
      type: "budget_threshold",
      severity: crossed.severity,
      title: `${item.name} ${percentage}% terpakai`,
      message: percentage >= 100 ? "Anggaran kebutuhan telah terlampaui." : `Pemakaian melewati ambang ${crossed.threshold}%.`,
      targetPath: "/perencanaan/kantong",
    });
  }
  return alerts;
};

const envelopeAlerts = (envelopes) => {
  const alerts = [];
  for (const item of envelopes) {
    const allocated = Number(item.allocated_amount || 0);
    if (!allocated) continue;
    const used = Number(item.used_amount || 0) + Number(item.reserved_amount || 0);
    const percentage = Math.round((used / allocated) * 100);
    const crossed = usageThreshold(percentage, 75);
    if (!crossed) continue;
    alerts.push({
      id: `envelope:${item.envelope_period_id}:${crossed.threshold}`,
      type: "envelope_threshold",
      severity: crossed.severity,
      title: `${item.name} ${percentage}% terpakai + dipesan`,
      message: percentage >= 100 ? "Dana pada Alokasi Dana sudah habis atau terlampaui." : `Dana tersisa pada Alokasi Dana mendekati batas ${crossed.threshold}%.`,
      targetPath: "/perencanaan/kantong",
    });
  }
  return alerts;
};

const recurringAlerts = (recurring) => {
  const alerts = [];
  const today = todayJakarta();
  for (const item of recurring) {
    if (["paid", "received", "cancelled"].includes(item.status)) continue;
    const dueInDays = dayDifference(today, item.due_date);
    if (item.status === "overdue" || dueInDays < 0) {
      alerts.push({ id: `recurring-overdue:${item.occurrence_id}`, type: "recurring_overdue", severity: "danger", title: `${item.name} terlambat`, message: `Jatuh tempo ${item.due_date} dan belum diselesaikan.`, targetPath: "/perencanaan/jadwal" });
      continue;
    }
    if (dueInDays <= 7) {
      alerts.push({ id: `recurring-due:${item.occurrence_id}`, type: "recurring_due", severity: "warning", title: `${item.name} segera jatuh tempo`, message: `Jatuh tempo ${item.due_date}.`, targetPath: "/perencanaan/jadwal" });
    }
  }
  return alerts;
};

const goalAlerts = (goals) => goals
  .filter((item) => item.pace_status === "behind")
  .map((item) => ({
    id: `goal-behind:${item.goal_id}`,
    type: "goal_behind",
    severity: "warning",
    title: `${item.name} tertinggal dari rencana`,
    message: `Perkiraan kebutuhan setoran bulanan Rp ${Number(item.required_monthly_amount || 0).toLocaleString("id-ID")}.`,
    targetPath: "/target",
  }));

const sortFinancialAlerts = (alerts) => alerts.sort((left, right) => (
  (ALERT_PRIORITY[right.severity] || 0) - (ALERT_PRIORITY[left.severity] || 0)
  || left.title.localeCompare(right.title, "id")
));

export const buildFinancialAlerts = ({
  period,
  historical,
  accounts,
  envelopes,
  recurring,
  goals,
  budgets,
  unallocatedCount,
  reconciliationRows = [],
}) => {
  if (historical) return [];
  return sortFinancialAlerts([
    ...unallocatedAlerts(period, unallocatedCount),
    ...budgetAlerts(budgets),
    ...envelopeAlerts(envelopes),
    ...recurringAlerts(recurring),
    ...goalAlerts(goals),
    ...reconciliationAlertsFromRows(reconciliationRows, accounts),
  ]);
};
