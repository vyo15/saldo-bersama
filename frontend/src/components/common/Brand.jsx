const Brand = ({ compact = false }) => (
  <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}`} aria-label="Saldo Bersama">
    <img className="brand-mark" src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" decoding="async" />
    <span className="brand-copy">
      <strong className="brand-wordmark"><span>Saldo</span> <span>Bersama</span></strong>
      <small>Keuangan pribadi dan bersama</small>
    </span>
  </div>
);

export default Brand;
