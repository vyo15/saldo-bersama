import { useState } from "react";
import { FiCalendar, FiFileText } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { runSettingsAction } from "./settings.api.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { providerSummary } from "./settingsPresentation.js";
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

  const run = async (action) => {
    setBusyAction(action);
    setResult({ status: "loading", text: "Mengirim permintaan sinkronisasi..." });
    try {
      await runSettingsAction(action, {}, { idempotencyKey: createIdempotencyKey() });
      setResult({
        status: "success",
        text: action === "mirror.rebuild"
          ? "Pembangunan ulang mirror sudah masuk antrean."
          : action === "mirror.sync" ? "Sinkronisasi Google Sheets sudah masuk antrean." : "Sinkronisasi dan rekonsiliasi Google Calendar sudah masuk antrean.",
      });
      setRebuildOpen(false);
      await resource.reload();
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setBusyAction("");
    }
  };

  const handleTile = (provider) => {
    const configured = integrations.configured?.[provider];
    if (!configured) {
      setResult({ status: "warning", text: "Integrasi Google belum aktif pada runtime ini. Konfigurasi bridge dikelola terpusat di environment server dan tidak diisi ulang pada browser atau perangkat." });
      return;
    }
    if (!ownerMode) {
      setResult({ status: "warning", text: "Hanya pemilik yang dapat menjalankan sinkronisasi. Anggota tetap dapat melihat status integrasi." });
      return;
    }
    run(provider === "sheets" ? "mirror.sync" : "calendar.sync");
  };

  return (
    <section className={styles.pageContent} aria-labelledby="google-integrations-title">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <div className={styles.pageHeading}>
        <p className="eyebrow">Integrasi Google</p>
        <h2 id="google-integrations-title">Google Sheets dan Google Calendar</h2>
        <p>Turso tetap menjadi sumber data resmi. Sheets hanya mirror baca dan Calendar hanya pengingat. Konfigurasi secret tetap berada di server.</p>
      </div>
      <SettingsNotice result={result} />
      <div className={styles.serviceGrid}>
        <button type="button" className={styles.serviceTile} onClick={() => handleTile("sheets")} disabled={Boolean(busyAction)} aria-label="Kelola integrasi Google Sheets">
          <span className={styles.serviceIcon}><FiFileText aria-hidden="true" /></span>
          <span className={styles.serviceCopy}>
            <h3>Google Sheets</h3>
            <p>Mirror baca. Edit manual tidak mengubah saldo resmi.</p>
            <small>{sheets.lastUpdatedAt || "Belum pernah diproses"} · antrean {sheets.pending} · selesai {sheets.completed}</small>
          </span>
          <span className={`status-badge status-badge--${integrations.configured?.sheets ? "active" : "warning"}`}>{integrations.configured?.sheets ? "Siap" : "Belum siap"}</span>
        </button>
        <button type="button" className={styles.serviceTile} onClick={() => handleTile("calendar")} disabled={Boolean(busyAction)} aria-label="Kelola integrasi Google Calendar">
          <span className={styles.serviceIcon}><FiCalendar aria-hidden="true" /></span>
          <span className={styles.serviceCopy}>
            <h3>Google Calendar</h3>
            <p>Pengingat jadwal. Status dibayar tetap berasal dari ledger.</p>
            <small>{calendar.lastUpdatedAt || "Belum pernah diproses"} · antrean {calendar.pending} · selesai {calendar.completed}</small>
          </span>
          <span className={`status-badge status-badge--${integrations.configured?.calendar ? "active" : "warning"}`}>{integrations.configured?.calendar ? "Siap" : "Belum siap"}</span>
        </button>
      </div>
      {ownerMode && integrations.configured?.sheets ? (
        <div className={styles.serviceActions}>
          <Button type="button" disabled={Boolean(busyAction)} onClick={() => setRebuildOpen(true)}>Bangun ulang mirror Sheets</Button>
        </div>
      ) : null}
      <ConfirmationModal
        open={rebuildOpen}
        title="Bangun ulang mirror Google Sheets?"
        description="Semua baris mirror akan dibangun ulang dari data resmi Turso. Proses ini tidak mengubah saldo atau transaksi di Turso."
        confirmLabel="Bangun ulang mirror"
        busy={busyAction === "mirror.rebuild"}
        onCancel={() => !busyAction && setRebuildOpen(false)}
        onConfirm={() => run("mirror.rebuild")}
      />
    </section>
  );
};

export default GoogleIntegrationsPage;
