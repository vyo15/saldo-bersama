import { FiAlertTriangle, FiCheckCircle, FiWifiOff } from "react-icons/fi";

const offlineCopy = ({ degraded, recovering }) => {
  if (recovering) return { icon: FiCheckCircle, tone: "recovering", text: "Terhubung kembali. Menyegarkan data…" };
  if (degraded) return { icon: FiAlertTriangle, tone: "degraded", text: "Koneksi tidak stabil · data lama tetap ditampilkan; perubahan mungkin memerlukan retry." };
  return { icon: FiWifiOff, tone: "offline", text: "Offline · data yang tampil tetap dapat dibaca; perubahan dinonaktifkan." };
};

const OfflineBanner = ({ degraded = false, recovering = false }) => {
  const copy = offlineCopy({ degraded, recovering });
  const Icon = copy.icon;
  return (
    <div className={`pwa-banner pwa-banner--floating pwa-banner--${copy.tone}`} role="status" aria-live="polite">
      <Icon aria-hidden="true" />
      <span>{copy.text}</span>
    </div>
  );
};
export default OfflineBanner;
