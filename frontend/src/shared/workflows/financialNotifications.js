import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateLongIndonesia } from "../../domain/dates.js";

const READ_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "saldo-bersama:notification-center-read:v1:";
const READ_STATE_EVENT = "saldo-bersama:notification-read-state";

const safeStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};

const storageKey = (scope) => `${STORAGE_PREFIX}${String(scope || "anonymous")}`;

const readStoredMap = (scope) => {
  try {
    const raw = safeStorage()?.getItem(storageKey(scope));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const persistReadMap = (scope, value) => {
  try { safeStorage()?.setItem(storageKey(scope), JSON.stringify(value)); } catch { /* local storage is optional UI state */ }
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(READ_STATE_EVENT, { detail: { scope: String(scope || "anonymous") } }));
  } catch { /* same-tab synchronization is best effort */ }
};

const isRecentRead = (timestamp) => Number(timestamp || 0) >= Date.now() - READ_TTL_MS;

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
  if (alert.type === "budget_threshold") return "Periksa anggaran";
  if (alert.type === "envelope_threshold") return "Periksa Alokasi Dana";
  if (alert.type === "unallocated_expense") return "Alokasikan pengeluaran";
  if (alert.type === "unallocated_funds") return "Dana alokasi belum cukup";
  if (alert.type === "recurring_funding_shortage") return "Dana jadwal rutin belum cukup";
  if (alert.type === "recurring_completed") return "Jadwal rutin selesai";
  if (alert.type === "manual_reminder") return String(alert.title || "Pengingat");
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
  return last ? `Terakhir ${last}` : "Belum pernah dicocokkan";
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
  unallocated_expense: () => "Belum masuk Alokasi Dana",
  unallocated_funds: (alert) => Number(alert.fundingGap || 0) > 0 ? `Kurang Rp ${Number(alert.fundingGap).toLocaleString("id-ID")}` : "Dana alokasi belum mencukupi kebutuhan",
  recurring_funding_shortage: (alert) => String(alert.message || "Dana rekening sumber belum mencukupi").replace(/[.!?]+$/, ""),
  recurring_completed: (alert) => String(alert.message || "Pembayaran rutin sudah dicatat").replace(/[.!?]+$/, ""),
  manual_reminder: (alert) => String(alert.message || "Pengingat Anda sudah waktunya").replace(/[.!?]+$/, ""),
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

export const useFinancialNotificationReadState = ({ alerts = [], scope = "anonymous" }) => {
  const [readMap, setReadMap] = useState(() => readStoredMap(scope));
  const readMapRef = useRef(readMap);
  const activeAlerts = useMemo(() => Array.isArray(alerts) ? alerts.filter((alert) => alert?.id) : [], [alerts]);
  const isRead = useCallback((id) => isRecentRead(readMap[id]), [readMap]);
  const unreadCount = useMemo(() => activeAlerts.filter((alert) => !isRecentRead(readMap[alert.id])).length, [activeAlerts, readMap]);

  useEffect(() => {
    const next = readStoredMap(scope);
    readMapRef.current = next;
    setReadMap(next);
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = (event) => {
      const eventScope = event?.detail?.scope;
      if (eventScope && eventScope !== String(scope || "anonymous")) return;
      const next = readStoredMap(scope);
      readMapRef.current = next;
      setReadMap(next);
    };
    const syncStorage = (event) => {
      if (event.key !== storageKey(scope)) return;
      const next = readStoredMap(scope);
      readMapRef.current = next;
      setReadMap(next);
    };
    window.addEventListener(READ_STATE_EVENT, sync);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(READ_STATE_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, [scope]);

  const updateReadMap = useCallback((updater) => {
    const next = updater(readMapRef.current);
    readMapRef.current = next;
    setReadMap(next);
    persistReadMap(scope, next);
  }, [scope]);

  const markRead = useCallback((id) => {
    if (!id) return;
    updateReadMap((current) => ({ ...current, [id]: Date.now() }));
  }, [updateReadMap]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    updateReadMap((current) => ({ ...current, ...Object.fromEntries(activeAlerts.map((alert) => [alert.id, now])) }));
  }, [activeAlerts, updateReadMap]);

  return { alerts: activeAlerts, unreadCount, isRead, markRead, markAllRead };
};
