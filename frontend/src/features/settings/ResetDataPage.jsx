import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiHardDrive, FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { createSecureRandomId } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { isSettingsOutcomeUnknownError, runSettingsAction } from "./settings.api.js";
import { integrationProviderPresentation } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const RESET_INVALIDATIONS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "transactions.list",
  "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly",
  "reconciliations.list", "periods.list", "archive.list", "audit.list", "integrations.status", "reset.status",
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

const RESET_ACKNOWLEDGEMENTS = Object.freeze([
  "Saya memahami seluruh data pada preview akan dihapus permanen.",
  "Saya sudah memastikan data yang tersimpan masih data testing/trial, bukan transaksi nyata.",
  "Saya memahami safety backup Google Drive harus terverifikasi sebelum pembersihan dimulai.",
]);

const RESET_RECOVERY_STORAGE_KEY = "saldo-bersama:reset-recovery";
const formatCount = (value) => Number(value || 0).toLocaleString("id-ID");

const readRecoveryToken = () => {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(RESET_RECOVERY_STORAGE_KEY) || "null");
    return value?.idempotencyKey ? value : null;
  } catch {
    return null;
  }
};

const storeRecoveryToken = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(RESET_RECOVERY_STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(RESET_RECOVERY_STORAGE_KEY);
  } catch { /* Browser storage must not control destructive safety. */ }
};

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
        <div><strong>Sisa proses testing</strong><small>Queue trial, projection, dan preview sementara ikut dibersihkan. Queue rebuild sistem hasil reset tidak dihitung sebagai data testing baru.</small></div>
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
    description="Seluruh data pada preview akan dihapus permanen setelah safety backup. Gunakan hanya selama data yang tersimpan benar-benar masih data trial/error."
    confirmLabel="Bersihkan data testing"
    reasonLabel="Alasan pembersihan"
    reasonPlaceholder="Contoh: Membersihkan transaksi dan rekonsiliasi hasil trial"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "BERSIHKAN DATA TESTING"}
    acknowledgementItems={RESET_ACKNOWLEDGEMENTS}
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

const backupStatusText = (readiness, resourceStatus) => {
  if (resourceStatus === "loading" || resourceStatus === "refreshing") return "Memeriksa Google Drive...";
  return readiness.text;
};

const ResetSafetyPreflight = ({ resource, readiness }) => (
  <div className={styles.resetSafetyPreflight}>
    <span className={styles.serviceIcon}><FiHardDrive aria-hidden="true" /></span>
    <span>
      <strong>Safety backup Google Drive</strong>
      <small>{backupStatusText(readiness, resource.status)}</small>
    </span>
    <span className={`status-badge status-badge--${readiness.tone}`}>{readiness.label}</span>
  </div>
);

const resetStatusPresentation = (status) => {
  const presentations = {
    processing: ["warning", "Operasi sebelumnya masih diproses", "Jangan kirim reset baru. Periksa status lagi sampai hasilnya pasti."],
    recovery_required: ["danger", "Mode pemulihan aktif", "Integrity check wajib lulus sebelum maintenance dapat dibuka kembali."],
    not_committed: ["warning", "Reset sebelumnya tidak tercatat berhasil", "Aman untuk memulai intent baru hanya setelah preview data diperbarui."],
    committed: ["success", "Reset sebelumnya sudah terkonfirmasi", "Audit dan safety backup menunjukkan operasi sudah commit. Jangan kirim reset yang sama lagi."],
  };
  return presentations[status?.outcome] || null;
};

const ResetRecoveryPanel = ({ status, statusBusy, recoveryBusy, onCheck, onRecover, onReloadPreview }) => {
  const presentation = resetStatusPresentation(status);
  if (!presentation) return null;
  const [tone, title, text] = presentation;
  return (
    <Card className={`${styles.resetRecoveryCard} ${styles[`resetRecoveryCard_${tone}`] || ""}`}>
      <div className="panel__header">
        <div><h2>{title}</h2><p>{text}</p></div>
        <FiAlertTriangle aria-hidden="true" />
      </div>
      <div className={styles.resetRecoveryMeta}>
        <div><span>Status intent</span><strong>{status.intent?.state || "Tidak ada"}</strong></div>
        <div><span>Maintenance</span><strong>{status.maintenanceMode ? "Aktif" : "Tidak aktif"}</strong></div>
        <div><span>Safety backup</span><strong>{status.backup?.status || "Belum ada"}</strong></div>
      </div>
      <div className={styles.resetRecoveryActions}>
        <Button type="button" icon={FiRefreshCw} loading={statusBusy} onClick={onCheck}>Periksa status lagi</Button>
        {status.outcome === "recovery_required" ? <Button type="button" variant="danger" icon={FiShield} loading={recoveryBusy} onClick={onRecover}>Periksa integritas & pulihkan</Button> : null}
        {status.outcome === "not_committed" ? <Button type="button" variant="primary" icon={FiDatabase} onClick={onReloadPreview}>Periksa data testing lagi</Button> : null}
      </div>
    </Card>
  );
};

const ResetDataPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const [recoveryToken, setRecoveryToken] = useState(readRecoveryToken);
  const integrationsResource = useApiResource("integrations.status", {}, { enabled: ownerMode });
  const resetStatusResource = useApiResource("reset.status", recoveryToken ? {
    idempotencyKey: recoveryToken.idempotencyKey,
  } : {}, { enabled: ownerMode });
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [result, setResult] = useState(null);

  const driveReadiness = integrationProviderPresentation(integrationsResource.data || {}, "drive");
  const driveReady = integrationsResource.status === "ready" && !integrationsResource.refreshError && driveReadiness.ready;
  const resetStatus = resetStatusResource.data || null;
  const resetStatusVerified = resetStatusResource.status === "ready" && !resetStatusResource.refreshError;
  const statusBlocksReset = !resetStatusVerified || resetStatus?.canStartNewIntent === false || resetStatus?.maintenanceMode;

  const clearRecovery = () => {
    storeRecoveryToken(null);
    setRecoveryToken(null);
  };

  const refreshAfterCommittedReset = async (status) => {
    clearRecovery();
    setConfirmationOpen(false);
    setPreview(null);
    invalidate(RESET_INVALIDATIONS);
    await Promise.allSettled([refreshAll(), integrationsResource.reload()]);
    const committed = status?.committedReset || {};
    setResult({
      status: "success",
      text: `Pembersihan sudah terkonfirmasi berhasil${committed.summary?.totalRows != null ? `. ${formatCount(committed.summary.totalRows)} baris data testing telah dihapus` : ""}. Jangan mengirim reset yang sama lagi.`,
      fileLink: committed.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(committed.safetyBackupFileId)}` : null,
    });
  };

  const handleCheckedStatus = async (status) => {
    if (!status) return;
    if (status.outcome === "committed") {
      await refreshAfterCommittedReset(status);
      return;
    }
    if (status.outcome === "processing") {
      setResult({ status: "warning", text: "Reset sebelumnya masih diproses. Jangan kirim operasi baru. Periksa status lagi beberapa saat kemudian." });
      return;
    }
    if (status.outcome === "recovery_required") {
      setResult({ status: "danger", text: "Mode pemulihan aktif. Jalankan integrity check dari panel recovery sebelum melakukan perubahan lain." });
      return;
    }
    if (status.outcome === "not_committed") {
      clearRecovery();
      setPreview(null);
      setResult({ status: "warning", text: "Reset sebelumnya tidak tercatat sebagai commit. Jalankan preview baru sebelum mencoba pembersihan dengan intent baru." });
      return;
    }
    setResult({ status: "success", text: "Tidak ada operasi reset yang sedang menunggu kepastian." });
  };

  const checkResetStatus = async () => {
    try {
      const status = await resetStatusResource.reload();
      await handleCheckedStatus(status);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    }
  };

  const recoverMaintenance = async () => {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    setResult({ status: "loading", text: "Menjalankan integrity check sebelum membuka maintenance..." });
    try {
      const data = await runSettingsAction("integrity.run", { clearMaintenance: true }, {});
      invalidate(["system.health", "audit.list", "reset.status"]);
      if (!data.ok) {
        setResult({ status: "danger", text: `Maintenance tetap aktif. Integrity check menemukan ${data.issues?.length || 0} masalah yang harus diselesaikan.` });
        return;
      }
      const status = await resetStatusResource.reload();
      setResult({ status: "success", text: data.maintenanceCleared ? "Integrity check lulus dan maintenance berhasil dibuka kembali." : "Integrity check lulus. Maintenance sudah tidak aktif." });
      await handleCheckedStatus(status);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setRecoveryBusy(false);
    }
  };

  const loadPreview = async () => {
    setPreviewBusy(true);
    setResult({ status: "loading", text: "Memeriksa status reset, kesiapan backup, dan seluruh data testing..." });
    try {
      const [status, integrations] = await Promise.all([resetStatusResource.reload(), integrationsResource.reload()]);
      if (status?.outcome === "committed" && status?.intent?.state === "unknown") {
        await refreshAfterCommittedReset(status);
      }
      if (status?.canStartNewIntent === false || status?.outcome === "processing" || status?.outcome === "recovery_required" || status?.maintenanceMode) {
        setPreview(null);
        setResult({ status: "danger", text: "Pembersihan baru diblokir sampai status operasi sebelumnya dan maintenance selesai dipastikan." });
        return;
      }
      const currentDriveReadiness = integrationProviderPresentation(integrations || {}, "drive");
      const data = await runSettingsAction("reset.preview", {}, { force: true });
      setPreview(data);
      setResult({
        status: currentDriveReadiness.ready ? "success" : "warning",
        text: data.summary?.totalRows
          ? currentDriveReadiness.ready
            ? `Preview siap. ${formatCount(data.summary.totalRows)} baris data testing dapat dibersihkan dan safety backup Google Drive sudah siap.`
            : `Preview siap, tetapi pembersihan diblokir karena safety backup Google Drive belum terverifikasi. ${currentDriveReadiness.text}`
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
    const payload = {
      previewFingerprint: preview.previewFingerprint,
      confirmation: confirmationState.confirmation,
      acknowledged: confirmationState.acknowledged,
      reason,
    };
    const idempotencyKey = createSecureRandomId();
    const recovery = { idempotencyKey, createdAt: new Date().toISOString() };
    try {
      const [status, integrations] = await Promise.all([resetStatusResource.reload(), integrationsResource.reload()]);
      if (status?.canStartNewIntent === false || status?.outcome === "processing" || status?.outcome === "recovery_required" || status?.maintenanceMode) {
        throw new Error("Pembersihan baru diblokir karena operasi sebelumnya belum aman untuk dilanjutkan.");
      }
      const currentDriveReadiness = integrationProviderPresentation(integrations || {}, "drive");
      if (!currentDriveReadiness.ready) throw new Error(`Safety backup Google Drive belum siap. ${currentDriveReadiness.text}`);

      storeRecoveryToken(recovery);
      setRecoveryToken(recovery);
      const data = await runSettingsAction("reset.apply", payload, {
        idempotencyKey,
        newIntent: true,
      });
      clearRecovery();
      setConfirmationOpen(false);
      setPreview(null);
      invalidate(RESET_INVALIDATIONS);
      await Promise.allSettled([refreshAll(), integrationsResource.reload(), resetStatusResource.reload()]);
      setResult({
        status: "success",
        text: `Pembersihan selesai. ${formatCount(data.summary?.totalRows)} baris data testing dihapus setelah safety backup dan integrity check. Data dasar aplikasi tetap dipertahankan.`,
        fileLink: data.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.safetyBackupFileId)}` : null,
      });
    } catch (error) {
      if (isSettingsOutcomeUnknownError(error)) {
        setConfirmationOpen(false);
        setPreview(null);
        setResult({ status: "warning", text: "Hasil pembersihan belum dapat dipastikan. Jangan kirim ulang. Gunakan Periksa status operasi untuk merekonsiliasi hasilnya." });
        resetStatusResource.reload().catch(() => {});
      } else {
        clearRecovery();
        const checkedStatus = await resetStatusResource.reload().catch(() => null);
        if (checkedStatus?.outcome === "recovery_required" || checkedStatus?.maintenanceMode) {
          setConfirmationOpen(false);
          setPreview(null);
          await handleCheckedStatus(checkedStatus);
        } else if (["RESET_PREVIEW_CHANGED", "RESET_NOTHING_TO_CLEAN"].includes(error?.code)) {
          setConfirmationOpen(false);
          setPreview(null);
          setResult({ status: "warning", text: `${error.message} Periksa data testing lagi sebelum melanjutkan.` });
        } else {
          setApplyError(error);
          setResult({ status: "danger", text: error.message });
        }
      }
    } finally {
      setApplyBusy(false);
    }
  };

  const hasResettableData = Number(preview?.summary?.totalRows || 0) > 0;
  const canOpenReset = hasResettableData && driveReady && !previewBusy && !statusBlocksReset;

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="reset-data-title">
        <div className={styles.pageHeading}>
          <h2 id="reset-data-title">Bersihkan data testing</h2>
          <p>Kosongkan data trial/error dalam satu proses tanpa menghapus master, akses pengguna, audit, atau recovery.</p>
        </div>

        <SettingsNotice result={result} />

        <ResetRecoveryPanel
          status={resetStatus}
          statusBusy={resetStatusResource.status === "loading" || resetStatusResource.isRefreshing}
          recoveryBusy={recoveryBusy}
          onCheck={checkResetStatus}
          onRecover={recoverMaintenance}
          onReloadPreview={loadPreview}
        />

        {resetStatusResource.status === "error" || resetStatusResource.refreshError ? (
          <div className="notice notice--danger" role="alert">
            <FiAlertTriangle aria-hidden="true" />
            <span><strong>Status reset belum dapat diverifikasi.</strong> Pembersihan tetap diblokir. Periksa status operasi sebelum membuat preview atau intent baru.</span>
            <Button type="button" icon={FiRefreshCw} loading={resetStatusResource.isRefreshing} onClick={checkResetStatus}>Periksa status operasi</Button>
          </div>
        ) : null}

        <div className="notice notice--warning" role="note">
          <FiShield aria-hidden="true" />
          <span><strong>Satu database aktif.</strong> Gunakan fitur ini hanya selama seluruh data finansial yang tersimpan masih data testing. Setelah transaksi nyata mulai digunakan, jangan lakukan pembersihan massal.</span>
        </div>

        <Card className="panel">
          <div className="panel__header">
            <div><h2>1. Periksa data</h2><p>Preview memisahkan data finansial, sisa proses trial, dan queue sistem hasil reset agar hitungannya tidak menyesatkan.</p></div>
            <FiRefreshCw aria-hidden="true" />
          </div>
          <Button variant="primary" icon={FiRefreshCw} loading={previewBusy} disabled={statusBlocksReset} onClick={loadPreview}>Periksa data testing</Button>
          {preview ? <ResetPreview preview={preview} /> : null}
        </Card>

        <Card className="panel">
          <div className="panel__header">
            <div><h2>2. Verifikasi safety backup</h2><p>Google Drive harus lolos health check sebelum tombol destructive dapat digunakan.</p></div>
            <FiHardDrive aria-hidden="true" />
          </div>
          <ResetSafetyPreflight resource={integrationsResource} readiness={driveReadiness} />
          {!driveReady ? <div className="notice notice--warning"><span>Reset tetap diblokir sampai safety backup siap. <Link to="/pengaturan/integrasi">Periksa Integrasi Google</Link>.</span></div> : null}
        </Card>

        <Card className="panel">
          <div className="panel__header">
            <div><h2>3. Bersihkan sekaligus</h2><p>Setelah preview dan backup siap, server membuat safety backup, mengunci maintenance, purge atomik, integrity check, lalu audit.</p></div>
            <FiTrash2 aria-hidden="true" />
          </div>
          <div className="notice notice--info">
            <span>Jika koneksi terputus, jangan kirim ulang. Aplikasi akan memeriksa idempotency, audit, backup, dan maintenance untuk memastikan hasil operasi terlebih dahulu.</span>
          </div>
          <Button variant="danger" icon={FiTrash2} disabled={!canOpenReset} onClick={() => { setApplyError(null); setConfirmationOpen(true); }}>Bersihkan data testing</Button>
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
