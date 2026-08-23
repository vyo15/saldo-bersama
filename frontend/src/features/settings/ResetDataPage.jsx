import { useState } from "react";
import { FiShield } from "react-icons/fi";
import { useFinance } from "../../app/FinanceContext.jsx";
import { createSecureRandomId } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import MaintenanceRecoveryPanel from "./MaintenanceRecoveryPanel.jsx";
import { ResetConfirmationModal, ResetRecoveryPanel, ResetScopeSelector, ResetStatusFailure, ResetStepCards } from "./components/TrialResetPanels.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { isSettingsOutcomeUnknownError, runSettingsAction } from "./settings.api.js";
import { formatMaintenanceCount as formatCount, readMaintenanceRecoveryToken, storeMaintenanceRecoveryToken, integrationProviderPresentation } from "./settingsPresentation.js";
import { useMaintenanceRecovery } from "./useMaintenanceRecovery.js";
import styles from "./Settings.module.css";

const RESET_INVALIDATIONS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "transactions.list",
  "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly",
  "reconciliations.list", "periods.list", "archive.list", "audit.list", "integrations.status", "reset.status",
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

const useResetRecovery = ({ setRecoveryToken, integrationsResource, resetStatusResource, invalidate, refreshAll }) => {
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

  const { recoveryBusy, recoverMaintenance } = useMaintenanceRecovery({
    invalidate,
    setResult,
    loadingText: "Memeriksa konsistensi data sebelum membuka kembali perubahan...",
    issueText: (count) => `Mode pemulihan tetap aktif. Pemeriksaan konsistensi menemukan ${count} masalah yang harus diselesaikan.`,
    successText: (maintenanceCleared) => maintenanceCleared
      ? "Pemeriksaan konsistensi lulus dan perubahan data berhasil dibuka kembali."
      : "Pemeriksaan konsistensi lulus. Mode pemulihan sudah tidak aktif.",
    onSuccess: async () => handleCheckedStatus(await resetStatusResource.reload()),
  });

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
        <ResetScopeSelector resetScope={resetScope} activityScope={RESET_SCOPE_ACTIVITY} activityAndBalancesScope={RESET_SCOPE_ACTIVITY_AND_BALANCES} setResetScope={setResetScope} setPreview={previewState.setPreview} setResult={recovery.setResult} />
        <ResetStepCards previewState={previewState} statusBlocksReset={resetState.blocked} integrationsResource={integrationsResource} driveReadiness={drive.readiness} driveReady={drive.ready} canOpenReset={canOpenReset} apply={apply} />
        <ResetConfirmationModal preview={previewState.preview} resetBalances={previewState.preview?.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES} acknowledgementItems={previewState.preview?.resetScope === RESET_SCOPE_ACTIVITY_AND_BALANCES ? RESET_BALANCE_ACKNOWLEDGEMENTS : RESET_ACKNOWLEDGEMENTS} open={apply.confirmationOpen} busy={apply.applyBusy} error={apply.applyError} onCancel={() => { if (!apply.applyBusy) { apply.setConfirmationOpen(false); apply.setApplyError(null); } }} onConfirm={apply.applyReset} />
      </section>
    </OwnerSettingsGuard>
  );
};

export default ResetDataPage;
