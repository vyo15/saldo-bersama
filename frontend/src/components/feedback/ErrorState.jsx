import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import Button from "../common/Button.jsx";

const ErrorState = ({ error, onRetry }) => (
  <div className="error-state" role="alert">
    <FiAlertTriangle aria-hidden="true" />
    <h2>Data belum dapat dimuat</h2>
    <p>{error?.message || "Terjadi kesalahan yang tidak diketahui."}</p>
    {onRetry ? <Button icon={FiRefreshCw} onClick={onRetry}>Coba lagi</Button> : null}
  </div>
);

export default ErrorState;
