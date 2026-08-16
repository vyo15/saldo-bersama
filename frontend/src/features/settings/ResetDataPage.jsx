import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiDollarSign, FiHardDrive, FiRefreshCw, FiShield, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { formatRupiah } from "../../domain/money.js";
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

const RESET_SCOPE_ACTIVITY = "activity";
const RESET_SCOPE_ACTIVITY_AND_BALANCES = "activity_and_balances";

const RESET_ACKNOWLEDGEMENTS = Object.freeze([
  "Saya memahami seluruh data pada preview akan dihapus permanen.",
  "Saya sudah memastikan data yang tersimpan masih data testing/trial, bukan transaksi nyata.",
  "Saya memahami safety backup Google Drive harus terverifikasi sebelum pembersihan dimulai.",
]);

const RESET_BALANCE_ACKNOWLEDGEMENTS = Object.freeze([
  ...RESET_ACKNOWLEDGEMENTS,
  "Saya memahami saldo awal rekening yang masuk preview akan dinolkan dan row version rekening terkait akan diperbarui.",
]);

const RESET_RECOVERY_STORAGE_KEY = "saldo-bersama:reset-recovery";

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

const ResetConfirmationModal = ({ preview, open, busy, error, onCancel, onConfirm }) => (
  <ConfirmationModal
    open={open}
    title="Bersihkan data testing?"
    description={preview?.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES
      ? "Seluruh riwayat testing pada preview akan dihapus dan saldo rekening akan dikembalikan ke Rp0 setelah safety backup."
      : "Seluruh data pada preview akan dihapus permanen setelah safety backup. Gunakan hanya selama data yang tersimpan benar-benar masih data trial/error."}
    confirmLabel="Bersihkan data testing"
    reasonLabel="Alasan pembersihan"
    reasonPlaceholder="Contoh: Membersihkan transaksi dan rekonsiliasi hasil trial"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "BERSIHKAN DATA TESTING"}
    acknowledgementItems={preview?.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES ? RESET_BALANCE_ACKNOWLEDGEMENTS : RESET_ACKNOWLEDGEMENTS}
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

const useResetRecovery = ({ setRecoveryToken, integrationsResource, resetStatusResource, invalidate, refreshAll }) => {
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [result, setResult] = useState(null);

  const clearRecovery = () => {
    storeMaintenanceRecoveryToken(RESET_RECOVERY_STORAGE_KEY, null);
    setRecoveryToken(null);
  };

  const refreshAfterCommittedReset = async (status) => {
    clearRecovery();
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
    const messages = {
      processing: ["warning", "Reset sebelumnya masih diproses. Jangan kirim operasi baru. Periksa status lagi beberapa saat kemudian."],
      recovery_required: ["danger", "Mode pemulihan aktif. Jalankan pemeriksaan konsistensi dari panel pemulihan sebelum melakukan perubahan lain."],
      not_committed: ["warning", "Hasil reset sebelumnya belum terkonfirmasi tersimpan. Jalankan preview baru sebelum mencoba pembersihan baru."],
    };
    if (status.outcome === "committed") {
      await refreshAfterCommittedReset(status);
      return;
    }
    if (status.outcome === "not_committed") clearRecovery();
    const message = messages[status.outcome];
    setResult(message ? { status: message[0], text: message[1] } : { status: "success", text: "Tidak ada operasi reset yang sedang menunggu kepastian." });
  };

  const checkResetStatus = async () => {
    try {
      await handleCheckedStatus(await resetStatusResource.reload());
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    }
  };

  const recoverMaintenance = async () => {
    if (recoveryBusy) return;
    setRecoveryBusy(true);
    setResult({ status: "loading", text: "Memeriksa konsistensi data sebelum membuka kembali perubahan..." });
    try {
      const data = await runSettingsAction("integrity.run", { clearMaintenance: true }, {});
      invalidate(["system.health", "audit.list", "reset.status"]);
      if (!data.ok) {
        setResult({ status: "danger", text: `Mode pemulihan tetap aktif. Pemeriksaan konsistensi menemukan ${data.issues?.length || 0} masalah yang harus diselesaikan.` });
        return;
      }
      const status = await resetStatusResource.reload();
      setResult({ status: "success", text: data.maintenanceCleared ? "Pemeriksaan konsistensi lulus dan perubahan data berhasil dibuka kembali." : "Pemeriksaan konsistensi lulus. Mode pemulihan sudah tidak aktif." });
      await handleCheckedStatus(status);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setRecoveryBusy(false);
    }
  };

  return { recoveryBusy, result, setResult, clearRecovery, refreshAfterCommittedReset, handleCheckedStatus, checkResetStatus, recoverMaintenance };
};

const resetOperationBlocked = (status) => status?.canStartNewIntent === false || ["processing", "recovery_required"].includes(status?.outcome) || Boolean(status?.maintenanceMode);

const resetPreviewResult = (data, driveReadiness) => {
  const hasRows = Number(data.summary?.totalRows || 0) > 0;
  const hasBalanceChanges = Number(data.balanceReset?.accountsAffected || 0) > 0;
  if (!hasRows && !hasBalanceChanges) return { status: "success", text: "Tidak ada data aktivitas, sisa proses testing, atau saldo awal yang perlu dibersihkan." };
  if (!driveReadiness.ready) return { status: "warning", text: `Preview siap, tetapi pembersihan diblokir karena safety backup Google Drive belum terverifikasi. ${driveReadiness.text}` };
  const balanceText = data.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES && hasBalanceChanges
    ? ` ${formatCount(data.balanceReset.accountsAffected)} rekening akan berakhir pada saldo Rp0.`
    : "";
  return { status: "success", text: `Preview siap. ${formatCount(data.summary?.totalRows)} baris data testing dapat dibersihkan.${balanceText} Safety backup Google Drive sudah siap.` };
};

const useResetPreview = ({ recoveryToken, resetScope, resetStatusResource, integrationsResource, refreshAfterCommittedReset, setResult }) => {
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const loadPreview = async () => {
    setPreviewBusy(true);
    setResult({ status: "loading", text: "Memeriksa status reset, kesiapan backup, dan seluruh data testing..." });
    try {
      const [status, integrations] = await Promise.all([resetStatusResource.reload(), integrationsResource.reload()]);
      if (recoveryToken && status?.outcome === "committed") {
        setPreview(null);
        await refreshAfterCommittedReset(status);
        return;
      }
      if (resetOperationBlocked(status)) {
        setPreview(null);
        setResult({ status: "danger", text: "Pembersihan baru diblokir sampai status operasi sebelumnya dan mode pemulihan dipastikan aman." });
        return;
      }
      const currentDriveReadiness = integrationProviderPresentation(integrations || {}, "drive");
      const data = await runSettingsAction("reset.preview", { resetScope }, { force: true });
      setPreview(data);
      setResult(resetPreviewResult(data, currentDriveReadiness));
    } catch (error) {
      setPreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setPreviewBusy(false);
    }
  };

  return { preview, setPreview, previewBusy, loadPreview };
};

const handleResetApplyError = async ({
  error, clearRecovery, resetStatusResource, setConfirmationOpen, setPreview, setResult, setApplyError, handleCheckedStatus,
}) => {
  if (isSettingsOutcomeUnknownError(error)) {
    setConfirmationOpen(false);
    setPreview(null);
    setResult({ status: "warning", text: "Hasil pembersihan belum dapat dipastikan. Jangan kirim ulang. Gunakan Periksa status operasi untuk merekonsiliasi hasilnya." });
    resetStatusResource.reload().catch(() => {});
    return;
  }
  clearRecovery();
  const checkedStatus = await resetStatusResource.reload().catch(() => null);
  if (checkedStatus?.outcome === "recovery_required" || checkedStatus?.maintenanceMode) {
    setConfirmationOpen(false);
    setPreview(null);
    await handleCheckedStatus(checkedStatus);
    return;
  }
  if (["RESET_PREVIEW_CHANGED", "RESET_NOTHING_TO_CLEAN"].includes(error?.code)) {
    setConfirmationOpen(false);
    setPreview(null);
    setResult({ status: "warning", text: `${error.message} Periksa data testing lagi sebelum melanjutkan.` });
    return;
  }
  setApplyError(error);
  setResult({ status: "danger", text: error.message });
};

const useResetApply = ({
  preview, setPreview, resetStatusResource, integrationsResource, clearRecovery, setRecoveryToken,
  invalidate, refreshAll, handleCheckedStatus, setResult,
}) => {
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const applyReset = async (reason, confirmationState) => {
    if (!preview) return;
    setApplyBusy(true);
    setApplyError(null);
    const idempotencyKey = createSecureRandomId();
    const recovery = { idempotencyKey, createdAt: new Date().toISOString() };
    const payload = {
      previewFingerprint: preview.previewFingerprint,
      resetScope: preview.resetScope,
      confirmation: confirmationState.confirmation,
      acknowledged: confirmationState.acknowledged,
      reason,
    };
    try {
      const [status, integrations] = await Promise.all([resetStatusResource.reload(), integrationsResource.reload()]);
      const blocked = status?.canStartNewIntent === false || status?.outcome === "processing" || status?.outcome === "recovery_required" || status?.maintenanceMode;
      if (blocked) throw new Error("Pembersihan baru diblokir karena operasi sebelumnya belum aman untuk dilanjutkan.");
      const currentDriveReadiness = integrationProviderPresentation(integrations || {}, "drive");
      if (!currentDriveReadiness.ready) throw new Error(`Safety backup Google Drive belum siap. ${currentDriveReadiness.text}`);
      storeMaintenanceRecoveryToken(RESET_RECOVERY_STORAGE_KEY, recovery);
      setRecoveryToken(recovery);
      const data = await runSettingsAction("reset.apply", payload, { idempotencyKey, newIntent: true });
      clearRecovery();
      setConfirmationOpen(false);
      setPreview(null);
      invalidate(RESET_INVALIDATIONS);
      await Promise.allSettled([refreshAll(), integrationsResource.reload(), resetStatusResource.reload()]);
      setResult({
        status: "success",
        text: `Pembersihan selesai. ${formatCount(data.summary?.totalRows)} baris data testing dihapus${data.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES ? " dan seluruh saldo rekening pada preview dikembalikan ke Rp0" : ""} setelah backup keamanan dan pemeriksaan konsistensi data. Rekening, kategori, pengguna, audit, dan data pemulihan tetap dipertahankan.`,
        fileLink: data.safetyBackupFileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.safetyBackupFileId)}` : null,
      });
    } catch (error) {
      await handleResetApplyError({ error, clearRecovery, resetStatusResource, setConfirmationOpen, setPreview, setResult, setApplyError, handleCheckedStatus });
    } finally {
      setApplyBusy(false);
    }
  };

  return { applyBusy, applyError, setApplyError, confirmationOpen, setConfirmationOpen, applyReset };
};

const ResetStatusFailure = ({ resource, status, onCheck }) => ((resource.status === "error" || resource.refreshError) && !resetStatusPresentation(status) ? (
  <div className="notice notice--danger" role="alert"><FiAlertTriangle aria-hidden="true" /><span><strong>Status reset belum dapat diverifikasi.</strong> Pembersihan tetap diblokir. Periksa status operasi sebelum membuat preview atau memulai pembersihan baru.</span><Button type="button" icon={FiRefreshCw} loading={resource.isRefreshing} onClick={onCheck}>Periksa status operasi</Button></div>
) : null);

const ResetScopeSelector = ({ resetScope, setResetScope, setPreview, setResult }) => {
  const selectScope = (scope) => { setResetScope(scope); setPreview(null); setResult(null); };
  return (
    <fieldset className={styles.resetScopeSelector}>
      <legend>Pilih hasil akhir reset testing</legend>
      <label className={resetScope === RESET_SCOPE_ACTIVITY ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={RESET_SCOPE_ACTIVITY} checked={resetScope === RESET_SCOPE_ACTIVITY} onChange={() => selectScope(RESET_SCOPE_ACTIVITY)} />
        <span className={styles.resetScopeIcon}><FiRefreshCw aria-hidden="true" /></span>
        <span><strong>Bersihkan aktivitas testing</strong><small>Hapus riwayat keuangan dan perencanaan testing. Rekening, kategori, dan saldo awal tetap.</small></span>
      </label>
      <label className={resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={RESET_SCOPE_ACTIVITY_AND_BALANCES} checked={resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES} onChange={() => selectScope(RESET_SCOPE_ACTIVITY_AND_BALANCES)} />
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

const resetDriveState = (integrationsResource) => {
  const readiness = integrationProviderPresentation(integrationsResource.data || {}, "drive");
  return {
    readiness,
    ready: integrationsResource.status === "ready" && !integrationsResource.refreshError && readiness.ready,
  };
};

const resetStatusState = (resetStatusResource) => {
  const status = resetStatusResource.data || null;
  const verified = resetStatusResource.status === "ready" && !resetStatusResource.refreshError;
  return { status, blocked: !verified || resetOperationBlocked(status) };
};

const previewHasResettableData = (preview) => {
  if (!preview) return false;
  if (Number(preview.summary?.totalRows || 0) > 0) return true;
  return Number(preview.balanceReset?.accountsAffected || 0) > 0;
};

const ResetDataPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const [resetScope, setResetScope] = useState(RESET_SCOPE_ACTIVITY);
  const [recoveryToken, setRecoveryToken] = useState(() => readMaintenanceRecoveryToken(RESET_RECOVERY_STORAGE_KEY));
  const integrationsResource = useApiResource("integrations.status", {}, { enabled: ownerMode });
  const resetStatusResource = useApiResource("reset.status", recoveryToken ? { idempotencyKey: recoveryToken.idempotencyKey } : {}, { enabled: ownerMode });
  const recovery = useResetRecovery({ setRecoveryToken, integrationsResource, resetStatusResource, invalidate, refreshAll });
  const previewState = useResetPreview({ recoveryToken, resetScope, resetStatusResource, integrationsResource, refreshAfterCommittedReset: recovery.refreshAfterCommittedReset, setResult: recovery.setResult });
  const apply = useResetApply({ preview: previewState.preview, setPreview: previewState.setPreview, resetStatusResource, integrationsResource, clearRecovery: recovery.clearRecovery, setRecoveryToken, invalidate, refreshAll, handleCheckedStatus: recovery.handleCheckedStatus, setResult: recovery.setResult });

  const drive = resetDriveState(integrationsResource);
  const resetState = resetStatusState(resetStatusResource);
  const canOpenReset = previewHasResettableData(previewState.preview) && drive.ready && !previewState.previewBusy && !resetState.blocked;

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="reset-data-title">
        <div className={`${styles.pageHeading} ${styles.resetPageHeading}`}><h2 id="reset-data-title">Reset data testing</h2><p>Pilih apakah hanya riwayat testing yang dibersihkan atau sekaligus mengembalikan nominal saldo rekening ke Rp0. Rekening, kategori, pengguna, audit, dan data pemulihan tetap dipertahankan.</p></div>
        <div className={styles.resetResultNotice}><SettingsNotice result={recovery.result} /></div>
        <ResetRecoveryPanel status={resetState.status} statusBusy={resetStatusResource.status === "loading" || resetStatusResource.isRefreshing} onCheck={recovery.checkResetStatus} onReloadPreview={previewState.loadPreview} />
        <MaintenanceRecoveryPanel maintenanceMode={Boolean(resetState.status?.maintenanceMode)} busy={recovery.recoveryBusy} onRecover={recovery.recoverMaintenance} description="Reset sebelumnya meninggalkan mode pemulihan aktif. Pemeriksaan konsistensi data wajib lulus sebelum perubahan data dibuka kembali." />
        <ResetStatusFailure resource={resetStatusResource} status={resetState.status} onCheck={recovery.checkResetStatus} />
        <div className={styles.resetGuardNotice} role="note"><FiShield aria-hidden="true" /><span><strong>Mode sebelum data nyata.</strong> Gunakan hanya ketika seluruh data keuangan masih berupa data testing. Setelah transaksi nyata digunakan, jangan gunakan pembersihan massal.</span></div>
        <ResetScopeSelector resetScope={resetScope} setResetScope={setResetScope} setPreview={previewState.setPreview} setResult={recovery.setResult} />
        <ResetStepCards previewState={previewState} statusBlocksReset={resetState.blocked} integrationsResource={integrationsResource} driveReadiness={drive.readiness} driveReady={drive.ready} canOpenReset={canOpenReset} apply={apply} />
        <ResetConfirmationModal preview={previewState.preview} open={apply.confirmationOpen} busy={apply.applyBusy} error={apply.applyError} onCancel={() => { if (!apply.applyBusy) { apply.setConfirmationOpen(false); apply.setApplyError(null); } }} onConfirm={apply.applyReset} />
      </section>
    </OwnerSettingsGuard>
  );
};

export default ResetDataPage;
