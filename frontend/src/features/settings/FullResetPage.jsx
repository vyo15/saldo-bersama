import { useState } from "react";
import {
  FiAlertTriangle, FiCheckCircle, FiDatabase, FiHardDrive, FiRefreshCw, FiShield, FiTrash2,
} from "react-icons/fi";
import { Link } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { createSecureRandomId } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import MaintenanceRecoveryPanel, {
  MaintenanceSummaryGrid as SummaryGrid,
  SafetyBackupPreflight,
} from "./MaintenanceRecoveryPanel.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { isSettingsOutcomeUnknownError, runSettingsAction } from "./settings.api.js";
import { formatMaintenanceCount as formatCount, readMaintenanceRecoveryToken, storeMaintenanceRecoveryToken, integrationProviderPresentation } from "./settingsPresentation.js";
import { useMaintenanceRecovery } from "./useMaintenanceRecovery.js";
import styles from "./Settings.module.css";

const FULL_RESET_RECOVERY_STORAGE_KEY = "saldo-bersama:full-reset-recovery";

const FULL_RESET_INVALIDATIONS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
  "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list",
  "reports.monthly", "reconciliations.list", "periods.list", "archive.list", "audit.list",
  "notifications.status", "notifications.preferences", "integrations.status", "reset.status",
  "fullReset.status", "users.list", "system.health",
]);

const DOMAIN_LABELS = Object.freeze([
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

const MASTER_LABELS = Object.freeze([
  ["accounts", "Rekening"],
  ["categories", "Kategori"],
]);

const OPERATIONAL_LABELS = Object.freeze([
  ["notificationDeliveries", "Delivery notifikasi"],
  ["notificationQueue", "Queue notifikasi"],
  ["integrationLinks", "Link integrasi"],
  ["integrationOutbox", "Queue sinkronisasi"],
  ["notificationPreferences", "Preferensi notifikasi"],
  ["pushSubscriptions", "Perangkat notifikasi"],
  ["importPreviews", "Preview import"],
  ["restorePreviews", "Preview restore"],
]);

const FULL_RESET_ACKNOWLEDGEMENTS = Object.freeze([
  "Saya memahami semua rekening dan kategori pada preview akan dihapus.",
  "Saya memahami seluruh saldo, transaksi, perencanaan, dan riwayat keuangan aplikasi akan dikosongkan.",
  "Saya sudah memastikan safety backup Google Drive terverifikasi sebelum reset dijalankan.",
  "Saya memahami pemulihan data setelah full reset hanya dapat dilakukan melalui backup yang valid.",
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
        <div><strong>Finansial dan perencanaan</strong><small>Seluruh riwayat keuangan dan perencanaan aplikasi akan dikosongkan.</small></div>
      </div>
      <SummaryGrid labels={DOMAIN_LABELS} summary={preview.summary} ariaLabel="Data finansial dan perencanaan yang akan dihapus" />
    </div>
    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiTrash2 aria-hidden="true" />
        <div><strong>Master aplikasi</strong><small>Rekening dan kategori ikut dihapus. Setelah reset, aplikasi kembali tanpa master finansial.</small></div>
      </div>
      <SummaryGrid labels={MASTER_LABELS} summary={preview.summary} ariaLabel="Master data yang akan dihapus" />
    </div>
    <div className={styles.resetPreviewSection}>
      <div className={styles.resetPreviewSectionHeading}>
        <FiRefreshCw aria-hidden="true" />
        <div><strong>Data operasional</strong><small>Notifikasi, sinkronisasi, dan preview sementara ikut dibersihkan.</small></div>
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

const FullResetConfirmation = ({ preview, open, busy, error, onCancel, onConfirm }) => (
  <ConfirmationModal
    open={open}
    title="Reset semua data?"
    description="Rekening, kategori, saldo, transaksi, perencanaan, dan data operasional pada preview akan dihapus setelah safety backup. Pengguna, audit, backup, dan struktur database tetap disimpan."
    confirmLabel="Reset semua data"
    reasonLabel="Alasan full reset"
    reasonPlaceholder="Contoh: Mengembalikan aplikasi ke kondisi awal sebelum mulai digunakan"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "RESET SEMUA DATA SALDO BERSAMA"}
    acknowledgementItems={FULL_RESET_ACKNOWLEDGEMENTS}
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

const useFullResetRecovery = ({ statusResource, integrationsResource, invalidate, refreshAll, setRecoveryToken }) => {
  const [result, setResult] = useState(null);

  const clearRecovery = () => {
    storeMaintenanceRecoveryToken(FULL_RESET_RECOVERY_STORAGE_KEY, null);
    setRecoveryToken(null);
  };

  const committed = async (status) => {
    clearRecovery();
    invalidate(FULL_RESET_INVALIDATIONS);
    await Promise.allSettled([refreshAll(), integrationsResource.reload()]);
    setResult({
      status: "success",
      text: `Full reset sudah terkonfirmasi berhasil${status?.committedReset?.summary?.totalRows != null ? `. ${formatCount(status.committedReset.summary.totalRows)} baris dihapus` : ""}. Jangan mengirim reset yang sama lagi.`,
      fileLink: status?.committedReset?.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(status.committedReset.safetyBackupFileId)}` : null,
    });
  };

  const handleStatus = async (status) => {
    if (!status) return;
    if (status.outcome === "committed") {
      await committed(status);
      return;
    }
    if (status.outcome === "not_committed") clearRecovery();
    const messages = {
      processing: ["warning", "Full reset sebelumnya masih diproses. Jangan kirim operasi baru."],
      recovery_required: ["danger", "Mode pemulihan aktif. Pemeriksaan konsistensi data wajib lulus sebelum aplikasi dapat dipakai kembali."],
      not_committed: ["warning", "Hasil full reset sebelumnya belum terkonfirmasi tersimpan. Buat preview baru sebelum memulai reset baru."],
    };
    const message = messages[status.outcome];
    setResult(message ? { status: message[0], text: message[1] } : { status: "success", text: "Tidak ada full reset yang menunggu kepastian." });
  };

  const checkStatus = async () => {
    try { await handleStatus(await statusResource.reload()); }
    catch (error) { setResult({ status: "danger", text: error.message }); }
  };

  const { recoveryBusy, recoverMaintenance } = useMaintenanceRecovery({
    invalidate,
    setResult,
    invalidationKeys: ["system.health", "audit.list", "fullReset.status", "reset.status"],
    loadingText: "Memeriksa konsistensi data sebelum membuka kembali perubahan...",
    issueText: (count) => `Mode pemulihan tetap aktif. Pemeriksaan konsistensi menemukan ${count} masalah.`,
    successText: (maintenanceCleared) => maintenanceCleared
      ? "Pemeriksaan konsistensi lulus dan perubahan data berhasil dibuka kembali."
      : "Pemeriksaan konsistensi lulus. Mode pemulihan sudah tidak aktif.",
    onFailure: () => statusResource.reload(),
    onSuccess: async () => handleStatus(await statusResource.reload()),
  });

  return { result, setResult, recoveryBusy, clearRecovery, committed, handleStatus, checkStatus, recoverMaintenance };
};

const useFullResetPreview = ({ recoveryToken, statusResource, integrationsResource, committed, setResult }) => {
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const loadPreview = async () => {
    setPreviewBusy(true);
    setResult({ status: "loading", text: "Memeriksa status, Google Drive, dan seluruh data yang akan direset..." });
    try {
      const [status, integrations] = await Promise.all([statusResource.reload(), integrationsResource.reload()]);
      if (recoveryToken && status?.outcome === "committed") {
        setPreview(null);
        await committed(status);
        return;
      }
      if (status?.canStartNewIntent === false || status?.maintenanceMode || ["processing", "recovery_required"].includes(status?.outcome)) {
        setPreview(null);
        setResult({ status: "danger", text: "Full reset diblokir sampai status operasi sebelumnya dan mode pemulihan dipastikan aman." });
        return;
      }
      const readiness = integrationProviderPresentation(integrations || {}, "drive");
      const data = await runSettingsAction("fullReset.preview", {}, { force: true });
      setPreview(data);
      setResult({
        status: readiness.ready ? "success" : "warning",
        text: Number(data.summary?.totalRows || 0) <= 0
          ? "Aplikasi sudah berada pada kondisi awal. Tidak ada data yang perlu direset."
          : readiness.ready
            ? `Preview siap. ${formatCount(data.summary.totalRows)} baris akan dihapus setelah safety backup.`
            : `Preview siap, tetapi full reset diblokir. ${readiness.text}`,
      });
    } catch (error) {
      setPreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setPreviewBusy(false);
    }
  };

  return { preview, setPreview, previewBusy, loadPreview };
};

const useFullResetApply = ({
  preview, setPreview, statusResource, integrationsResource, recovery, setRecoveryToken, invalidate, refreshAll,
}) => {
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const applyReset = async (reason, confirmationState) => {
    if (!preview) return;
    setApplyBusy(true);
    setApplyError(null);
    const idempotencyKey = createSecureRandomId();
    try {
      const [status, integrations] = await Promise.all([statusResource.reload(), integrationsResource.reload()]);
      if (status?.canStartNewIntent === false || status?.maintenanceMode || ["processing", "recovery_required"].includes(status?.outcome)) {
        throw new Error("Full reset diblokir karena operasi sebelumnya belum aman untuk dilanjutkan.");
      }
      const readiness = integrationProviderPresentation(integrations || {}, "drive");
      if (!readiness.ready) throw new Error(`Safety backup Google Drive belum siap. ${readiness.text}`);
      const token = { idempotencyKey, createdAt: new Date().toISOString() };
      storeMaintenanceRecoveryToken(FULL_RESET_RECOVERY_STORAGE_KEY, token);
      setRecoveryToken(token);
      const data = await runSettingsAction("fullReset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: confirmationState.confirmation,
        acknowledged: confirmationState.acknowledged,
        reason,
      }, { idempotencyKey, newIntent: true });
      recovery.clearRecovery();
      setConfirmationOpen(false);
      setPreview(null);
      invalidate(FULL_RESET_INVALIDATIONS);
      await Promise.allSettled([refreshAll(), integrationsResource.reload(), statusResource.reload()]);
      recovery.setResult({
        status: "success",
        text: `Reset semua data selesai. ${formatCount(data.summary?.totalRows)} baris dihapus. Pengguna, audit, safety backup, dan konfigurasi kritis tetap disimpan.`,
        fileLink: data.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.safetyBackupFileId)}` : null,
      });
    } catch (error) {
      if (isSettingsOutcomeUnknownError(error)) {
        setConfirmationOpen(false);
        setPreview(null);
        recovery.setResult({ status: "warning", text: "Hasil full reset belum dapat dipastikan. Jangan kirim ulang. Gunakan Periksa status operasi." });
        statusResource.reload().catch(() => {});
      } else {
        recovery.clearRecovery();
        const checked = await statusResource.reload().catch(() => null);
        if (checked?.outcome === "recovery_required" || checked?.maintenanceMode) {
          setConfirmationOpen(false);
          setPreview(null);
          await recovery.handleStatus(checked);
        } else if (["FULL_RESET_PREVIEW_CHANGED", "FULL_RESET_NOTHING_TO_CLEAN"].includes(error?.code)) {
          setConfirmationOpen(false);
          setPreview(null);
          recovery.setResult({ status: "warning", text: `${error.message} Buat preview full reset baru sebelum melanjutkan.` });
        } else {
          setApplyError(error);
          recovery.setResult({ status: "danger", text: error.message });
        }
      }
    } finally {
      setApplyBusy(false);
    }
  };

  return { applyBusy, applyError, setApplyError, confirmationOpen, setConfirmationOpen, applyReset };
};

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

const fullResetDriveState = (integrationsResource) => {
  const readiness = integrationProviderPresentation(integrationsResource.data || {}, "drive");
  return {
    readiness,
    ready: integrationsResource.status === "ready" && !integrationsResource.refreshError && readiness.ready,
  };
};

const fullResetStatusState = (statusResource) => {
  const status = statusResource.data || null;
  const verified = statusResource.status === "ready" && !statusResource.refreshError;
  const blockedByStatus = status ? status.canStartNewIntent === false || Boolean(status.maintenanceMode) : false;
  return { status, blocked: !verified || blockedByStatus };
};

const fullResetPreviewHasData = (preview) => Boolean(preview && Number(preview.summary?.totalRows || 0) > 0);

const FullResetPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const [recoveryToken, setRecoveryToken] = useState(() => readMaintenanceRecoveryToken(FULL_RESET_RECOVERY_STORAGE_KEY));
  const integrationsResource = useApiResource("integrations.status", {}, { enabled: ownerMode });
  const statusResource = useApiResource("fullReset.status", recoveryToken ? { idempotencyKey: recoveryToken.idempotencyKey } : {}, { enabled: ownerMode });
  const recovery = useFullResetRecovery({ statusResource, integrationsResource, invalidate, refreshAll, setRecoveryToken });
  const preview = useFullResetPreview({ recoveryToken, statusResource, integrationsResource, committed: recovery.committed, setResult: recovery.setResult });
  const apply = useFullResetApply({ preview: preview.preview, setPreview: preview.setPreview, statusResource, integrationsResource, recovery, setRecoveryToken, invalidate, refreshAll });

  const drive = fullResetDriveState(integrationsResource);
  const resetState = fullResetStatusState(statusResource);
  const canOpenReset = fullResetPreviewHasData(preview.preview) && drive.ready && !preview.previewBusy && !resetState.blocked;

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="full-reset-title">
        <div className={`${styles.pageHeading} ${styles.resetPageHeading}`}>
          <h2 id="full-reset-title">Reset semua data</h2>
          <p>Kembalikan data aplikasi ke kondisi awal. Rekening, kategori, saldo, riwayat keuangan, perencanaan, dan data operasional akan dihapus. Pengguna, audit, backup, dan struktur database tetap disimpan.</p>
        </div>
        <div className={styles.resetResultNotice}><SettingsNotice result={recovery.result} /></div>
        <FullResetStatusPanels status={resetState.status} statusResource={statusResource} recovery={recovery} />
        <div className={`${styles.resetGuardNotice} ${styles.fullResetGuard}`} role="note">
          <FiShield aria-hidden="true" />
          <span><strong>Tindakan ini menghapus hampir seluruh data aplikasi.</strong> Gunakan reset penuh hanya untuk mengembalikan aplikasi ke kondisi awal. Gunakan Restore jika Anda hanya perlu kembali ke backup tertentu.</span>
        </div>
        <FullResetSteps preview={preview} statusBlocked={resetState.blocked} integrationsResource={integrationsResource} driveReadiness={drive.readiness} driveReady={drive.ready} canOpenReset={canOpenReset} apply={apply} />
        <FullResetConfirmation
          preview={preview.preview}
          open={apply.confirmationOpen}
          busy={apply.applyBusy}
          error={apply.applyError}
          onCancel={() => { if (!apply.applyBusy) { apply.setConfirmationOpen(false); apply.setApplyError(null); } }}
          onConfirm={apply.applyReset}
        />
      </section>
    </OwnerSettingsGuard>
  );
};

export default FullResetPage;
