import { useState } from "react";
import { FiChevronDown, FiCopy } from "react-icons/fi";
import StatusBadge from "./StatusBadge.jsx";
import styles from "./CompactTransactionDetail.module.css";

const CompactDetailRow = ({ label, children }) => (
  <div className={styles.row}><dt>{label}</dt><dd>{children}</dd></div>
);

/** Shared read-only transaction facts; workflows and authorization remain with each caller. */
const CompactTransactionDetail = ({ title, date, status, typeLabel, amount, category, account, allocation, allocationNote, extraFacts = [], technical = [], children, detailsFooter }) => {
  const [copiedValue, setCopiedValue] = useState("");
  const copyId = async (value) => {
    if (!navigator?.clipboard?.writeText) return;
    try { await navigator.clipboard.writeText(value); setCopiedValue(value); } catch { /* Clipboard permissions are browser-controlled. */ }
  };
  return <article className={styles.detail} data-ui="compact-transaction-detail">
    <header className={styles.identity}>
      <div className={styles.identityText}><strong>{title || "Transaksi"}</strong><span>{date}</span></div>
      <StatusBadge status={status} />
    </header>
    <section className={styles.summary} aria-label="Ringkasan transaksi">
      <span className={styles.type}>{typeLabel}</span>
      <div className={styles.amount}>{amount}</div>
    </section>
    <dl className={styles.facts}>
      <CompactDetailRow label="Kategori">{category || "—"}</CompactDetailRow>
      <CompactDetailRow label="Rekening">{account || "—"}</CompactDetailRow>
      <CompactDetailRow label="Alokasi">{allocation || "—"}{allocationNote ? <small>{allocationNote}</small> : null}</CompactDetailRow>
    </dl>
    {children}
    {extraFacts.length || technical.length || detailsFooter ? <details className={styles.more}>
      <summary>Informasi lainnya <FiChevronDown aria-hidden="true" /></summary>
      <dl className={styles.extra}>
        {extraFacts.map((fact) => <CompactDetailRow key={fact.label} label={fact.label}>{fact.value}</CompactDetailRow>)}
        {technical.map((fact) => <CompactDetailRow key={fact.label} label={fact.label}><span className={styles.technicalValue}>{fact.value}</span>{fact.copyable && fact.value ? <button className={styles.copy} type="button" aria-label={copiedValue === String(fact.value) ? `${fact.label} tersalin` : `Salin ${fact.label}`} onClick={() => copyId(String(fact.value))}><FiCopy aria-hidden="true" />{copiedValue === String(fact.value) ? <span className={styles.copied}>Tersalin</span> : null}</button> : null}</CompactDetailRow>)}
      </dl>
      {detailsFooter}
    </details> : null}
  </article>;
};

export default CompactTransactionDetail;
