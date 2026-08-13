import { useState } from "react";
import { FiCalendar, FiFileText, FiHardDrive } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { runSettingsAction } from "./settings.api.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { integrationProviderPresentation, providerSummary } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const providerActivityText = (provider) => {
  if (provider.lastCompletedAt) return `Terakhir ${provider.lastCompletedAt}`;
  if (provider.lastUpdatedAt) return `Aktivitas ${provider.lastUpdatedAt}`;
  return "Belum pernah diproses";
};

const providerQueueText = (provider) => {
  if (!(provider.pending || provider.processing || provider.failed || provider.deadLetter)) return "";
  return `Menunggu ${provider.pending} · proses ${provider.processing} · gagal ${provider.failed + provider.deadLetter}`;
};

const syncSuccessText = (action) => {
  if (action === "mirror.rebuild") return "Pembangunan ulang mirror sudah masuk antrean.";
  if (action === "mirror.sync") return "Sinkronisasi Google Sheets sudah masuk antrean.";
  return "Sinkronisasi dan rekonsiliasi Google Calendar sudah masuk antrean.";
};

const IntegrationTile = ({ icon: Icon, label, description, provider, readiness }) => {
  const queueText = providerQueueText(provider);
  return <article className={styles.serviceTile} aria-label={`Status integrasi ${label}`}>
    <span className={styles.serviceIcon}><Icon aria-hidden="true" /></span>
    <span className={styles.serviceCopy}>
      <h3>{label}</h3>
      <p>{description}</p>
      <small>{providerActivityText(provider)}</small>
      {queueText ? <small>{queueText}</small> : null}
      {!readiness.ready ? <small>{readiness.text}</small> : null}
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
  const sheetsReadiness = integrationProviderPresentation(integrations, "sheets");
  const calendarReadiness = integrationProviderPresentation(integrations, "calendar");
  const driveReadiness = integrationProviderPresentation(integrations, "drive");

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
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <div className={styles.pageHeading}><h2 id="google-integrations-title">Integrasi Google</h2></div>
      <SettingsNotice result={result} />
      <div className={styles.serviceGrid}>
        <IntegrationTile icon={FiFileText} label="Google Sheets" description="Salinan data baca." provider={sheets} readiness={sheetsReadiness} />
        <IntegrationTile icon={FiCalendar} label="Google Calendar" description="Pengingat jadwal." provider={calendar} readiness={calendarReadiness} />
        <IntegrationTile icon={FiHardDrive} label="Google Drive" description="Safety backup untuk reset, restore, dan operasi recovery." provider={drive} readiness={driveReadiness} />
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
