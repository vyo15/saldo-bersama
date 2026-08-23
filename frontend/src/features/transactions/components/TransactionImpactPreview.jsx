import { formatRupiah } from "../../../domain/money.js";
import styles from "../TransactionForm.module.css";

const impactPrimaryLine = (impact, isTransfer) => {
  if (impact.envelope) return `Sisa ${impact.envelope.name}: ${formatRupiah(impact.envelope.remaining_amount)} → ${formatRupiah(impact.envelopeAfter)}`;
  if (isTransfer && impact.source) return `Dana tersedia ${impact.source.name}: ${formatRupiah(impact.sourceAvailable)} → ${formatRupiah(impact.sourceAvailableAfter)}`;
  if (impact.source) return `Dana tersedia ${impact.source.name}: ${formatRupiah(impact.sourceAvailable)} → ${formatRupiah(impact.sourceAvailableAfter)}`;
  if (impact.destination) return `Saldo ${impact.destination.name}: ${formatRupiah(impact.destination.balance)} → ${formatRupiah(impact.destinationAfter)}`;
  return "";
};

const TransactionImpactPreview = ({ impact, isTransfer }) => {
  if (!impact) return null;
  const primary = impactPrimaryLine(impact, isTransfer);
  if (!primary) return null;
  return <div className={`notice notice--info form-grid__full impact-preview ${styles.impactPreview}`} aria-live="polite">
    <strong>Dampak transaksi</strong>
    <span>{primary}</span>
    <details className={styles.impactDetails}>
      <summary>Lihat dampak lengkap</summary>
      <div>
        {impact.source ? <span>Saldo {impact.source.name}: {formatRupiah(impact.source.balance)} → {formatRupiah(impact.sourceAfter)}</span> : null}
        {impact.source ? <span>Dana tersedia {impact.source.name}: {formatRupiah(impact.sourceAvailable)} → {formatRupiah(impact.sourceAvailableAfter)}</span> : null}
        {impact.destination ? <span>Saldo {impact.destination.name}: {formatRupiah(impact.destination.balance)} → {formatRupiah(impact.destinationAfter)}</span> : null}
        {impact.destination ? <span>Dana tersedia {impact.destination.name}: {formatRupiah(impact.destinationAvailable)} → {formatRupiah(impact.destinationAvailableAfter)}</span> : null}
        {impact.envelope ? <span>Sisa {impact.envelope.name}: {formatRupiah(impact.envelope.remaining_amount)} → {formatRupiah(impact.envelopeAfter)}</span> : null}
        {isTransfer ? <span>Transfer memakai dana yang belum dialokasikan dari rekening sumber.</span> : null}
      </div>
    </details>
  </div>;
};


export default TransactionImpactPreview;
