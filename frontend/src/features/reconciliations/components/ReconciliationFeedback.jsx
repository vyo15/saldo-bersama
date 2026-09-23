import { FiAlertTriangle, FiLoader } from "react-icons/fi";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
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
  if (!result) return null;

  const description = `Ada selisih Rp ${Math.abs(result.difference).toLocaleString("id-ID")}. Kemungkinan ada aktivitas yang belum tercatat atau nominal yang perlu diperiksa.`;
  const refreshNote = result.refreshIncomplete
    ? "Pemeriksaan sudah tersimpan, tetapi sebagian ringkasan belum berhasil dimuat ulang. Muat ulang halaman bila angka belum berubah."
    : "Riwayat pemeriksaan sudah diperbarui.";

  return (
    <Modal
      open
      onClose={onClose}
      title="Ada selisih saldo"
      description={description}
      size="sm"
      className={styles.resultModal}
      mobileSwipeToClose
      closeLabel="Tutup hasil pemeriksaan"
    >
      <div className={styles.resultContent}>
        <div className={styles.resultLead}>
          <div className={styles.resultIcon} aria-hidden="true"><FiAlertTriangle /></div>
          <span className={styles.resultEyebrow}>Perlu diperiksa</span>
          <strong className={styles.resultAmount}><Money value={result.actualBalance} /></strong>
        </div>
        <ResultSummary result={result} />
        <div className={styles.resultFooter}>
          <button type="button" className={styles.resultDone} onClick={onRecordTransaction}>Catat transaksi yang tertinggal</button>
          <button type="button" className={styles.resultReview} onClick={onReviewTransactions}>Periksa aktivitas rekening</button>
          <button type="button" className={styles.resultLater} onClick={onClose}>Selesaikan nanti</button>
          <small>{refreshNote}</small>
        </div>
      </div>
    </Modal>
  );
};

export const ReconciliationResultOverlay = ({ result, onClose, onRecordTransaction, onReviewTransactions }) => {
  if (!result || result.matched) return null;
  return <ReconciliationDifferenceOverlay result={result} onClose={onClose} onRecordTransaction={onRecordTransaction} onReviewTransactions={onReviewTransactions} />;
};
