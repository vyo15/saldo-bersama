import { FiShield } from "react-icons/fi";
import { useState } from "react";
import { useFinance } from "../../app/FinanceContext.jsx";
import { createSecureRandomId } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { FullResetConfirmation, FullResetStatusPanels, FullResetSteps } from "./components/FullResetPanels.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { isSettingsOutcomeUnknownError, runSettingsAction } from "./settings.api.js";
import { formatMaintenanceCount as formatCount, readMaintenanceRecoveryToken, storeMaintenanceRecoveryToken, integrationProviderPresentation } from "./settingsPresentation.js";
import { useMaintenanceRecovery } from "./useMaintenanceRecovery.js";
import styles from "./Settings.module.css";

const FULL_RESET_RECOVERY_STORAGE_KEY = "saldo-bersama:full-reset-recovery";

const FULL_RESET_INVALIDATIONS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
  "investments.overview", "investments.instruments.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list",
  "reports.monthly", "reconciliations.list", "periods.list", "archive.list", "audit.list",
  "notifications.status", "notifications.preferences", "reminders.get", "masterDataRequests.list", "transferRequests.list", "integrations.status", "reset.status",
  "fullReset.status", "users.list", "system.health",
]);

const FULL_RESET_ACKNOWLEDGEMENTS = Object.freeze([
  "Saya memahami semua rekening dan kategori pada preview akan dihapus.",
  "Saya memahami seluruh saldo, transaksi, perencanaan, dan riwayat keuangan aplikasi akan dikosongkan.",
  "Saya sudah memastikan safety backup Google Drive terverifikasi sebelum reset dijalankan.",
  "Saya memahami pemulihan data setelah full reset hanya dapat dilakukan melalui backup yang valid.",
]);

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
          acknowledgementItems={FULL_RESET_ACKNOWLEDGEMENTS}
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
