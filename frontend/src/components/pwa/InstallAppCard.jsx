import { FiDownload, FiShare } from "react-icons/fi";
import Button from "../common/Button.jsx";
import Card from "../common/Card.jsx";

const InstallAppCard = ({ installed, installable, isIos, showPrompt, onInstall, onDismiss }) => {
  if (installed || !showPrompt || (!installable && !isIos)) return null;
  return (
    <Card className="install-app-card">
      <div>
        <p className="eyebrow">Aplikasi perangkat</p>
        <h2>Pasang Saldo Bersama</h2>
        <p>{isIos ? "Buka dari Home Screen untuk pengalaman layar penuh dan notifikasi." : "Pasang ke layar utama untuk akses lebih cepat dan tampilan seperti aplikasi."}</p>
      </div>
      <div className="install-app-card__actions">
        {installable
          ? <Button variant="primary" icon={FiDownload} onClick={onInstall}>Pasang aplikasi</Button>
          : <span className="install-app-card__hint"><FiShare aria-hidden="true" /> Share → Add to Home Screen</span>}
        <button className="install-app-card__dismiss" type="button" onClick={onDismiss}>Nanti</button>
      </div>
    </Card>
  );
};
export default InstallAppCard;
