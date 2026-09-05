import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import Money from "../common/Money.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import styles from "./FinancialSuccessOverlay.module.css";

const MONEY_TONES = Object.freeze(["red", "blue", "green", "purple", "gold", "mint"]);
const MONEY_DENOMINATIONS = Object.freeze(["100000", "50000", "20000", "10000", "5000", "50000"]);
const MONEY_COUNT = 10;

const moneyDepth = (index) => {
  if (index % 7 === 0 || index % 11 === 0) return "near";
  if (index % 3 === 0) return "far";
  return "mid";
};

const moneyNote = (index) => {
  const depth = moneyDepth(index);
  const scaleBase = depth === "near" ? 1.02 : depth === "far" ? 0.68 : 0.86;
  const alphaBase = depth === "near" ? 0.28 : depth === "far" ? 0.18 : 0.23;
  return Object.freeze({
    id: `financial-success-money-${index}`,
    tone: MONEY_TONES[index % MONEY_TONES.length],
    denomination: MONEY_DENOMINATIONS[index % MONEY_DENOMINATIONS.length],
    depth,
    left: `${((index * 29) % 116) - 8}%`,
    size: `${2.85 + ((index % 5) * 0.18)}rem`,
    scale: (scaleBase + ((index % 3) * 0.03)).toFixed(2),
    alpha: (alphaBase + ((index % 5) * 0.025)).toFixed(2),
    delay: `var(--motion-stagger-${index % 5})`,
    rotation: `${-12 + ((index * 7) % 25)}deg`,
    driftA: `${-34 + ((index * 17) % 68)}px`,
    driftB: `${-26 + ((index * 23) % 58)}px`,
  });
};

const SUCCESS_MONEY_NOTES = Object.freeze(Array.from({ length: MONEY_COUNT }, (_, index) => moneyNote(index)));

const moneyStyle = (note) => ({
  "--note-alpha": note.alpha,
  "--note-delay": note.delay,
  "--note-drift-a": note.driftA,
  "--note-drift-b": note.driftB,
  "--note-left": note.left,
  "--note-rotation": note.rotation,
  "--note-scale": note.scale,
  "--note-size": note.size,
});

const moneyClassName = (note) => [
  styles.moneyNote,
  styles[`money_${note.tone}`],
  note.depth === "far" ? styles.moneyFar : note.depth === "near" ? styles.moneyNear : "",
].filter(Boolean).join(" ");

const MoneyRainCelebration = () => (
  <div className={styles.moneyField} aria-hidden="true">
    {SUCCESS_MONEY_NOTES.map((note) => (
      <span className={moneyClassName(note)} key={note.id} style={moneyStyle(note)}>
        <strong>{note.denomination}</strong>
        <small>RUPIAH</small>
      </span>
    ))}
  </div>
);

const BrandSuccessMark = () => (
  <div className={styles.brandSuccess} aria-hidden="true">
    <div className={styles.brandLogoWrap}>
      <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" className={styles.brandLogo} draggable="false" decoding="async" />
      <span className={styles.brandCheckBadge}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
          <path className={styles.brandCheckPath} d="m6.75 12.4 3.3 3.35 7.2-7.45" />
        </svg>
      </span>
    </div>
  </div>
);

const SummaryRows = ({ rows }) => rows?.length ? (
  <dl className={styles.summary}>
    {rows.map((row, index) => (
      <div key={`${row.label}-${index}`}>
        <dt>{row.label}</dt>
        <dd className={row.tone === "positive" ? styles.summaryPositive : ""}>{row.value}</dd>
      </div>
    ))}
  </dl>
) : null;

const SecondaryActions = ({ actions }) => actions?.length ? (
  <div className={styles.secondaryActions}>
    {actions.map((action, index) => (
      <button key={`${action.label}-${index}`} type="button" className={styles.secondaryAction} onClick={action.onClick}>{action.label}</button>
    ))}
  </div>
) : null;

const FinancialSuccessOverlay = ({
  open = true,
  title,
  amount,
  description,
  summaryRows = [],
  onClose,
  doneLabel = "Selesai",
  secondaryActions = [],
  footerNote = "Riwayat sudah diperbarui.",
}) => {
  const containerRef = useRef(null);
  const doneRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap({ open, containerRef, initialFocusRef: doneRef, onEscape: onClose, bodyClassName: "modal-open" });
  if (!open) return null;

  return createPortal(
    <div className={styles.backdrop} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={containerRef} tabIndex={-1}>
        <MoneyRainCelebration />
        <div className={styles.content}>
          <BrandSuccessMark />
          <span className={styles.eyebrow}>Tersimpan dengan aman</span>
          <h2 id={titleId}>{title}</h2>
          <strong className={styles.amount}><Money value={amount} /></strong>
          <p id={descriptionId} className={styles.description}>{description}</p>
          <SummaryRows rows={summaryRows} />
          <div className={styles.footer}>
            <SecondaryActions actions={secondaryActions} />
            <button ref={doneRef} type="button" className={styles.done} onClick={onClose}>{doneLabel}</button>
            <small>{footerNote}</small>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default FinancialSuccessOverlay;
