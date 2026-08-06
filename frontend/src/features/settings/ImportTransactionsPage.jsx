import { useState } from "react";
import { FiUploadCloud } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { readTransactionImportFile } from "../../services/importer.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const ImportTransactionsPage = () => {
  const { refreshAll } = useFinance();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const previewImport = async () => {
    setBusy(true);
    setResult({ status: "loading", text: "Memvalidasi file import..." });
    try {
      const records = await readTransactionImportFile(file);
      const data = await runSettingsAction("import.preview", { records }, { idempotencyKey: createIdempotencyKey() });
      setPreview(data);
      setResult({ status: "warning", text: `Preview selesai. Valid ${data.validCount}, invalid ${data.invalid.length}, duplikat ${data.duplicates.length}.` });
    } catch (error) {
      setPreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const applyImport = async () => {
    if (!preview) return;
    setBusy(true);
    setResult({ status: "loading", text: "Menerapkan import secara atomik..." });
    try {
      await runSettingsAction("import.apply", { previewToken: preview.previewToken, confirmation }, { idempotencyKey: createIdempotencyKey() });
      setPreview(null);
      setConfirmation("");
      setFile(null);
      setResult({ status: "success", text: "Import transaksi berhasil diterapkan dan tercatat di audit." });
      await refreshAll();
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="import-settings-title">
        <div className={styles.pageHeading}>
          <p className="eyebrow">Import transaksi</p>
          <h2 id="import-settings-title">Preview sebelum apply</h2>
          <p>File JSON atau CSV maksimal 50 transaksi. Backend memvalidasi referensi, duplikat, nominal, tanggal, formula injection, dan dampak sebelum apply atomik.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">File transaksi</p><h2>Upload dan validasi</h2><p>Memilih file baru akan membatalkan preview sebelumnya.</p></div><FiUploadCloud aria-hidden="true" /></div>
          <div className="stack-form">
            <label className="field"><span>File JSON atau CSV *</span><input className={styles.fileInput} required type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setConfirmation(""); setResult(null); }} /></label>
            <Button onClick={previewImport} loading={busy && !preview} disabled={!file}>Preview import</Button>
            {preview ? (
              <div className="compact-list compact-list--stacked">
                <div><span><strong>Data valid</strong></span><strong>{preview.validCount}</strong></div>
                <div><span><strong>Data invalid</strong></span><strong>{preview.invalid.length}</strong></div>
                <div><span><strong>Duplikat</strong></span><strong>{preview.duplicates.length}</strong></div>
              </div>
            ) : null}
            {preview ? <label className="field"><span>Ketik IMPORT TRANSAKSI</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label> : null}
            {preview ? <Button variant="primary" onClick={applyImport} loading={busy} disabled={confirmation !== "IMPORT TRANSAKSI"}>Terapkan import</Button> : null}
          </div>
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default ImportTransactionsPage;
