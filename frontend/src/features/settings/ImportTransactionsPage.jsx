import { useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiUploadCloud } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { formatRupiah } from "../../domain/money.js";
import { readTransactionImportFile } from "../../services/importer.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const IMPORT_REFRESH_KEYS = Object.freeze(["transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);

const ImportIssueList = ({ title, issues = [] }) => {
  if (!issues.length) return null;
  return (
    <div className="notice notice--danger" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <ul className={styles.importIssueList}>
          {issues.slice(0, 12).map((issue) => <li key={`${issue.index}-${issue.code || issue.message}`}>Baris {Number(issue.index) + 1}: {issue.message || issue.code || "Data tidak valid"}</li>)}
        </ul>
        {issues.length > 12 ? <small>+{issues.length - 12} masalah lain. Perbaiki file lalu preview kembali.</small> : null}
      </span>
    </div>
  );
};

const ImportImpact = ({ impact = {} }) => (
  <div className="compact-list compact-list--stacked" aria-label="Dampak kumulatif import">
    <div><span><strong>Total pemasukan</strong><small>Sudah diperiksa bersama seluruh baris import</small></span><strong>{formatRupiah(impact.income)}</strong></div>
    <div><span><strong>Total pengeluaran</strong><small>Saldo dan kantong disimulasikan secara kumulatif</small></span><strong>{formatRupiah(impact.expense)}</strong></div>
    <div><span><strong>Total refund</strong><small>Refund tetap divalidasi terhadap rekening tujuan dan kategori</small></span><strong>{formatRupiah(impact.refund)}</strong></div>
    <div><span><strong>Total transfer</strong><small>Transfer tidak dihitung sebagai pemasukan/pengeluaran</small></span><strong>{formatRupiah(impact.transfer)}</strong></div>
    <div><span><strong>Penyesuaian saldo</strong><small>Hanya Administrator dan tetap masuk integrity check</small></span><strong>{formatRupiah(impact.adjustment)}</strong></div>
  </div>
);

const ImportPreview = ({ preview }) => (
  <div className={styles.importPreview}>
    <div className="compact-list compact-list--stacked">
      <div><span><strong>Data valid</strong></span><strong>{preview.validCount}</strong></div>
      <div><span><strong>Data invalid</strong></span><strong>{preview.invalid.length}</strong></div>
      <div><span><strong>Duplikat</strong></span><strong>{preview.duplicates.length}</strong></div>
    </div>
    <ImportIssueList title="Data invalid" issues={preview.invalid} />
    <ImportIssueList title="Duplikat terdeteksi" issues={preview.duplicates} />
    {preview.acceptable ? (
      <div className="notice notice--success" role="status"><FiCheckCircle aria-hidden="true" /><span>Seluruh baris lolos simulasi kumulatif. Apply tetap akan memvalidasi ulang di transaction sebelum commit.</span></div>
    ) : (
      <div className="notice notice--warning" role="status"><FiAlertTriangle aria-hidden="true" /><span>Import diblokir. Seluruh baris harus valid dan bebas duplikat. Tidak ada partial import.</span></div>
    )}
    {preview.impact ? <ImportImpact impact={preview.impact} /> : null}
  </div>
);

const ImportTransactionsPage = () => {
  const { invalidate, refreshAll } = useFinance();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const previewImport = async () => {
    setBusy(true);
    setResult({ status: "loading", text: "Memvalidasi seluruh file dan mensimulasikan dampak kumulatif..." });
    try {
      const records = await readTransactionImportFile(file);
      const data = await runSettingsAction("import.preview", { records }, {});
      setPreview(data);
      setResult({
        status: data.acceptable ? "success" : "warning",
        text: data.acceptable
          ? `Preview aman. ${data.validCount} transaksi lolos validasi kumulatif.`
          : `Preview diblokir. Valid ${data.validCount}, invalid ${data.invalid.length}, duplikat ${data.duplicates.length}. Perbaiki file sebelum apply.`,
      });
    } catch (error) {
      setPreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const applyImport = async () => {
    if (!preview?.acceptable) return;
    setBusy(true);
    setResult({ status: "loading", text: "Membuat safety backup, memvalidasi ulang, dan menerapkan import atomik..." });
    try {
      const data = await runSettingsAction("import.apply", { previewToken: preview.previewToken, confirmation }, {});
      setPreview(null);
      setConfirmation("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setResult({ status: "success", text: `${data.applied} transaksi berhasil diterapkan setelah safety backup dan integrity check.` });
      invalidate(IMPORT_REFRESH_KEYS);
      await Promise.allSettled([refreshAll()]);
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
          <h2 id="import-settings-title">Import transaksi</h2>
          <p>JSON atau CSV, maksimal 50 transaksi. File harus lolos seluruh preview. Aplikasi tidak melakukan partial import.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><h2>Pilih file</h2><FiUploadCloud aria-hidden="true" /></div>
          <div className="stack-form">
            <label className="field"><span>File JSON atau CSV *</span><input ref={fileInputRef} className={styles.fileInput} required type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setConfirmation(""); setResult(null); }} /></label>
            <Button onClick={previewImport} loading={busy && !preview} disabled={!file}>Preview import</Button>
            {preview ? <ImportPreview preview={preview} /> : null}
            {preview?.acceptable ? <label className="field"><span>Ketik IMPORT TRANSAKSI</span><input autoComplete="off" spellCheck="false" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><small>Ketik persis: <strong>IMPORT TRANSAKSI</strong></small></label> : null}
            {preview?.acceptable ? <Button variant="primary" onClick={applyImport} loading={busy} disabled={confirmation !== "IMPORT TRANSAKSI"}>Terapkan import</Button> : null}
          </div>
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default ImportTransactionsPage;
