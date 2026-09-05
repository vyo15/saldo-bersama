import { formatRupiah } from "../../../domain/money.js";
import styles from "../TransactionForm.module.css";

const signedRupiah = (value) => {
  const amount = Number(value || 0);
  if (amount === 0) return formatRupiah(0);
  return `${amount > 0 ? "+" : "−"}${formatRupiah(Math.abs(amount))}`;
};

const ImpactValue = ({ label, value, delta }) => (
  <span className={styles.impactValue}>
    <span className={styles.impactValueCopy}>
      <small>{label}</small>
      <strong>{formatRupiah(value)}</strong>
    </span>
    <span className={`${styles.impactDelta} ${Number(delta || 0) < 0 ? styles.impactDeltaNegative : ""}`.trim()}>
      {signedRupiah(delta)}
    </span>
  </span>
);

const TransferImpact = ({ impact }) => {
  if (!impact.source || !impact.destination) return null;
  return (
    <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
      <span className={styles.impactEyebrow}>Setelah transfer</span>
      <div className={styles.impactTransferRoute}>
        <ImpactValue
          label={impact.source.name}
          value={impact.sourceAfter}
          delta={Number(impact.sourceAfter || 0) - Number(impact.source.balance || 0)}
        />
        <ImpactValue
          label={impact.destination.name}
          value={impact.destinationAfter}
          delta={Number(impact.destinationAfter || 0) - Number(impact.destination.balance || 0)}
        />
      </div>
      <small className={styles.impactFootnote}>Total aset tetap. Transfer memakai dana tersedia yang belum dialokasikan.</small>
    </div>
  );
};

const StandardImpact = ({ impact }) => {
  if (impact.envelope) {
    const envelopeBefore = Number(impact.envelope.remaining_amount || 0);
    const envelopeAfter = Number(impact.envelopeAfter || 0);
    return (
      <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
        <span className={styles.impactEyebrow}>Setelah transaksi</span>
        <ImpactValue label={`Sisa ${impact.envelope.name}`} value={envelopeAfter} delta={envelopeAfter - envelopeBefore} />
        {impact.source ? (
          <small className={styles.impactFootnote}>
            Saldo {impact.source.name} menjadi {formatRupiah(impact.sourceAfter)}.
          </small>
        ) : null}
      </div>
    );
  }

  if (impact.source) {
    const before = Number(impact.sourceAvailable || 0);
    const after = Number(impact.sourceAvailableAfter || 0);
    return (
      <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
        <span className={styles.impactEyebrow}>Setelah transaksi</span>
        <ImpactValue label={`Dana tersedia ${impact.source.name}`} value={after} delta={after - before} />
      </div>
    );
  }

  if (impact.destination) {
    const before = Number(impact.destination.balance || 0);
    const after = Number(impact.destinationAfter || 0);
    return (
      <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
        <span className={styles.impactEyebrow}>Setelah transaksi</span>
        <ImpactValue label={impact.destination.name} value={after} delta={after - before} />
      </div>
    );
  }

  return null;
};

const TransactionImpactPreview = ({ impact, isTransfer }) => {
  if (!impact || Number(impact.amount || 0) <= 0) return null;
  return isTransfer ? <TransferImpact impact={impact} /> : <StandardImpact impact={impact} />;
};

export default TransactionImpactPreview;
