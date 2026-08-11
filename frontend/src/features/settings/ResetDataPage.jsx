import { useState } from "react";
import { FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const RESET_INVALIDATIONS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "transactions.list",
  "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly",
  "reconciliations.list", "periods.list", "archive.list", "audit.list", "integrations.status",
]);

const SUMMARY_LABELS = Object.freeze([
  ["transactions", "Transaksi"],
  ["reconciliations", "Pencocokan saldo"],
  ["goals", "Target"],
  ["goalMovements", "Mutasi target"],
  ["budgets", "Anggaran"],
  ["allocationRules", "Aturan alokasi"],
  ["allocationPeriods", "Periode alokasi"],
  ["allocationMovements", "Mutasi alokasi"],
  ["recurringRules", "Jadwal rutin"],
  ["recurringOccurrences", "Kejadian rutin"],
  ["periodClosures", "Tutup buku"],
]);

const ResetPreview = ({ preview }) => (
  <div className={styles.resetPreview}>
    <div className={styles.resetPreviewGrid} aria-label="Data yang akan dihapus">
      {SUMMARY_LABELS.map(([key, label]) => (
        <div key={key}><span>{label}</span><strong>{Number(preview.summary?.[key] || 0).toLocaleString("id-ID")}</strong></div>
      ))}
    </div>
    <div className="notice notice--info">
      <FiShield aria-hidden="true" />
      <span>Rekening ({preview.preserved?.accounts || 0}) beserta saldo awalnya, kategori ({preview.preserved?.categories || 0}), pengguna, audit log, konfigurasi, dan backup tetap dipertahankan.</span>
    </div>
  </div>
);

const ResetConfirmationModal = ({ preview, open, busy, error, onCancel, onConfirm }) => (
  <ConfirmationModal
    open={open}
    title="Reset data percobaan?"
    description="Data aktivitas dan perencanaan pada preview akan dihapus permanen setelah safety backup. Rekening, kategori, pengguna, audit, konfigurasi, dan backup tetap disimpan."
    confirmLabel="Reset data percobaan"
    reasonLabel="Alasan reset"
    reasonPlaceholder="Contoh: Membersihkan data uji rekonsiliasi dan transaksi"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "RESET DATA PERCOBAAN"}
    acknowledgementLabel="Saya memahami data pada preview akan dihapus permanen dan hanya dapat dipulihkan melalui backup teknis."
    countdownSeconds={8}
    busy={busy}
    error={error}
    tone="danger"
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {preview ? <ResetPreview preview={preview} /> : null}
  </ConfirmationModal>
);

const ResetDataPage = () => {
  const { invalidate, refreshAll } = useFinance();
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [result, setResult] = useState(null);

  const loadPreview = async () => {
    setPreviewBusy(true);
    setResult({ status: "loading", text: "Memeriksa data percobaan yang dapat direset..." });
    try {
      const data = await runSettingsAction("reset.preview", {}, { force: true });
      setPreview(data);
      setResult({ status: "success", text: data.summary?.totalRows ? `Preview siap. ${data.summary.totalRows.toLocaleString("id-ID")} baris data akan dibersihkan.` : "Tidak ada data aktivitas/perencanaan yang perlu direset." });
    } catch (error) {
      setPreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setPreviewBusy(false);
    }
  };

  const applyReset = async (reason, confirmationState) => {
    if (!preview) return;
    setApplyBusy(true);
    setApplyError(null);
    try {
      const data = await runSettingsAction("reset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: confirmationState.confirmation,
        acknowledged: confirmationState.acknowledged,
        reason,
      }, {});
      setConfirmationOpen(false);
      setPreview(null);
      invalidate(RESET_INVALIDATIONS);
      await Promise.allSettled([refreshAll()]);
      setResult({
        status: "success",
        text: "Data percobaan berhasil direset setelah safety backup dan integrity check. Rekening, kategori, pengguna, audit, dan konfigurasi tetap ada.",
        fileLink: data.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.safetyBackupFileId)}` : null,
      });
    } catch (error) {
      setApplyError(error);
      setResult({ status: "danger", text: error.message });
    } finally {
      setApplyBusy(false);
    }
  };

  const hasResettableData = Number(preview?.summary?.totalRows || 0) > 0;

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="reset-data-title">
        <div className={styles.pageHeading}>
          <h2 id="reset-data-title">Reset data percobaan</h2>
          <p>Hapus data uji tanpa menghapus data dasar aplikasi.</p>
        </div>

        <SettingsNotice result={result} />

        <Card className="panel">
          <div className="panel__header">
            <div>
              <h2>1. Preview reset</h2>
              <p>Periksa data yang akan dihapus.</p>
            </div>
            <FiRefreshCw aria-hidden="true" />
          </div>
          <Button variant="primary" icon={FiRefreshCw} loading={previewBusy} onClick={loadPreview}>Periksa data percobaan</Button>
          {preview ? <ResetPreview preview={preview} /> : null}
        </Card>

        <Card className="panel">
          <div className="panel__header">
            <div>
              <h2>2. Reset data</h2>
              <p>Safety backup dibuat sebelum data dihapus.</p>
            </div>
            <FiTrash2 aria-hidden="true" />
          </div>
          <div className="notice notice--warning">
            <span>Gunakan hanya untuk membersihkan data uji. Untuk transaksi nyata, gunakan batal/arsip/pemulihan sesuai workflow normal.</span>
          </div>
          <Button variant="danger" icon={FiTrash2} disabled={!hasResettableData || previewBusy} onClick={() => { setApplyError(null); setConfirmationOpen(true); }}>Reset data percobaan</Button>
        </Card>

        <ResetConfirmationModal
          preview={preview}
          open={confirmationOpen}
          busy={applyBusy}
          error={applyError}
          onCancel={() => { if (!applyBusy) { setConfirmationOpen(false); setApplyError(null); } }}
          onConfirm={applyReset}
        />
      </section>
    </OwnerSettingsGuard>
  );
};

export default ResetDataPage;
