import { FiWifiOff } from "react-icons/fi";

const OfflineBanner = () => (
  <div className="pwa-banner pwa-banner--offline" role="status" aria-live="polite">
    <FiWifiOff aria-hidden="true" />
    <span>Offline. Data yang sudah tampil tetap dapat dibaca, tetapi perubahan tidak akan disimpan.</span>
  </div>
);
export default OfflineBanner;
