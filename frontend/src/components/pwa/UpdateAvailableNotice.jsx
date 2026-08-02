import { FiRefreshCw } from "react-icons/fi";
import Button from "../common/Button.jsx";

const UpdateAvailableNotice = ({ onUpdate }) => (
  <div className="pwa-banner pwa-banner--update" role="status">
    <span>Versi aplikasi baru sudah siap.</span>
    <Button icon={FiRefreshCw} onClick={onUpdate}>Muat versi baru</Button>
  </div>
);
export default UpdateAvailableNotice;
