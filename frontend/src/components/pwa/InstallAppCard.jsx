import { FiDownload, FiShare } from "react-icons/fi";
import Button from "../common/Button.jsx";
import Card from "../common/Card.jsx";

const InstallAppCard = ({ installed, installable, isIos, onInstall }) => {
  if (installed || (!installable && !isIos)) return null;
  return (
    <Card className="install-app-card">
      <div>
        <p className="eyebrow">Aplikasi perangkat</p>
        <h2>Pasang Saldo Bersama</h2>
        <p>{isIos ? "Di Safari, tekan Share lalu pilih Add to Home Screen agar tampil fullscreen dan dapat menerima notifikasi." : "Pasang ke layar utama untuk akses lebih cepat dan tampilan seperti aplikasi."}</p>
      </div>
      {installable ? <Button variant="primary" icon={FiDownload} onClick={onInstall}>Pasang aplikasi</Button> : <span className="install-app-card__hint"><FiShare aria-hidden="true" /> Share → Add to Home Screen</span>}
    </Card>
  );
};
export default InstallAppCard;
