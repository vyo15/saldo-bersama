import { useState } from "react";
import { FiCheckCircle, FiDatabase, FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
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

const BUSINESS_SUMMARY_LABELS = Object.freeze([
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

const OPERATIONAL_SUMMARY_LABELS = Object.freeze([
  ["notificationDeliveries", "Delivery notifikasi"],
  ["notificationQueue", "Queue notifikasi"],
  ["integrationLinks", "Link integrasi"],
  ["integrationOutbox", "Queue sinkronisasi"],
  ["importPreviews", "Preview import"],
]);

const PRESERVED_LABELS = Object.freeze([
  ["accounts", "Rekening"],
  ["categories", "Kategori"],
  ["users", "Pengguna"],
  ["audit", "Audit log"],
  ["backups", "Riwayat backup"],
  ["pushSubscriptions", "Perangkat notifikasi"],
  ["notificationPreferences", "Preferensi notifikasi"],
]);

const formatCount = (value) => Number(value || 0).toLocaleString("id-ID");

const SummaryGrid = ({ labels, summary, ariaLabel }) => (
  <div className={styles.resetPreviewGrid} aria-label={ariaLabel}>
    {labels.map(([key, label]) => (
      <div key={key}><span>{label}</span><strong>{formatCount(summary?.[key])}</strong></div>
    ))}
  </div>
);

const ResetPreview = ({ preview }) => (
  <div className={styles.resetPreview}>
    <div className={styles.resetOverview} aria-label="Ringkasan data testing">
      <div>
        <span>Total dibersihkan</span>
        <strong>{formatCount(preview.summary?.totalRows)}</strong>
        <small>baris</small>
      </div>
      <div>
        <span>Data finansial</span>
        <strong>{formatCount(preview.summary?.businessRows)}</strong>
        <small>baris</small>
      </div>
      <div>
        <span>Data operasional</span>
        <strong>{formatCount(preview.summary?.operationalRows)}</strong>
        <small>baris</small>
      </div>
    </div>

    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiDatabase aria-hidden="true" />
        <div><strong>Aktivitas dan perencanaan</strong><small>Data trial yang memengaruhi tampilan finansial.</small></div>
      </div>
      <SummaryGrid labels={BUSINESS_SUMMARY_LABELS} summary={preview.summary} ariaLabel="Aktivitas dan perencanaan yang akan dibersihkan" />
    </div>

    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiRefreshCw aria-hidden="true" />
        <div><strong>Sisa proses testing</strong><small>Queue, projection, dan preview sementara ikut dibersihkan dalam eksekusi yang sama.</small></div>
      </div>
      <SummaryGrid labels={OPERATIONAL_SUMMARY_LABELS} summary={preview.summary} ariaLabel="Data operasional yang akan dibersihkan" />
    </div>

    <div className={styles.resetPreserved}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiShield aria-hidden="true" />
        <div><strong>Tetap disimpan</strong><small>Master, keamanan, audit, dan recovery tidak dihapus.</small></div>
      </div>
      <div className={styles.resetPreservedGrid}>
        {PRESERVED_LABELS.map(([key, label]) => (
          <div key={key}><FiCheckCircle aria-hidden="true" /><span>{label}</span><strong>{formatCount(preview.preserved?.[key])}</strong></div>
        ))}
        <div><FiCheckCircle aria-hidden="true" /><span>Konfigurasi sistem</span><strong>Tetap</strong></div>
      </div>
    </div>
  </div>
);

const ResetConfirmationModal = ({ preview, open, busy, error, onCancel, onConfirm }) => (
  <ConfirmationModal
    open={open}
    title="Bersihkan data testing?"
    description="Seluruh data pada preview akan dihapus permanen setelah safety backup. Karena project memakai satu database, gunakan hanya selama data yang tersimpan masih benar-benar data trial/error."
    confirmLabel="Bersihkan data testing"
    reasonLabel="Alasan pembersihan"
    reasonPlaceholder="Contoh: Membersihkan transaksi dan rekonsiliasi hasil trial"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "BERSIHKAN DATA TESTING"}
    acknowledgementLabel="Saya memahami project memakai satu database dan seluruh data pada preview akan dihapus permanen. Rekening, kategori, pengguna, audit, konfigurasi, dan backup tetap disimpan."
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
    setResult({ status: "loading", text: "Memeriksa seluruh data testing yang dapat dibersihkan..." });
    try {
      const data = await runSettingsAction("reset.preview", {}, { force: true });
      setPreview(data);
      setResult({
        status: "success",
        text: data.summary?.totalRows
          ? `Preview siap. ${formatCount(data.summary.totalRows)} baris data testing akan dibersihkan dalam satu eksekusi.`
          : "Tidak ada data aktivitas atau sisa proses testing yang perlu dibersihkan.",
      });
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
        text: `Pembersihan selesai. ${formatCount(data.summary?.totalRows)} baris data testing dihapus setelah safety backup dan integrity check. Data dasar aplikasi tetap dipertahankan.`,
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
          <h2 id="reset-data-title">Bersihkan data testing</h2>
          <p>Kosongkan data trial/error dalam satu proses tanpa menghapus master, akses pengguna, audit, atau recovery.</p>
        </div>

        <SettingsNotice result={result} />

        <div className="notice notice--warning" role="note">
          <FiShield aria-hidden="true" />
          <span><strong>Satu database aktif.</strong> Fitur ini aman untuk fase sebelum go-live karena seluruh data finansial yang ada masih dianggap data testing. Setelah Anda mulai memasukkan transaksi nyata, jangan gunakan pembersihan massal ini.</span>
        </div>

        <Card className="panel">
          <div className="panel__header">
            <div>
              <h2>1. Periksa data</h2>
              <p>Preview mencakup data finansial dan sisa proses testing agar tidak ada queue trial yang tertinggal.</p>
            </div>
            <FiRefreshCw aria-hidden="true" />
          </div>
          <Button variant="primary" icon={FiRefreshCw} loading={previewBusy} onClick={loadPreview}>Periksa data testing</Button>
          {preview ? <ResetPreview preview={preview} /> : null}
        </Card>

        <Card className="panel">
          <div className="panel__header">
            <div>
              <h2>2. Bersihkan sekaligus</h2>
              <p>Safety backup dibuat dan diverifikasi sebelum penghapusan dimulai.</p>
            </div>
            <FiTrash2 aria-hidden="true" />
          </div>
          <div className="notice notice--info">
            <span>Proses ini tidak berjalan otomatis di background. Satu konfirmasi Administrator membersihkan seluruh scope pada preview secara atomik agar database testing kembali rapi.</span>
          </div>
          <Button variant="danger" icon={FiTrash2} disabled={!hasResettableData || previewBusy} onClick={() => { setApplyError(null); setConfirmationOpen(true); }}>Bersihkan data testing</Button>
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
