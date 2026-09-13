import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { markNotificationsRead } from "../../services/notificationCenter.js";

const reconciliationAccountFromTitle = (title) => String(title || "")
  .replace(/^Saldo\s+/i, "")
  .replace(/^Catatan investasi\s+/i, "")
  .replace(/^Investasi\s+/i, "")
  .replace(/\s+belum pernah (?:dicek|dicocokkan)$/i, "")
  .replace(/^Saatnya (?:cek|cocokkan) saldo\s+/i, "")
  .replace(/^Saatnya (?:cek|cocokkan) investasi\s+/i, "")
  .replace(/\s+berbeda$/i, "")
  .trim();

const notificationDate = (value) => formatDateLongIndonesia(String(value || "").slice(0, 10));

const titleMatch = (alert, expression) => String(alert?.title || "").match(expression);

const compactMonthlyAmount = (message) => {
  const match = String(message || "").match(/Rp\s+([0-9]+(?:\.[0-9]{3})*)/i);
  return match ? `Butuh sekitar Rp ${match[1]}/bulan` : "Perlu tambahan dana berkala";
};

const RECONCILIATION_TYPES = new Set([
  "reconciliation_stale",
  "reconciliation_difference",
  "investment_reconciliation_stale",
  "investment_reconciliation_difference",
]);

const EVENT_ACTION_TYPES = new Set(["recurring_funding_shortage"]);

const ACTION_TYPES = new Set([
  ...RECONCILIATION_TYPES,
  "recurring_due",
  "recurring_overdue",
  "goal_behind",
  "budget_threshold",
  "envelope_threshold",
  "unallocated_expense",
  "unallocated_funds",
]);

export const financialNotificationTitle = (alert = {}) => {
  if (alert.type === "reconciliation_stale") return "Cocokkan saldo";
  if (alert.type === "reconciliation_difference") return "Periksa selisih saldo";
  if (alert.type === "investment_reconciliation_stale") return "Cocokkan investasi";
  if (alert.type === "investment_reconciliation_difference") return "Periksa selisih investasi";
  if (alert.type === "recurring_overdue") return "Jadwal terlambat";
  if (alert.type === "recurring_due") return "Jadwal segera jatuh tempo";
  if (alert.type === "goal_behind") return "Target tertinggal";
  if (alert.type === "budget_threshold") return "Periksa kebutuhan";
  if (alert.type === "envelope_threshold") return "Periksa Alokasi Dana";
  if (alert.type === "unallocated_expense") return "Pengeluaran belum masuk kebutuhan";
  if (alert.type === "unallocated_funds") return "Dana alokasi belum cukup";
  if (alert.type === "recurring_funding_shortage") return "Dana jadwal rutin belum cukup";
  if (alert.type === "recurring_completed") return "Jadwal rutin selesai";
  if (alert.type === "manual_reminder") return String(alert.title || "Pengingat");
  if (alert.type === "recording_consistency") return "Ada yang belum sempat dicatat?";
  return String(alert.title || "Notifikasi");
};

const entityFromPattern = (alert, expression, group = 1) => titleMatch(alert, expression)?.[group]?.trim() || "";

const ENTITY_READERS = Object.freeze({
  budget_threshold: (alert) => entityFromPattern(alert, /^(.*)\s+(\d+)%\s+terpakai$/i),
  envelope_threshold: (alert) => entityFromPattern(alert, /^(.*)\s+(\d+)%\s+terpakai \+ dipesan$/i),
  recurring_overdue: (alert) => entityFromPattern(alert, /^(.*)\s+terlambat$/i),
  recurring_due: (alert) => entityFromPattern(alert, /^(.*)\s+segera jatuh tempo$/i),
  goal_behind: (alert) => entityFromPattern(alert, /^(.*)\s+tertinggal dari rencana$/i),
  unallocated_expense: (alert) => entityFromPattern(alert, /^(\d+\s+pengeluaran)\b/i),
  unallocated_funds: (alert) => entityFromPattern(alert, /^(.*)\s+kekurangan dana$/i),
  recurring_funding_shortage: (alert) => entityFromPattern(alert, /^Dana\s+(.*)\s+belum cukup$/i),
  recurring_completed: (alert) => entityFromPattern(alert, /^(.*)\s+berhasil dicatat$/i),
});

const reconciliationFact = (alert) => {
  const last = notificationDate(alert.lastReconciledAt);
  if (last) return `Terakhir ${last}`;
  if (alert.source === "event" && alert.message) return String(alert.message).replace(/[.!?]+$/, "");
  return "Belum pernah dicocokkan";
};

const percentageFact = (alert, expression, suffix, fallback) => {
  const percentage = titleMatch(alert, expression)?.[1];
  return percentage ? `${percentage}% ${suffix}` : fallback;
};

const recurringFact = (alert) => {
  const dueDate = String(alert.message || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const formatted = notificationDate(dueDate);
  return formatted ? `Jatuh tempo ${formatted}` : "Periksa jadwal pembayaran";
};

const FACT_READERS = Object.freeze({
  budget_threshold: (alert) => percentageFact(alert, /\s(\d+)%\s+terpakai$/i, "terpakai", "Pemakaian melewati ambang"),
  envelope_threshold: (alert) => percentageFact(alert, /\s(\d+)%\s+terpakai \+ dipesan$/i, "terpakai + dipesan", "Dana mendekati batas"),
  recurring_due: recurringFact,
  recurring_overdue: recurringFact,
  goal_behind: (alert) => compactMonthlyAmount(alert.message),
  unallocated_expense: () => "Belum terhubung ke Kebutuhan",
  unallocated_funds: (alert) => Number(alert.fundingGap || 0) > 0 ? `Kurang Rp ${Number(alert.fundingGap).toLocaleString("id-ID")}` : "Dana alokasi belum mencukupi kebutuhan",
  recurring_funding_shortage: (alert) => String(alert.message || "Dana rekening sumber belum mencukupi").replace(/[.!?]+$/, ""),
  recurring_completed: (alert) => String(alert.message || "Pembayaran rutin sudah dicatat").replace(/[.!?]+$/, ""),
  manual_reminder: (alert) => String(alert.message || "Pengingat Anda sudah waktunya").replace(/[.!?]+$/, ""),
  recording_consistency: (alert) => String(alert.message || "Buka Saldo Bersama kalau ada transaksi yang ingin dirapikan.").replace(/[.!?]+$/, ""),
});

export const financialNotificationEntity = (alert = {}) => {
  if (RECONCILIATION_TYPES.has(alert.type)) return reconciliationAccountFromTitle(alert.title);
  return ENTITY_READERS[alert.type]?.(alert) || "";
};

export const financialNotificationFact = (alert = {}) => {
  if (RECONCILIATION_TYPES.has(alert.type)) return reconciliationFact(alert);
  return FACT_READERS[alert.type]?.(alert) || String(alert.message || "").replace(/[.!?]+$/, "").trim();
};

export const notificationRequiresAction = (alert = {}) => ACTION_TYPES.has(alert.type) || EVENT_ACTION_TYPES.has(alert.type) || alert.severity === "danger" || alert.severity === "warning";

export const mergeNotificationCenterItems = (alerts = [], events = []) => {
  const active = (Array.isArray(alerts) ? alerts : []).filter((item) => item?.id).map((item) => ({ ...item, source: item.source || "active" }));
  const activeTypes = new Set(active.map((item) => item.type));
  const recentEvents = (Array.isArray(events) ? events : [])
    .filter((item) => item?.id && !(["recurring_due", "budget_threshold", "envelope_threshold", "goal_behind", "unallocated_expense"].includes(item.type) && activeTypes.has(item.type)))
    .map((item) => ({ ...item, source: "event" }));
  return [...active, ...recentEvents].sort((left, right) => {
    const leftAction = notificationRequiresAction(left) ? 1 : 0;
    const rightAction = notificationRequiresAction(right) ? 1 : 0;
    if (leftAction !== rightAction) return rightAction - leftAction;
    return String(right.occurredAt || "").localeCompare(String(left.occurredAt || ""));
  });
};

export const notificationReadIdentity = (alert = {}) => {
  const key = String(alert.id || "").slice(0, 200);
  const checkpoint = String(alert.lastReconciledAt || alert.period || alert.guidanceId || alert.occurredAt || key).slice(0, 150);
  const fingerprint = `v1:${String(alert.type || "unknown").slice(0, 60)}:${checkpoint}`.slice(0, 240);
  return { key, fingerprint };
};

const identityToken = ({ key, fingerprint }) => `${key}\u0000${fingerprint}`;

export const useFinancialNotificationReadState = ({ alerts = [], readStates = [] }) => {
  const [optimisticRead, setOptimisticRead] = useState(() => new Set());
  const activeAlerts = useMemo(() => Array.isArray(alerts) ? alerts.filter((alert) => alert?.id) : [], [alerts]);
  const remoteRead = useMemo(() => new Set((Array.isArray(readStates) ? readStates : [])
    .filter((item) => item?.key && item?.fingerprint)
    .map((item) => identityToken(item))), [readStates]);

  useEffect(() => {
    setOptimisticRead((current) => {
      const next = new Set([...current].filter((token) => !remoteRead.has(token)));
      return next.size === current.size ? current : next;
    });
  }, [remoteRead]);

  const isRead = useCallback((alertOrId) => {
    const alert = typeof alertOrId === "string" ? activeAlerts.find((item) => item.id === alertOrId) : alertOrId;
    if (!alert) return false;
    const token = identityToken(notificationReadIdentity(alert));
    return remoteRead.has(token) || optimisticRead.has(token);
  }, [activeAlerts, optimisticRead, remoteRead]);

  const unreadCount = useMemo(() => activeAlerts.filter((alert) => !isRead(alert)).length, [activeAlerts, isRead]);

  const persistRead = useCallback(async (selected) => {
    const identities = selected.map(notificationReadIdentity).filter((item) => item.key && item.fingerprint);
    if (!identities.length) return;
    const tokens = identities.map(identityToken);
    setOptimisticRead((current) => new Set([...current, ...tokens]));
    try {
      for (let index = 0; index < identities.length; index += 100) {
        await markNotificationsRead(identities.slice(index, index + 100));
      }
    } catch (error) {
      setOptimisticRead((current) => {
        const next = new Set(current);
        for (const token of tokens) if (!remoteRead.has(token)) next.delete(token);
        return next;
      });
      throw error;
    }
  }, [remoteRead]);

  const markRead = useCallback((alertOrId) => {
    const alert = typeof alertOrId === "string" ? activeAlerts.find((item) => item.id === alertOrId) : alertOrId;
    return alert ? persistRead([alert]) : Promise.resolve();
  }, [activeAlerts, persistRead]);

  const markAllRead = useCallback(() => persistRead(activeAlerts), [activeAlerts, persistRead]);

  return { alerts: activeAlerts, unreadCount, isRead, markRead, markAllRead };
};
