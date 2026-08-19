import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiCheck, FiLoader, FiX } from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import { useFocusTrap } from "../../../hooks/useFocusTrap.js";
import styles from "./ReconciliationFeedback.module.css";

const MONEY_TONES = Object.freeze(["red", "blue", "green", "purple", "gold", "mint"]);
const MONEY_DENOMINATIONS = Object.freeze(["100000", "50000", "20000", "10000", "5000", "50000"]);
const MONEY_COUNT = 30;

const moneyDepth = (index) => {
  if (index % 7 === 0 || index % 11 === 0) return "near";
  if (index % 3 === 0) return "far";
  return "mid";
};

const moneyNote = (index) => {
  const depth = moneyDepth(index);
  const wave = Math.floor(index / 6);
  const slot = index % 6;
  const scaleBase = depth === "near" ? 1.03 : depth === "far" ? 0.62 : 0.86;
  const alphaBase = depth === "near" ? 0.28 : depth === "far" ? 0.18 : 0.34;
  const tilt = 6 + ((index * 7) % 8);
  return Object.freeze({
    id: `money-${index}`,
    tone: MONEY_TONES[index % MONEY_TONES.length],
    denomination: MONEY_DENOMINATIONS[index % MONEY_DENOMINATIONS.length],
    depth,
    left: `${((index * 37) % 112) - 7}%`,
    top: `${-(16 + ((index * 13) % 38))}vh`,
    size: `${(depth === "near" ? 5.2 : depth === "far" ? 3.0 : 4.15) + ((index % 4) * 0.13)}rem`,
    scale: (scaleBase + ((index % 3) * 0.03)).toFixed(2),
    alpha: (alphaBase + ((index % 4) * 0.015)).toFixed(2),
    duration: `${(depth === "near" ? 5.25 : depth === "far" ? 7.0 : 6.0) + ((index % 5) * 0.13)}s`,
    delay: `${(wave * 0.43) + (slot * 0.13) + ((index % 2) * 0.04)}s`,
    rotation: `${-8 + ((index * 5) % 16)}deg`,
    driftA: `${-14 + ((index * 11) % 28)}px`,
    driftB: `${-10 + ((index * 17) % 22)}px`,
    tilt: `${tilt}deg`,
    tiltNegative: `${-tilt}deg`,
  });
};

const SUCCESS_MONEY_NOTES = Object.freeze(Array.from({ length: MONEY_COUNT }, (_, index) => moneyNote(index)));

const moneyStyle = (note) => ({
  "--note-alpha": note.alpha,
  "--note-delay": note.delay,
  "--note-drift-a": note.driftA,
  "--note-drift-b": note.driftB,
  "--note-duration": note.duration,
  "--note-left": note.left,
  "--note-rotation": note.rotation,
  "--note-scale": note.scale,
  "--note-size": note.size,
  "--note-tilt": note.tilt,
  "--note-tilt-negative": note.tiltNegative,
  "--note-top": note.top,
});

const moneyClassName = (note) => [
  styles.moneyNote,
  styles[`money_${note.tone}`],
  note.depth === "far" ? styles.money_far : note.depth === "near" ? styles.money_near : "",
].filter(Boolean).join(" ");

const MoneyRainCelebration = () => (
  <div className={styles.moneyField} aria-hidden="true">
    {SUCCESS_MONEY_NOTES.map((note) => (
      <span className={moneyClassName(note)} key={note.id} style={moneyStyle(note)}>
        <strong>{note.denomination}</strong>
        <small>RUPIAH</small>
      </span>
    ))}
    {Array.from({ length: 6 }, (_, index) => <span className={`${styles.spark} ${styles[`spark${index + 1}`]}`} key={`spark-${index}`} />)}
  </div>
);

const ProgressSteps = ({ phase }) => (
  <div className={styles.progressSteps} aria-hidden="true">
    <span className={phase === "syncing" ? styles.stepDone : styles.stepActive}><i />Simpan ke server</span>
    <span className={phase === "syncing" ? styles.stepActive : styles.stepQueued}><i />Perbarui tampilan</span>
  </div>
);

export const ReconciliationSubmitProgress = ({ phase }) => {
  if (!phase || phase === "idle" || phase === "error") return null;
  const syncing = phase === "syncing";
  return (
    <div className={styles.progressCard} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.progressSpinner} aria-hidden="true"><FiLoader /></span>
      <span className={styles.progressCopy}>
        <strong>{syncing ? "Memperbarui tampilan" : "Menyimpan pencocokan saldo"}</strong>
        <small>{syncing ? "Server sudah mengonfirmasi hasil. Memuat riwayat dan ringkasan terbaru." : "Mengirim saldo aktual dan menunggu konfirmasi server."}</small>
        <ProgressSteps phase={phase} />
      </span>
    </div>
  );
};

const ResultSummary = ({ result }) => (
  <dl className={styles.resultSummary}>
    <div><dt>Rekening</dt><dd>{result.accountLabel}</dd></div>
    <div><dt>Saldo sistem</dt><dd><Money value={result.systemBalance} /></dd></div>
    <div><dt>Saldo aktual</dt><dd><Money value={result.actualBalance} /></dd></div>
    <div><dt>Selisih</dt><dd className={result.matched ? styles.resultMatched : styles.resultDifference}><Money value={result.difference} /></dd></div>
  </dl>
);

export const ReconciliationResultOverlay = ({ result, onClose }) => {
  const containerRef = useRef(null);
  const doneRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = Boolean(result);
  useFocusTrap({ open, containerRef, initialFocusRef: doneRef, onEscape: onClose, bodyClassName: "modal-open" });
  if (!result) return null;

  const title = result.matched ? "Pencocokan berhasil" : "Pencocokan tersimpan";
  const description = result.matched
    ? "Saldo aktual sudah sesuai dengan saldo sistem. Tidak ada penyesuaian saldo yang dibuat."
    : `Ada selisih Rp ${Math.abs(result.difference).toLocaleString("id-ID")}. Periksa transaksi tertinggal sebelum membuat penyesuaian.`;
  const refreshNote = result.refreshIncomplete
    ? "Pencocokan sudah tersimpan di server, tetapi sebagian ringkasan belum berhasil dimuat ulang. Muat ulang halaman bila angka belum berubah."
    : "Riwayat pencocokan sudah diperbarui.";

  return createPortal(
    <div className={`${styles.resultBackdrop}${result.matched ? "" : ` ${styles.resultBackdropDifference}`}`} role="presentation">
      <section className={styles.resultDialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={containerRef} tabIndex={-1}>
        {result.matched ? <MoneyRainCelebration /> : null}
        <button type="button" className={styles.resultClose} onClick={onClose} aria-label="Tutup hasil pencocokan"><FiX aria-hidden="true" /></button>
        <div className={styles.resultContent}>
          <div className={`${styles.resultIcon} ${result.matched ? styles.resultIconMatched : styles.resultIconDifference}`} aria-hidden="true">{result.matched ? <FiCheck /> : <FiAlertTriangle />}</div>
          <span className={styles.resultEyebrow}>{result.matched ? "Tersimpan dengan aman" : "Perlu diperiksa"}</span>
          <h2 id={titleId}>{title}</h2>
          <strong className={styles.resultAmount}><Money value={result.actualBalance} /></strong>
          <p id={descriptionId} className={styles.resultDescription}>{description}</p>
          <ResultSummary result={result} />
          <div className={styles.resultFooter}>
            <button ref={doneRef} type="button" className={styles.resultDone} onClick={onClose}>Selesai</button>
            <small>{refreshNote}</small>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};
