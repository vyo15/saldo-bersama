import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiLoader, FiX } from "react-icons/fi";
import { getMutationActivitySnapshot, subscribeToMutationActivity } from "../../services/api/client.js";
import styles from "./FeedbackProvider.module.css";
import { FeedbackContext } from "./feedbackContext.js";

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 4_500;
const PROCESS_SUCCESS_MS = 1_600;
const PROCESS_ERROR_MS = 4_500;

const safeTone = (tone) => ["success", "info", "warning", "danger"].includes(tone) ? tone : "info";

const processPresentation = (state) => {
  if (state.status === "submitting") {
    return {
      label: state.activeCount > 1 ? `Memproses ${state.activeCount} perubahan...` : "Memproses perubahan...",
      detail: "Data sedang dikirim dengan aman.",
      icon: FiLoader,
    };
  }
  if (state.status === "success") return { label: "Berhasil", detail: "Perubahan sudah tersimpan.", icon: FiCheckCircle };
  if (state.status === "unknown") return { label: "Status belum pasti", detail: "Jangan kirim ulang sebelum status diperiksa.", icon: FiAlertCircle };
  if (state.status === "error") return { label: "Proses gagal", detail: "Perubahan belum dapat disimpan.", icon: FiAlertCircle };
  return null;
};

const GlobalProcessIndicator = () => {
  const activity = useSyncExternalStore(subscribeToMutationActivity, getMutationActivitySnapshot, getMutationActivitySnapshot);
  const [visible, setVisible] = useState(activity);

  useEffect(() => {
    setVisible(activity);
    if (activity.status === "idle" || activity.status === "submitting") return undefined;
    const duration = activity.status === "success" ? PROCESS_SUCCESS_MS : PROCESS_ERROR_MS;
    const timer = setTimeout(() => setVisible((current) => current.revision === activity.revision ? { ...current, status: "idle" } : current), duration);
    return () => clearTimeout(timer);
  }, [activity]);

  const presentation = processPresentation(visible);
  if (!presentation) return null;
  const Icon = presentation.icon;
  return (
    <div className={`${styles.process} ${styles[`process_${visible.status}`] || ""}`} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.processIcon} aria-hidden="true"><Icon /></span>
      <span className={styles.processCopy}>
        <strong>{presentation.label}</strong>
        <small>{presentation.detail}</small>
      </span>
    </div>
  );
};

export const FeedbackProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(({ message, tone = "success", dedupeKey = null, durationMs = DEFAULT_DURATION_MS } = {}) => {
    const text = String(message || "").trim();
    if (!text) return null;
    const key = String(dedupeKey || text).slice(0, 180);
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setItems((current) => {
      const withoutDuplicate = current.filter((item) => item.dedupeKey !== key);
      return [...withoutDuplicate, { id, message: text.slice(0, 240), tone: safeTone(tone), dedupeKey: key }].slice(-MAX_VISIBLE);
    });
    if (Number(durationMs) > 0) {
      const timer = setTimeout(() => dismiss(id), Math.max(1_500, Math.min(Number(durationMs), 15_000)));
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <GlobalProcessIndicator />
      <div className={styles.region} aria-live="polite" aria-relevant="additions text">
        {items.map((item) => (
          <div className={`${styles.toast} ${styles[item.tone]}`} role="status" key={item.id}>
            <span className={styles.icon} aria-hidden="true">{item.tone === "success" ? <FiCheckCircle /> : item.tone === "danger" ? <FiAlertCircle /> : <FiInfo />}</span>
            <span className={styles.message}>{item.message}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(item.id)} aria-label="Tutup pemberitahuan"><FiX aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
};

export default FeedbackProvider;
