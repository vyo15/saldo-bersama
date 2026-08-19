import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo, FiLoader, FiX } from "react-icons/fi";
import { getMutationActivitySnapshot, subscribeToMutationActivity } from "../../services/api/client.js";
import styles from "./FeedbackProvider.module.css";
import { FeedbackContext } from "./feedbackContext.js";

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 4_500;
const PROCESS_SUCCESS_MS = 1_600;
const PROCESS_ERROR_MS = 4_500;
const LOCAL_PROCESS_ACTIONS = new Set(["reconciliations.create"]);

const safeTone = (tone) => ["success", "info", "warning", "danger"].includes(tone) ? tone : "info";

const ACTION_MODULES = Object.freeze({
  accounts: "Rekening",
  backup: "Backup",
  budgets: "Batas Pengeluaran",
  categories: "Kategori",
  envelopes: "Kantong Dana",
  goals: "Target",
  integrity: "Integritas",
  notifications: "Notifikasi",
  periods: "Periode",
  reconciliations: "Cocokkan saldo",
  reset: "Reset data testing",
  fullReset: "Reset semua data",
  restore: "Pemulihan data",
  recurring: "Jadwal rutin",
  transactions: "Transaksi",
  users: "Member",
});

const ACTION_UNKNOWN_DETAILS = Object.freeze({
  "reset.apply": "Jangan kirim ulang. Buka Reset data testing lalu gunakan Periksa status operasi untuk memastikan hasilnya.",
  "fullReset.apply": "Jangan kirim ulang. Buka Reset semua data lalu gunakan Periksa status operasi untuk memastikan hasilnya.",
});

const ACTION_LABELS = Object.freeze({
  "backup.create": ["Membuat safety backup...", "Safety backup berhasil dibuat"],
  "accounts.create": ["Membuat rekening...", "Rekening berhasil dibuat"],
  "accounts.update": ["Memperbarui rekening...", "Rekening berhasil diperbarui"],
  "accounts.archive": ["Mengarsipkan rekening...", "Rekening berhasil diarsipkan"],
  "accounts.deleteUnused": ["Menghapus rekening...", "Rekening berhasil dihapus"],
  "budgets.upsert": ["Menyimpan batas pengeluaran...", "Batas pengeluaran berhasil disimpan"],
  "budgets.archive": ["Mengarsipkan batas pengeluaran...", "Batas pengeluaran berhasil diarsipkan"],
  "budgets.deleteUnused": ["Menghapus batas pengeluaran...", "Batas pengeluaran berhasil dihapus"],
  "categories.create": ["Membuat kategori...", "Kategori berhasil dibuat"],
  "categories.update": ["Memperbarui kategori...", "Kategori berhasil diperbarui"],
  "categories.archive": ["Mengarsipkan kategori...", "Kategori berhasil diarsipkan"],
  "categories.deleteUnused": ["Menghapus kategori...", "Kategori berhasil dihapus"],
  "envelopes.create": ["Membuat Kantong Dana...", "Kantong Dana berhasil dibuat"],
  "envelopes.adjustAllocation": ["Memperbarui alokasi Kantong...", "Alokasi Kantong berhasil diperbarui"],
  "envelopes.move": ["Memindahkan dana antar Kantong...", "Dana antar Kantong berhasil dipindahkan"],
  "envelopes.close": ["Menutup Kantong...", "Kantong berhasil ditutup"],
  "envelopes.archiveRule": ["Mengarsipkan aturan alokasi...", "Aturan alokasi berhasil diarsipkan"],
  "envelopes.deleteUnusedRule": ["Menghapus aturan alokasi...", "Aturan alokasi berhasil dihapus"],
  "envelopes.reverseMovement": ["Membatalkan perpindahan alokasi...", "Perpindahan alokasi berhasil dibatalkan"],
  "goals.create": ["Membuat target...", "Target berhasil dibuat"],
  "goals.update": ["Memperbarui target...", "Target berhasil diperbarui"],
  "goals.move": ["Mencatat dana target...", "Dana target berhasil dicatat"],
  "goals.reverseMovement": ["Membatalkan pencatatan target...", "Pencatatan target berhasil dibatalkan"],
  "goals.archive": ["Mengarsipkan target...", "Target berhasil diarsipkan"],
  "goals.deleteUnused": ["Menghapus target...", "Target berhasil dihapus"],
  "notifications.preferences": ["Menyimpan pengaturan notifikasi...", "Pengaturan notifikasi tersimpan"],
  "notifications.unregister": ["Menonaktifkan notifikasi perangkat...", "Notifikasi perangkat berhasil dinonaktifkan"],
  "periods.reopen": ["Membuka kembali periode...", "Periode berhasil dibuka kembali"],
  "reconciliations.create": ["Mencocokkan saldo...", "Pencocokan saldo tersimpan"],
  "reset.apply": ["Membersihkan data testing...", "Data testing berhasil dibersihkan"],
  "fullReset.apply": ["Mereset seluruh data aplikasi...", "Reset semua data berhasil"],
  "restore.apply": ["Memulihkan backup...", "Backup berhasil dipulihkan"],
  "integrity.run": ["Memeriksa integritas...", "Integrity check selesai"],
  "recurring.createRule": ["Membuat jadwal rutin...", "Jadwal rutin berhasil dibuat"],
  "recurring.updateRule": ["Memperbarui jadwal rutin...", "Jadwal rutin berhasil diperbarui"],
  "recurring.payOccurrence": ["Mencatat aktual jadwal...", "Aktual jadwal berhasil dicatat"],
  "recurring.cancelOccurrence": ["Melewati periode jadwal...", "Periode jadwal berhasil dilewati"],
  "recurring.restoreOccurrence": ["Memulihkan periode jadwal...", "Periode jadwal berhasil dipulihkan"],
  "recurring.reversePayment": ["Membatalkan aktual jadwal...", "Aktual jadwal berhasil dibatalkan"],
  "recurring.archiveRule": ["Mengarsipkan jadwal rutin...", "Jadwal rutin berhasil diarsipkan"],
  "recurring.deleteUnusedRule": ["Menghapus jadwal rutin...", "Jadwal rutin berhasil dihapus"],
  "transactions.create": ["Menyimpan transaksi...", "Transaksi berhasil disimpan"],
  "transactions.update": ["Memperbarui transaksi...", "Transaksi berhasil diperbarui"],
  "transactions.cancel": ["Membatalkan transaksi...", "Transaksi berhasil dibatalkan"],
  "transactions.restore": ["Memulihkan transaksi...", "Transaksi berhasil dipulihkan"],
  "users.deactivate": ["Menonaktifkan member...", "Member berhasil dinonaktifkan"],
  "users.reactivate": ["Mengaktifkan member...", "Member berhasil diaktifkan"],
});

const actionModule = (action) => ACTION_MODULES[String(action || "").split(".")[0]] || "Saldo Bersama";

const processPresentation = (state) => {
  const module = actionModule(state.action);
  const labels = ACTION_LABELS[state.action] || null;
  if (state.status === "submitting") {
    return {
      module: state.activeCount > 1 ? "Saldo Bersama" : module,
      label: state.activeCount > 1 ? `Memproses ${state.activeCount} perubahan...` : labels?.[0] || `Menyimpan perubahan ${module.toLowerCase()}...`,
      detail: "Data sedang dikirim dan menunggu konfirmasi server.",
      icon: FiLoader,
    };
  }
  if (state.status === "success") return { module, label: labels?.[1] || `${module} berhasil diperbarui`, detail: "Server sudah mengonfirmasi perubahan.", icon: FiCheckCircle };
  if (state.status === "unknown") return { module, label: `${module} belum terkonfirmasi`, detail: ACTION_UNKNOWN_DETAILS[state.action] || "Coba lagi dengan data yang sama agar idempotency key yang sama dapat memverifikasi hasil. Jangan ubah data sampai server memberi hasil definitif.", icon: FiAlertCircle };
  if (state.status === "error") return { module, label: `${module} gagal diproses`, detail: "Perubahan belum tersimpan. Periksa pesan pada formulir lalu coba lagi.", icon: FiAlertCircle };
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
  if (!presentation || LOCAL_PROCESS_ACTIONS.has(visible.action)) return null;
  const Icon = presentation.icon;
  return (
    <div className={`${styles.process} ${styles[`process_${visible.status}`] || ""}`} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.processIcon} aria-hidden="true"><Icon /></span>
      <span className={styles.processCopy}>
        <span className={styles.processModule}>{presentation.module}</span>
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
