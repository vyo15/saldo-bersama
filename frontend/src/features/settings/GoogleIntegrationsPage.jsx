import { useState } from "react";
import { FiCalendar, FiFileText } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { runSettingsAction } from "./settings.api.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { integrationProviderPresentation, providerSummary } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

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
  const sheetsReadiness = integrationProviderPresentation(integrations, "sheets");
  const calendarReadiness = integrationProviderPresentation(integrations, "calendar");

  const run = async (action) => {
    setBusyAction(action);
    setResult({ status: "loading", text: "Mengirim permintaan sinkronisasi..." });
    try {
      await runSettingsAction(action, {}, {});
      setResult({
        status: "success",
        text: action === "mirror.rebuild"
          ? "Pembangunan ulang mirror sudah masuk antrean."
          : action === "mirror.sync" ? "Sinkronisasi Google Sheets sudah masuk antrean." : "Sinkronisasi dan rekonsiliasi Google Calendar sudah masuk antrean.",
      });
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
      <div className={styles.pageHeading}>
        <h2 id="google-integrations-title">Integrasi Google</h2>
      </div>
      <SettingsNotice result={result} />
      <div className={styles.serviceGrid}>
        <article className={styles.serviceTile} aria-label="Status integrasi Google Sheets">
          <span className={styles.serviceIcon}><FiFileText aria-hidden="true" /></span>
          <span className={styles.serviceCopy}>
            <h3>Google Sheets</h3>
            <p>Salinan data baca.</p>
            <small>{sheets.lastCompletedAt ? `Terakhir ${sheets.lastCompletedAt}` : sheets.lastUpdatedAt ? `Aktivitas ${sheets.lastUpdatedAt}` : "Belum pernah diproses"}</small>
            {sheets.pending || sheets.processing || sheets.failed || sheets.deadLetter ? <small>Menunggu {sheets.pending} · proses {sheets.processing} · gagal {sheets.failed + sheets.deadLetter}</small> : null}
            {!sheetsReadiness.ready ? <small>{sheetsReadiness.text}</small> : null}
          </span>
          <span className={`status-badge status-badge--${sheetsReadiness.tone}`}>{sheetsReadiness.label}</span>
        </article>
        <article className={styles.serviceTile} aria-label="Status integrasi Google Calendar">
          <span className={styles.serviceIcon}><FiCalendar aria-hidden="true" /></span>
          <span className={styles.serviceCopy}>
            <h3>Google Calendar</h3>
            <p>Pengingat jadwal.</p>
            <small>{calendar.lastCompletedAt ? `Terakhir ${calendar.lastCompletedAt}` : calendar.lastUpdatedAt ? `Aktivitas ${calendar.lastUpdatedAt}` : "Belum pernah diproses"}</small>
            {calendar.pending || calendar.processing || calendar.failed || calendar.deadLetter ? <small>Menunggu {calendar.pending} · proses {calendar.processing} · gagal {calendar.failed + calendar.deadLetter}</small> : null}
            {!calendarReadiness.ready ? <small>{calendarReadiness.text}</small> : null}
          </span>
          <span className={`status-badge status-badge--${calendarReadiness.tone}`}>{calendarReadiness.label}</span>
        </article>
      </div>
      {ownerMode ? (
        <div className={styles.serviceActions}>
          <Button type="button" disabled={Boolean(busyAction) || !sheetsReadiness.ready} onClick={() => run("mirror.sync")}>Sinkronkan Sheets sekarang</Button>
          <Button type="button" disabled={Boolean(busyAction) || !calendarReadiness.ready} onClick={() => run("calendar.sync")}>Sinkronkan Calendar sekarang</Button>
          <Button type="button" disabled={Boolean(busyAction) || !sheetsReadiness.ready} onClick={() => setRebuildOpen(true)}>Bangun ulang mirror Sheets</Button>
        </div>
      ) : null}
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
