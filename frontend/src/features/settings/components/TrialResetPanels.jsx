import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiDollarSign, FiHardDrive, FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import { formatRupiah } from "../../../domain/money.js";
import { MaintenanceSummaryGrid as SummaryGrid, SafetyBackupPreflight } from "../MaintenanceRecoveryPanel.jsx";
import { formatMaintenanceCount as formatCount } from "../settingsPresentation.js";
import styles from "../Settings.module.css";

const BUSINESS_SUMMARY_LABELS = Object.freeze([
  ["transactions", "Transaksi"],
  ["reconciliations", "Pencocokan saldo"],
  ["goals", "Target"],
  ["goalMovements", "Mutasi target"],
  ["budgets", "Kebutuhan"],
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
  ["integrationOutbox", "Queue sinkronisasi trial"],
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

const RESET_INTENT_STATE_LABELS = Object.freeze({
  processing: "Sedang diproses",
  unknown: "Belum pasti",
  completed: "Selesai",
  missing: "Tidak ditemukan",
});

const RESET_BACKUP_STATE_LABELS = Object.freeze({
  pending: "Menunggu",
  processing: "Sedang dibuat",
  completed: "Selesai",
  verified: "Terverifikasi",
  failed: "Gagal",
});

const intentStateLabel = (state) => RESET_INTENT_STATE_LABELS[state] || state || "Tidak tersedia";
const backupStateLabel = (state) => RESET_BACKUP_STATE_LABELS[state] || state || "Belum tersedia";

const ResetStepHeader = ({ number, icon: Icon, title, description }) => (
  <div className={styles.resetStepHeader}>
    <span className={styles.resetStepNumber} aria-hidden="true">{number}</span>
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <span className={styles.resetStepIcon} aria-hidden="true"><Icon /></span>
  </div>
);
const BalanceResetPreview = ({ balanceReset }) => {
  if (!balanceReset) return null;
  return (
    <div className={styles.resetBalancePreview}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiDollarSign aria-hidden="true" />
        <div>
          <strong>Saldo rekening akan menjadi Rp0</strong>
          <small>Riwayat testing dibersihkan. Saldo awal rekening yang masih bernilai juga dinolkan.</small>
        </div>
      </div>
      <div className={styles.resetBalanceTotal}>
        <span>Total saldo saat ini</span>
        <strong>{formatRupiah(balanceReset.totalCurrentBalance)} <span aria-hidden="true">→</span> Rp0</strong>
      </div>
      {balanceReset.accounts?.length ? (
        <div className={styles.resetBalanceAccounts} aria-label="Rekening yang saldo akhirnya akan menjadi nol">
          {balanceReset.accounts.map((account) => (
            <div key={account.accountId}>
              <span><strong>{account.name}</strong><small>Saldo awal {formatRupiah(account.initialBalance)}</small></span>
              <strong>{formatRupiah(account.currentBalance)} <span aria-hidden="true">→</span> Rp0</strong>
            </div>
          ))}
        </div>
      ) : <small className={styles.resetBalanceEmpty}>Semua rekening sudah memiliki saldo Rp0.</small>}
    </div>
  );
};

const ResetPreview = ({ preview }) => (
  <div className={styles.resetPreview}>
    <div className={styles.resetOverview} aria-label="Ringkasan data testing">
      <div><span>Total dibersihkan</span><strong>{formatCount(preview.summary?.totalRows)}</strong><small>baris</small></div>
      <div><span>Data finansial</span><strong>{formatCount(preview.summary?.businessRows)}</strong><small>baris</small></div>
      <div><span>Data operasional</span><strong>{formatCount(preview.summary?.operationalRows)}</strong><small>baris</small></div>
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
        <div><strong>Sisa proses testing</strong><small>Notifikasi tertunda, data sinkronisasi testing, dan preview sementara ikut dibersihkan. Tugas sinkronisasi baru yang dibuat setelah reset tidak dihitung sebagai data testing.</small></div>
      </div>
      <SummaryGrid labels={OPERATIONAL_SUMMARY_LABELS} summary={preview.summary} ariaLabel="Data operasional yang akan dibersihkan" />
    </div>

    <BalanceResetPreview balanceReset={preview.balanceReset} />

    <div className={styles.resetPreserved}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiShield aria-hidden="true" />
        <div><strong>Tetap disimpan</strong><small>Rekening, kategori, pengguna, audit, backup, perangkat notifikasi, dan data pemulihan tetap disimpan.</small></div>
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

const ResetConfirmationModal = ({ preview, open, busy, error, onCancel, onConfirm, resetBalances, acknowledgementItems }) => (
  <ConfirmationModal
    open={open}
    title="Bersihkan data testing?"
    description={resetBalances
      ? "Seluruh riwayat testing pada preview akan dihapus dan saldo rekening akan dikembalikan ke Rp0 setelah safety backup."
      : "Seluruh data pada preview akan dihapus permanen setelah safety backup. Gunakan hanya selama data yang tersimpan benar-benar masih data trial/error."}
    confirmLabel="Bersihkan data testing"
    reasonLabel="Alasan pembersihan"
    reasonPlaceholder="Contoh: Membersihkan transaksi dan rekonsiliasi hasil trial"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "BERSIHKAN DATA TESTING"}
    acknowledgementItems={acknowledgementItems}
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

const resetStatusPresentation = (status) => {
  const presentations = {
    processing: ["warning", "Operasi sebelumnya masih diproses", "Jangan kirim reset baru. Periksa status lagi sampai hasilnya pasti."],
    recovery_required: ["danger", "Mode pemulihan aktif", "Pemeriksaan konsistensi data wajib lulus sebelum perubahan data dapat dibuka kembali."],
    not_committed: ["warning", "Status operasi sebelumnya belum pasti", "Periksa data terbaru sebelum memulai pembersihan baru."],
  };
  return presentations[status?.outcome] || null;
};

const ResetRecoveryPanel = ({ status, statusBusy, onCheck, onReloadPreview }) => {
  const presentation = resetStatusPresentation(status);
  if (!presentation) return null;
  const [tone, title, text] = presentation;
  return (
    <Card className={`${styles.resetRecoveryCard} ${styles[`resetRecoveryCard_${tone}`] || ""}`}>
      <div className={styles.resetRecoveryHeader}>
        <span className={styles.resetRecoveryIcon}><FiAlertTriangle aria-hidden="true" /></span>
        <div><h2>{title}</h2><p>{text}</p></div>
      </div>
      <div className={styles.resetRecoveryMeta}>
        <div><span>Status operasi</span><strong>{intentStateLabel(status.intent?.state)}</strong></div>
        <div><span>Mode pemulihan</span><strong>{status.maintenanceMode ? "Aktif" : "Normal"}</strong></div>
        <div><span>Safety backup</span><strong>{backupStateLabel(status.backup?.status)}</strong></div>
      </div>
      <div className={styles.resetRecoveryActions}>
        <Button type="button" icon={FiRefreshCw} loading={statusBusy} onClick={onCheck}>Periksa status</Button>
        {status.outcome === "not_committed" ? <Button type="button" variant="primary" icon={FiDatabase} onClick={onReloadPreview}>Buat preview baru</Button> : null}
      </div>
    </Card>
  );
};

const ResetStatusFailure = ({ resource, status, onCheck }) => ((resource.status === "error" || resource.refreshError) && !resetStatusPresentation(status) ? (
  <div className="notice notice--danger" role="alert"><FiAlertTriangle aria-hidden="true" /><span><strong>Status reset belum dapat diverifikasi.</strong> Pembersihan tetap diblokir. Periksa status operasi sebelum membuat preview atau memulai pembersihan baru.</span><Button type="button" icon={FiRefreshCw} loading={resource.isRefreshing} onClick={onCheck}>Periksa status operasi</Button></div>
) : null);

const ResetScopeSelector = ({ resetScope, activityScope, activityAndBalancesScope, setResetScope, setPreview, setResult }) => {
  const selectScope = (scope) => { setResetScope(scope); setPreview(null); setResult(null); };
  return (
    <fieldset className={styles.resetScopeSelector}>
      <legend>Pilih hasil akhir reset testing</legend>
      <label className={resetScope === activityScope ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={activityScope} checked={resetScope === activityScope} onChange={() => selectScope(activityScope)} />
        <span className={styles.resetScopeIcon}><FiRefreshCw aria-hidden="true" /></span>
        <span><strong>Bersihkan aktivitas testing</strong><small>Hapus riwayat keuangan dan perencanaan testing. Rekening, kategori, dan saldo awal tetap.</small></span>
      </label>
      <label className={resetScope === activityAndBalancesScope ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={activityAndBalancesScope} checked={resetScope === activityAndBalancesScope} onChange={() => selectScope(activityAndBalancesScope)} />
        <span className={styles.resetScopeIcon}><FiDollarSign aria-hidden="true" /></span>
        <span><strong>Bersihkan aktivitas + nolkan saldo</strong><small>Hapus seluruh riwayat testing dan kembalikan saldo seluruh rekening pada preview menjadi Rp0.</small></span>
      </label>
    </fieldset>
  );
};

const ResetPreviewStep = ({ previewState, statusBlocksReset }) => (
  <Card className={`panel ${styles.resetStepCard}`}>
    <ResetStepHeader number="1" icon={FiRefreshCw} title="Periksa data" description="Lihat tepatnya data keuangan dan proses testing yang akan dibersihkan." />
    <Button variant="primary" icon={FiRefreshCw} loading={previewState.previewBusy} disabled={statusBlocksReset} onClick={previewState.loadPreview}>Periksa data testing</Button>
    {previewState.preview ? <ResetPreview preview={previewState.preview} /> : null}
  </Card>
);

const ResetBackupStep = ({ integrationsResource, driveReadiness, driveReady }) => (
  <Card className={`panel ${styles.resetStepCard}`}>
    <ResetStepHeader number="2" icon={FiHardDrive} title="Verifikasi backup keamanan" description="Google Drive wajib siap sebelum pembersihan data dapat dimulai." />
    <SafetyBackupPreflight resource={integrationsResource} readiness={driveReadiness} />
    {!driveReady ? <div className={styles.resetInlineWarning}><span>Backup keamanan belum siap. <Link to="/pengaturan/integrasi">Periksa Integrasi Google</Link>.</span></div> : null}
  </Card>
);

const ResetApplyStep = ({ canOpenReset, apply }) => (
  <Card className={`panel ${styles.resetStepCard} ${styles.resetDangerStep}`}>
    <ResetStepHeader number="3" icon={FiTrash2} title="Bersihkan sekaligus" description="Server membuat backup keamanan, mengunci perubahan selama proses, membersihkan data, memeriksa konsistensi, lalu menulis audit." />
    <div className={styles.resetSafeHint}><FiShield aria-hidden="true" /><span>Jika koneksi terputus, jangan kirim ulang. Gunakan pemeriksaan status agar operasi yang sama tidak berjalan dua kali.</span></div>
    <Button variant="danger" icon={FiTrash2} disabled={!canOpenReset} onClick={() => { apply.setApplyError(null); apply.setConfirmationOpen(true); }}>Bersihkan data testing</Button>
  </Card>
);

const ResetStepCards = ({ previewState, statusBlocksReset, integrationsResource, driveReadiness, driveReady, canOpenReset, apply }) => (
  <>
    <ResetPreviewStep previewState={previewState} statusBlocksReset={statusBlocksReset} />
    <ResetBackupStep integrationsResource={integrationsResource} driveReadiness={driveReadiness} driveReady={driveReady} />
    <ResetApplyStep canOpenReset={canOpenReset} apply={apply} />
  </>
);


export { ResetConfirmationModal, ResetRecoveryPanel, ResetScopeSelector, ResetStatusFailure, ResetStepCards };
