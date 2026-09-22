import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiLoader, FiX } from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import { useFocusTrap } from "../../../hooks/useFocusTrap.js";
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

const ResultSummary = ({ result }) => (
  <dl className={styles.resultSummary}>
    <div><dt>Rekening</dt><dd>{result.accountLabel}</dd></div>
    <div><dt>Saldo tercatat</dt><dd><Money value={result.systemBalance} /></dd></div>
    <div><dt>Saldo aktual</dt><dd><Money value={result.actualBalance} /></dd></div>
    <div><dt>Selisih</dt><dd className={result.matched ? styles.resultMatched : styles.resultDifference}><Money value={result.difference} /></dd></div>
  </dl>
);

const ReconciliationDifferenceOverlay = ({ result, onClose, onRecordTransaction, onReviewTransactions }) => {
  const containerRef = useRef(null);
  const doneRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = Boolean(result);
  useFocusTrap({ open, containerRef, initialFocusRef: doneRef, onEscape: onClose, bodyClassName: "modal-open" });
  if (!result) return null;

  const description = `Ada selisih Rp ${Math.abs(result.difference).toLocaleString("id-ID")}. Kemungkinan ada aktivitas yang belum tercatat atau nominal yang perlu diperiksa.`;
  const refreshNote = result.refreshIncomplete
    ? "Pemeriksaan sudah tersimpan, tetapi sebagian ringkasan belum berhasil dimuat ulang. Muat ulang halaman bila angka belum berubah."
    : "Riwayat pemeriksaan sudah diperbarui.";

  return createPortal(
    <div className={`${styles.resultBackdrop} ${styles.resultBackdropDifference}`} role="presentation">
      <section className={styles.resultDialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={containerRef} tabIndex={-1}>
        <button type="button" className={styles.resultClose} onClick={onClose} aria-label="Tutup hasil pemeriksaan"><FiX aria-hidden="true" /></button>
        <div className={styles.resultContent}>
          <div className={`${styles.resultIcon} ${styles.resultIconDifference}`} aria-hidden="true"><FiAlertTriangle /></div>
          <span className={styles.resultEyebrow}>Perlu diperiksa</span>
          <h2 id={titleId}>Ada selisih saldo</h2>
          <strong className={styles.resultAmount}><Money value={result.actualBalance} /></strong>
          <p id={descriptionId} className={styles.resultDescription}>{description}</p>
          <ResultSummary result={result} />
          <div className={styles.resultFooter}>
            <button ref={doneRef} type="button" className={styles.resultDone} onClick={onRecordTransaction}>Catat transaksi yang tertinggal</button>
            <button type="button" className={styles.resultReview} onClick={onReviewTransactions}>Periksa aktivitas rekening</button>
            <button type="button" className={styles.resultLater} onClick={onClose}>Selesaikan nanti</button>
            <small>{refreshNote}</small>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export const ReconciliationResultOverlay = ({ result, onClose, onRecordTransaction, onReviewTransactions }) => {
  if (!result || result.matched) return null;
  return <ReconciliationDifferenceOverlay result={result} onClose={onClose} onRecordTransaction={onRecordTransaction} onReviewTransactions={onReviewTransactions} />;
};
