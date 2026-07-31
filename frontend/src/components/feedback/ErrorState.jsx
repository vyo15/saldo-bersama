import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import Button from "../common/Button.jsx";

const ErrorState = ({ error, onRetry }) => {
  const code = String(error?.code || "").trim();
  const requestId = String(error?.requestId || error?.details?.requestId || "").trim();
  return (
    <div className="error-state" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <h2>Data belum dapat dimuat</h2>
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
