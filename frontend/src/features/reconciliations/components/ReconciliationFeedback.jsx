import { FiLoader } from "react-icons/fi";
import styles from "./ReconciliationFeedback.module.css";

const ProgressSteps = ({ phase }) => (
  <div className={styles.progressSteps} aria-hidden="true">
    <span className={phase === "syncing" ? styles.stepDone : styles.stepActive}><i />Simpan hasil</span>
    <span className={phase === "syncing" ? styles.stepActive : styles.stepQueued}><i />Perbarui ringkasan</span>
  </div>
);

export const ReconciliationSubmitProgress = ({ phase }) => {
  if (!phase || phase === "idle" || phase === "error") return null;
  const syncing = phase === "syncing";
  return (
    <div className={styles.progressCard} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.progressSpinner} aria-hidden="true"><FiLoader /></span>
      <span className={styles.progressCopy}>
        <strong>{syncing ? "Memperbarui tampilan" : "Menyimpan pemeriksaan saldo"}</strong>
        <small>{syncing ? "Memuat riwayat dan ringkasan terbaru." : "Menyimpan hasil perbandingan saldo."}</small>
        <ProgressSteps phase={phase} />
      </span>
    </div>
  );
};
