import { useState } from "react";
import { FiDownloadCloud } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const BackupPage = () => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const createBackup = async () => {
    setBusy(true);
    setResult({ status: "loading", text: "Membuat dan memverifikasi backup teknis..." });
    try {
      const data = await runSettingsAction("backup.create", { type: "manual" }, {});
      setResult({ status: "success", text: `Backup teknis terverifikasi: ${data.fileName}`, fileLink: data.fileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.fileId)}` : null });
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="backup-settings-title">
        <div className={styles.pageHeading}>
          <h2 id="backup-settings-title">Backup data</h2>
          <p>Simpan salinan terverifikasi ke Google Drive untuk pemulihan.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><h2>Backup manual</h2><FiDownloadCloud aria-hidden="true" /></div>
          <Button variant="primary" icon={FiDownloadCloud} loading={busy} onClick={createBackup}>Buat backup terverifikasi</Button>
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default BackupPage;
