import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiHardDrive, FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import MaintenanceRecoveryPanel, { MaintenanceSummaryGrid as SummaryGrid, SafetyBackupPreflight } from "../MaintenanceRecoveryPanel.jsx";
import { formatMaintenanceCount as formatCount } from "../settingsPresentation.js";
import styles from "../Settings.module.css";

const DOMAIN_LABELS = Object.freeze([
  ["transactions", "Transaksi"],
  ["reconciliations", "Pencocokan saldo"],
  ["investmentTrades", "Transaksi saham"],
  ["investmentCorrections", "Koreksi investasi"],
  ["investmentValuations", "Harga investasi"],
  ["investmentReconciliations", "Pencocokan portfolio"],
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

const MASTER_LABELS = Object.freeze([
  ["accounts", "Rekening"],
  ["categories", "Kategori"],
  ["investmentPortfolios", "Portfolio investasi"],
  ["investmentInstruments", "Instrumen investasi"],
]);

const OPERATIONAL_LABELS = Object.freeze([
  ["masterDataRequests", "Pengajuan master data"],
  ["transferRequests", "Pengajuan transfer"],
  ["notificationDeliveries", "Delivery notifikasi"],
  ["manualReminders", "Pengingat manual"],
  ["notificationQueue", "Queue notifikasi"],
  ["integrationLinks", "Link integrasi"],
  ["integrationOutbox", "Queue sinkronisasi"],
  ["notificationPreferences", "Preferensi notifikasi"],
  ["pushSubscriptions", "Perangkat notifikasi"],
  ["importPreviews", "Preview import"],
  ["restorePreviews", "Preview restore"],
]);

const FullResetPreview = ({ preview }) => (
  <div className={styles.resetPreview}>
    <div className={styles.resetOverview} aria-label="Ringkasan reset semua data">
      <div><span>Total dihapus</span><strong>{formatCount(preview.summary?.totalRows)}</strong><small>baris</small></div>
      <div><span>Keuangan & rencana</span><strong>{formatCount(preview.summary?.domainRows)}</strong><small>baris</small></div>
      <div><span>Master</span><strong>{formatCount(preview.summary?.masterRows)}</strong><small>baris</small></div>
    </div>
    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiDatabase aria-hidden="true" />
        <div><strong>Finansial dan perencanaan</strong><small>Seluruh riwayat keuangan, investasi, dan perencanaan aplikasi akan dikosongkan.</small></div>
      </div>
      <SummaryGrid labels={DOMAIN_LABELS} summary={preview.summary} ariaLabel="Data finansial dan perencanaan yang akan dihapus" />
    </div>
    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiTrash2 aria-hidden="true" />
        <div><strong>Master aplikasi</strong><small>Rekening, kategori, portfolio, dan instrumen investasi ikut dihapus. Setelah reset, aplikasi kembali tanpa master finansial.</small></div>
      </div>
      <SummaryGrid labels={MASTER_LABELS} summary={preview.summary} ariaLabel="Master data yang akan dihapus" />
    </div>
    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiRefreshCw aria-hidden="true" />
        <div><strong>Data operasional</strong><small>Pengajuan, pengingat, notifikasi, sinkronisasi, dan preview sementara ikut dibersihkan.</small></div>
      </div>
      <SummaryGrid labels={OPERATIONAL_LABELS} summary={preview.summary} ariaLabel="Data operasional yang akan dihapus" />
    </div>
    <div className={styles.resetPreserved}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiShield aria-hidden="true" />
        <div><strong>Tetap disimpan</strong><small>Akses anggota, audit, backup, riwayat pemeriksaan integritas, dan struktur database tetap disimpan.</small></div>
      </div>
      <div className={styles.resetPreservedGrid}>
        <div><FiCheckCircle aria-hidden="true" /><span>Pengguna</span><strong>{formatCount(preview.preserved?.users)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Audit log</span><strong>{formatCount(preview.preserved?.audit)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Riwayat backup</span><strong>{formatCount(preview.preserved?.backups)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Riwayat pemeriksaan integritas</span><strong>{formatCount(preview.preserved?.integrityRuns)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Data pemulihan operasi</span><strong>{formatCount(preview.preserved?.idempotencyKeys)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Proteksi permintaan ulang</span><strong>{formatCount(preview.preserved?.requestNonces)}</strong></div>
        <div><FiCheckCircle aria-hidden="true" /><span>Konfigurasi & struktur database</span><strong>Tetap</strong></div>
      </div>
    </div>
  </div>
);

const FullResetConfirmation = ({ preview, open, busy, error, onCancel, onConfirm, acknowledgementItems }) => (
  <ConfirmationModal
    open={open}
    title="Reset semua data?"
    description="Rekening, kategori, portfolio investasi, saldo, transaksi, perencanaan, dan data operasional pada preview akan dihapus setelah safety backup. Pengguna, audit, backup, dan struktur database tetap disimpan."
    confirmLabel="Reset semua data"
    reasonLabel="Alasan full reset"
    reasonPlaceholder="Contoh: Mengembalikan aplikasi ke kondisi awal sebelum mulai digunakan"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "RESET SEMUA DATA SALDO BERSAMA"}
    acknowledgementItems={acknowledgementItems}
    countdownSeconds={15}
    busy={busy}
    error={error}
    tone="danger"
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {preview ? <FullResetPreview preview={preview} /> : null}
  </ConfirmationModal>
);

const FullResetStatusPanels = ({ status, statusResource, recovery }) => (
  <>
    <MaintenanceRecoveryPanel maintenanceMode={Boolean(status?.maintenanceMode)} busy={recovery.recoveryBusy} onRecover={recovery.recoverMaintenance} description="Reset penuh sebelumnya meninggalkan mode pemulihan aktif. Pemeriksaan konsistensi data wajib lulus sebelum perubahan data dibuka kembali." />
    {(statusResource.status === "error" || statusResource.refreshError) && !["processing", "not_committed"].includes(status?.outcome) ? (
      <div className="notice notice--danger" role="alert">
        <FiAlertTriangle aria-hidden="true" />
        <span><strong>Status full reset belum dapat diverifikasi.</strong> Operasi tetap diblokir sampai status dari server dapat dibaca.</span>
        <Button type="button" icon={FiRefreshCw} loading={statusResource.isRefreshing} onClick={recovery.checkStatus}>Periksa status operasi</Button>
      </div>
    ) : null}
    {["processing", "not_committed"].includes(status?.outcome) ? (
      <Card className={`${styles.resetRecoveryCard} ${styles.resetRecoveryCard_warning}`}>
        <div className={styles.resetRecoveryHeader}>
          <span className={styles.resetRecoveryIcon}><FiAlertTriangle aria-hidden="true" /></span>
          <div><h2>{status.outcome === "processing" ? "Full reset masih diproses" : "Hasil full reset belum pasti"}</h2><p>Jangan kirim reset baru sebelum status operasi sebelumnya dipastikan.</p></div>
        </div>
        <div className={styles.resetRecoveryActions}><Button type="button" icon={FiRefreshCw} onClick={recovery.checkStatus}>Periksa status</Button></div>
      </Card>
    ) : null}
  </>
);

const FullResetPreviewStep = ({ preview, statusBlocked }) => (
  <Card className={`panel ${styles.resetStepCard}`}>
    <div className={styles.resetStepHeader}><span className={styles.resetStepNumber}>1</span><div><h2>Preview seluruh dampak</h2><p>Server membaca ulang seluruh data keuangan, data utama, dan data operasional yang akan dihapus.</p></div><span className={styles.resetStepIcon}><FiDatabase aria-hidden="true" /></span></div>
    <Button variant="primary" icon={FiRefreshCw} loading={preview.previewBusy} disabled={statusBlocked} onClick={preview.loadPreview}>Periksa semua data</Button>
    {preview.preview ? <FullResetPreview preview={preview.preview} /> : null}
  </Card>
);

const FullResetBackupStep = ({ integrationsResource, driveReadiness, driveReady }) => (
  <Card className={`panel ${styles.resetStepCard}`}>
    <div className={styles.resetStepHeader}><span className={styles.resetStepNumber}>2</span><div><h2>Verifikasi backup keamanan</h2><p>Google Drive harus siap agar backup sebelum full reset dapat dipulihkan bila diperlukan.</p></div><span className={styles.resetStepIcon}><FiHardDrive aria-hidden="true" /></span></div>
    <SafetyBackupPreflight resource={integrationsResource} readiness={driveReadiness} />
    {!driveReady ? <div className={styles.resetInlineWarning}>Full reset diblokir sampai backup keamanan siap. <Link to="/pengaturan/integrasi">Periksa Integrasi Google</Link>.</div> : null}
  </Card>
);

const FullResetApplyStep = ({ canOpenReset, apply }) => (
  <Card className={`panel ${styles.resetStepCard} ${styles.resetDangerStep}`}>
    <div className={styles.resetStepHeader}><span className={styles.resetStepNumber}>3</span><div><h2>Reset ke kondisi awal</h2><p>Server membuat backup keamanan, mengunci perubahan selama proses, memeriksa ulang data, menghapus sesuai preview, memeriksa konsistensi, mencatat audit, lalu membangun ulang data sinkronisasi.</p></div><span className={styles.resetStepIcon}><FiTrash2 aria-hidden="true" /></span></div>
    <div className={styles.resetSafeHint}><FiShield aria-hidden="true" /><span>Jika koneksi terputus, jangan menekan tombol lagi. Gunakan Periksa status operasi untuk memastikan hasil terakhir.</span></div>
    <Button variant="danger" icon={FiTrash2} disabled={!canOpenReset} onClick={() => { apply.setApplyError(null); apply.setConfirmationOpen(true); }}>Reset semua data</Button>
  </Card>
);

const FullResetSteps = ({ preview, statusBlocked, integrationsResource, driveReadiness, driveReady, canOpenReset, apply }) => (
  <>
    <FullResetPreviewStep preview={preview} statusBlocked={statusBlocked} />
    <FullResetBackupStep integrationsResource={integrationsResource} driveReadiness={driveReadiness} driveReady={driveReady} />
    <FullResetApplyStep canOpenReset={canOpenReset} apply={apply} />
  </>
);

export { FullResetConfirmation, FullResetStatusPanels, FullResetSteps };
