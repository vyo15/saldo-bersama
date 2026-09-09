import { FiRefreshCw } from "react-icons/fi";
import Button from "../common/Button.jsx";

const UpdateAvailableNotice = ({ onUpdate, blocked = false }) => (
  <div className="pwa-banner pwa-banner--floating pwa-banner--update" role="status" aria-live="polite">
    <span>{blocked ? "Versi baru siap. Selesaikan perubahan yang sedang aktif terlebih dahulu." : "Versi baru siap digunakan."}</span>
    <Button icon={FiRefreshCw} onClick={onUpdate} disabled={blocked}>Mulai ulang</Button>
  </div>
);
export default UpdateAvailableNotice;
