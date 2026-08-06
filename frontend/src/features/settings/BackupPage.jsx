import { useState } from "react";
import { FiDownloadCloud } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
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
      const data = await runSettingsAction("backup.create", { type: "manual" }, { idempotencyKey: createIdempotencyKey() });
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
          <p className="eyebrow">Backup teknis</p>
          <h2 id="backup-settings-title">Snapshot terverifikasi ke Google Drive</h2>
          <p>Backup menyimpan ID, audit, row version, checksum, relasi, dan schema untuk workflow pemulihan. Nama file unik dan tidak menimpa backup sebelumnya.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Proteksi data</p><h2>Buat backup manual</h2><p>Gunakan sebelum migration, import besar, atau restore.</p></div><FiDownloadCloud aria-hidden="true" /></div>
          <Button variant="primary" icon={FiDownloadCloud} loading={busy} onClick={createBackup}>Buat backup terverifikasi</Button>
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default BackupPage;
