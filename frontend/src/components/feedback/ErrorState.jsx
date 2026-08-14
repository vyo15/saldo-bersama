import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import Button from "../common/Button.jsx";

const HEADING_TAGS = Object.freeze({ 2: "h2", 3: "h3", 4: "h4" });

const ErrorState = ({ error, onRetry, variant = "panel", headingLevel = 2, className = "" }) => {
  const code = String(error?.code || "").trim();
  const requestId = String(error?.requestId || error?.details?.requestId || "").trim();
  const Heading = HEADING_TAGS[headingLevel] || "h2";
  const classes = ["error-state", `error-state--${variant}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <Heading>Data belum dapat dimuat</Heading>
      <p>{error?.message || "Terjadi kesalahan yang tidak diketahui."}</p>
      {code || requestId ? (
        <p className="error-state__diagnostic" aria-label="Informasi diagnostik">
          {code ? <span>Kode: <code>{code}</code></span> : null}
          {requestId ? <span>Referensi: <code>{requestId}</code></span> : null}
        </p>
      ) : null}
      {onRetry ? <Button icon={FiRefreshCw} onClick={onRetry}>Coba lagi</Button> : null}
    </div>
  );
};

export const RefreshWarning = ({ error, onRetry }) => {
  if (!error) return null;
  return (
    <div className="notice notice--warning refresh-notice" role="status" aria-live="polite">
      <span>Data lama tetap ditampilkan. Pembaruan terakhir belum berhasil.</span>
      {onRetry ? <Button icon={FiRefreshCw} onClick={onRetry}>Coba lagi</Button> : null}
    </div>
  );
};

export default ErrorState;
