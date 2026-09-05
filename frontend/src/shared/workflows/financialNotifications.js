import { useCallback, useEffect, useMemo, useState } from "react";

const READ_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "saldo-bersama:notification-center-read:v1:";

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
};

const isRecentRead = (timestamp) => Number(timestamp || 0) >= Date.now() - READ_TTL_MS;

const accountFromReconciliationTitle = (title) => String(title || "")
  .replace(/^Saldo\s+/i, "")
  .replace(/\s+belum pernah (?:dicek|dicocokkan)$/i, "")
  .replace(/^Saatnya (?:cek|cocokkan) saldo\s+/i, "")
  .replace(/\s+berbeda$/i, "")
  .trim();

export const financialNotificationTitle = (alert = {}) => {
  const account = accountFromReconciliationTitle(alert.title);
  if (alert.type === "reconciliation_stale") return account ? `Cocokkan saldo ${account}` : "Cocokkan saldo";
  if (alert.type === "reconciliation_difference") return account ? `Periksa selisih saldo ${account}` : "Periksa selisih saldo";
  return String(alert.title || "Notifikasi");
};

export const financialNotificationCategory = (type) => {
  if (["reconciliation_stale", "reconciliation_difference"].includes(type)) return "Saldo";
  if (["recurring_due", "recurring_overdue"].includes(type)) return "Jadwal";
  if (type === "goal_behind") return "Target";
  if (type === "budget_threshold") return "Anggaran";
  if (["envelope_threshold", "unallocated_expense", "unallocated_funds"].includes(type)) return "Alokasi";
  return "Info";
};

export const notificationRequiresAction = (alert = {}) => alert.severity === "danger" || alert.severity === "warning";

export const useFinancialNotificationReadState = ({ alerts = [], scope = "anonymous" }) => {
  const [readMap, setReadMap] = useState(() => readStoredMap(scope));
  const activeAlerts = useMemo(() => Array.isArray(alerts) ? alerts.filter((alert) => alert?.id) : [], [alerts]);
  const isRead = useCallback((id) => isRecentRead(readMap[id]), [readMap]);
  const unreadCount = useMemo(() => activeAlerts.filter((alert) => !isRecentRead(readMap[alert.id])).length, [activeAlerts, readMap]);

  useEffect(() => {
    setReadMap(readStoredMap(scope));
  }, [scope]);

  const updateReadMap = useCallback((updater) => {
    setReadMap((current) => {
      const next = updater(current);
      persistReadMap(scope, next);
      return next;
    });
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
