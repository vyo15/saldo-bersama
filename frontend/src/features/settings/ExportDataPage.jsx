import { useState } from "react";
import { FiDownload } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { downloadFinanceExcel } from "./settings.api.js";
import styles from "./Settings.module.css";

const ExportDataPage = () => {
  const { notify } = useFeedback();
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);

  const downloadExcel = async () => {
    setExporting(true);
    setResult({ status: "loading", text: "Menyiapkan Excel..." });
    try {
      const data = await downloadFinanceExcel();
      setResult(null);
      notify({ message: `${data.fileName} berhasil diunduh.`, tone: "success", dedupeKey: "settings:export" });
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="export-settings-title">
        <div className={styles.pageHeading}>
          <h2 id="export-settings-title">Export data</h2>
          <p>Excel untuk salinan dan analisis, bukan untuk restore.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><h2>Excel lengkap</h2><FiDownload aria-hidden="true" /></div>
          <Button variant="primary" icon={FiDownload} loading={exporting} onClick={downloadExcel}>Unduh Excel lengkap</Button>
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default ExportDataPage;
