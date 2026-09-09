import { FiCheckCircle, FiWifiOff } from "react-icons/fi";

const OfflineBanner = ({ recovering = false }) => (
  <div className={`pwa-banner pwa-banner--floating ${recovering ? "pwa-banner--recovering" : "pwa-banner--offline"}`} role="status" aria-live="polite">
    {recovering ? <FiCheckCircle aria-hidden="true" /> : <FiWifiOff aria-hidden="true" />}
    <span>{recovering ? "Terhubung kembali. Menyegarkan data…" : "Offline · data yang tampil tetap dapat dibaca; perubahan dinonaktifkan."}</span>
  </div>
);
export default OfflineBanner;
