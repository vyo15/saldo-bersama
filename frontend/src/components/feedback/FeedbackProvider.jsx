import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiInfo, FiX } from "react-icons/fi";
import styles from "./FeedbackProvider.module.css";
import { FeedbackContext } from "./feedbackContext.js";
const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 4_500;

const safeTone = (tone) => ["success", "info", "warning"].includes(tone) ? tone : "info";

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
      <div className={styles.region} aria-live="polite" aria-relevant="additions text">
        {items.map((item) => (
          <div className={`${styles.toast} ${styles[item.tone]}`} role="status" key={item.id}>
            <span className={styles.icon} aria-hidden="true">{item.tone === "success" ? <FiCheckCircle /> : <FiInfo />}</span>
            <span className={styles.message}>{item.message}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(item.id)} aria-label="Tutup pemberitahuan"><FiX aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
};


export default FeedbackProvider;
