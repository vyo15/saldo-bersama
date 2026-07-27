const Brand = ({ compact = false }) => (
  <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} aria-label="Saldo Bersama">
    <span className="brand-mark" aria-hidden="true">SB</span>
    <span className="brand-wordmark">Saldo Bersama</span>
  </div>
);

export default Brand;
