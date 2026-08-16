import { useState } from "react";
import { FiAlertTriangle, FiCalendar, FiFileText, FiHardDrive, FiRefreshCw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { runSettingsAction } from "./settings.api.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { integrationProviderPresentation, providerSummary } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const formatDateTimeJakarta = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value || "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
};

const providerActivityText = (provider) => {
  if (provider.lastCompletedAt) return `Terakhir selesai ${formatDateTimeJakarta(provider.lastCompletedAt)}`;
  if (provider.lastUpdatedAt) return `Aktivitas ${formatDateTimeJakarta(provider.lastUpdatedAt)}`;
  return "Belum pernah diproses";
};

const providerQueueText = (provider) => {
  if (!(provider.pending || provider.processing || provider.failed || provider.deadLetter)) return "";
  return `Menunggu ${provider.pending} · proses ${provider.processing} · gagal ${provider.failed + provider.deadLetter}`;
};

const driveBackupActivity = (backup) => {
  if (!backup) return { activity: "Belum ada backup teknis yang tercatat.", detail: "Safety backup akan dicatat setelah operasi backup pertama berhasil atau gagal." };
  const statusLabels = { verified: "Terverifikasi", completed: "Selesai", pending: "Sedang diproses", failed: "Gagal" };
  const at = backup.verifiedAt || backup.createdAt;
  return {
    activity: `${statusLabels[backup.status] || backup.status} · ${formatDateTimeJakarta(at)}`,
    detail: `${backup.fileName || "Backup teknis"}${backup.errorCode ? ` · ${backup.errorCode}` : ""}`,
  };
};

const syncSuccessText = (action) => {
  if (action === "mirror.rebuild") return "Pembangunan ulang mirror sudah masuk antrean.";
  if (action === "mirror.sync") return "Sinkronisasi Google Sheets sudah masuk antrean.";
  return "Sinkronisasi dan rekonsiliasi Google Calendar sudah masuk antrean.";
};

const IntegrationTile = ({ icon: Icon, label, description, provider, readiness, activityText = null, detailText = "", showReadinessDetail = true }) => {
  const queueText = providerQueueText(provider);
  return <article className={styles.serviceTile} aria-label={`Status integrasi ${label}`}>
    <span className={styles.serviceIcon}><Icon aria-hidden="true" /></span>
    <span className={styles.serviceCopy}>
      <h3>{label}</h3>
      <p>{description}</p>
      <small>{activityText || providerActivityText(provider)}</small>
      {detailText ? <small>{detailText}</small> : null}
      {queueText ? <small>{queueText}</small> : null}
      {!readiness.ready && showReadinessDetail ? <small>{readiness.text}</small> : null}
      {readiness.errorCode && showReadinessDetail ? <small>Kode diagnosis: {readiness.errorCode}</small> : null}
    </span>
    <span className={`status-badge status-badge--${readiness.tone}`}>{readiness.label}</span>
  </article>;
};

const GoogleIntegrationActions = ({ busyAction, sheetsReadiness, calendarReadiness, run, openRebuild }) => <div className={styles.serviceActions}>
  <Button type="button" disabled={Boolean(busyAction) || !sheetsReadiness.ready} onClick={() => run("mirror.sync")}>Sinkronkan Sheets sekarang</Button>
  <Button type="button" disabled={Boolean(busyAction) || !calendarReadiness.ready} onClick={() => run("calendar.sync")}>Sinkronkan Calendar sekarang</Button>
  <Button type="button" disabled={Boolean(busyAction) || !sheetsReadiness.ready} onClick={openRebuild}>Bangun ulang mirror Sheets</Button>
</div>;

const GoogleIntegrationsPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const resource = useApiResource("integrations.status");
  const [result, setResult] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const integrations = resource.data || {};
  const sheets = providerSummary(integrations, "sheets");
  const calendar = providerSummary(integrations, "calendar");
  const drive = providerSummary(integrations, "drive");
  const driveActivity = driveBackupActivity(integrations.driveBackup);
  const sheetsReadiness = integrationProviderPresentation(integrations, "sheets");
  const calendarReadiness = integrationProviderPresentation(integrations, "calendar");
  const driveReadiness = integrationProviderPresentation(integrations, "drive");
  const bridgeWideFailure = integrations.bridge?.checked === true && integrations.bridge?.reachable === false;
  const bridgeFailure = bridgeWideFailure ? driveReadiness : null;

  const run = async (action) => {
    setBusyAction(action);
    setResult({ status: "loading", text: "Mengirim permintaan sinkronisasi..." });
    try {
      await runSettingsAction(action, {}, {});
      setResult({ status: "success", text: syncSuccessText(action) });
      setRebuildOpen(false);
      await Promise.allSettled([resource.reload()]);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className={styles.pageContent} aria-labelledby="google-integrations-title">
      <RefreshWarning error={resource.refreshError} />
      <div className={styles.pageHeading}><h2 id="google-integrations-title">Integrasi Google</h2></div>
      <SettingsNotice result={result} />
      {bridgeFailure ? (
        <div className="notice notice--danger" role="alert">
          <FiAlertTriangle aria-hidden="true" />
          <span>
            <strong>Bridge Google belum sehat.</strong> {bridgeFailure.text}
            {bridgeFailure.errorCode ? <small>Kode diagnosis: {bridgeFailure.errorCode}</small> : null}
          </span>
          <Button type="button" icon={FiRefreshCw} loading={resource.isRefreshing} onClick={resource.reload}>Periksa ulang</Button>
        </div>
      ) : (
        <div className={styles.serviceActions}>
          <Button type="button" icon={FiRefreshCw} loading={resource.isRefreshing} disabled={resource.status === "loading"} onClick={resource.reload}>Periksa ulang integrasi</Button>
        </div>
      )}
      <div className={styles.serviceGrid}>
        <IntegrationTile icon={FiFileText} label="Google Sheets" description="Salinan data baca." provider={sheets} readiness={sheetsReadiness} showReadinessDetail={!bridgeWideFailure} />
        <IntegrationTile icon={FiCalendar} label="Google Calendar" description="Pengingat jadwal." provider={calendar} readiness={calendarReadiness} showReadinessDetail={!bridgeWideFailure} />
        <IntegrationTile icon={FiHardDrive} label="Google Drive" description="Safety backup untuk reset, restore, import, dan recovery." provider={drive} readiness={driveReadiness} activityText={driveActivity.activity} detailText={driveActivity.detail} showReadinessDetail={!bridgeWideFailure} />
      </div>
      {ownerMode ? <GoogleIntegrationActions busyAction={busyAction} sheetsReadiness={sheetsReadiness} calendarReadiness={calendarReadiness} run={run} openRebuild={() => setRebuildOpen(true)} /> : null}
      <ConfirmationModal
        open={rebuildOpen}
        title="Bangun ulang mirror Google Sheets?"
        description="Salinan Google Sheets akan dibangun ulang. Saldo dan transaksi tidak berubah."
        confirmLabel="Bangun ulang mirror"
        busy={busyAction === "mirror.rebuild"}
        onCancel={() => !busyAction && setRebuildOpen(false)}
        onConfirm={() => run("mirror.rebuild")}
      />
    </section>
  );
};

export default GoogleIntegrationsPage;
