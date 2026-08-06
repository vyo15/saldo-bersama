import { useCallback, useEffect, useState } from "react";
import {
  FiArchive, FiBell, FiCalendar, FiCheckCircle, FiDatabase, FiDownload, FiDownloadCloud, FiFileText,
  FiLock, FiRefreshCw, FiRotateCcw, FiShield, FiUploadCloud, FiUnlock, FiUserMinus, FiUsers,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { deactivateUser, downloadFinanceExcel, reactivateUser, reopenPeriod as requestReopenPeriod, runSettingsAction } from "./settings.api.js";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  testPushNotification,
} from "../../services/notifications.js";
import { readTransactionImportFile } from "../../services/importer.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { accountDisplayLabel } from "../accounts/accountPresentation.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { currentMonthInJakarta, previousMonthInJakarta } from "../../domain/dates.js";

const providerSummary = (integration, provider) => {
  const item = integration?.providers?.[provider] || {};
  const pending = Number(item.pending || 0) + Number(item.processing || 0) + Number(item.failed || 0);
  return { pending, completed: Number(item.completed || 0), lastUpdatedAt: item.lastUpdatedAt || null };
};


const pushPresentation = (state) => {
  if (state.status === "loading") return { text: "Memeriksa kesiapan perangkat dan server...", tone: "info", label: "Memeriksa", canEnable: false };
  const presentations = {
    ready_tested: { text: "Perangkat terdaftar dan pengiriman uji sudah diterima layanan push.", tone: "active", label: "Aktif", canEnable: false },
    ready_unverified: { text: "Perangkat terdaftar. Kirim notifikasi uji untuk memeriksa jalur pengiriman.", tone: "warning", label: "Belum diuji", canEnable: false },
    not_subscribed: { text: "Belum aktif pada perangkat ini.", tone: "neutral", label: "Belum aktif", canEnable: true },
    registration_required: { text: "Subscription browser ada, tetapi perlu didaftarkan ulang ke server.", tone: "warning", label: "Daftar ulang", canEnable: true },
    vapid_key_changed: { text: "Kunci Web Push berubah. Daftarkan ulang perangkat ini.", tone: "warning", label: "Daftar ulang", canEnable: true },
    account_conflict: { text: "Subscription browser masih terkait akun lain. Daftarkan ulang untuk akun ini.", tone: "warning", label: "Daftar ulang", canEnable: true },
    unsupported: { text: "Browser ini belum mendukung Web Push.", tone: "danger", label: "Tidak didukung", canEnable: false },
    insecure_context: { text: "Notifikasi memerlukan HTTPS. Pengujian lokal dapat memakai localhost, bukan alamat IP jaringan.", tone: "danger", label: "Perlu HTTPS", canEnable: false },
    ios_install_required: { text: "Pada iPhone atau iPad, tambahkan aplikasi ke Home Screen lalu buka dari ikon aplikasi.", tone: "warning", label: "Pasang aplikasi", canEnable: false },
    permission_denied: { text: "Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan browser atau perangkat.", tone: "danger", label: "Izin diblokir", canEnable: false },
    client_not_configured: { text: "Notifikasi belum diaktifkan pada deployment ini. Konfigurasikan Web Push lalu deploy ulang.", tone: "danger", label: "Belum siap", canEnable: false },
    client_configuration_invalid: { text: "VAPID public key pada frontend tidak valid.", tone: "danger", label: "Konfigurasi salah", canEnable: false },
    server_not_configured: { text: "Konfigurasi Web Push belum tersedia pada server Production.", tone: "danger", label: "Server belum siap", canEnable: false },
    server_configuration_invalid: { text: "Konfigurasi Web Push pada server belum lengkap atau tidak valid.", tone: "danger", label: "Konfigurasi salah", canEnable: false },
    server_status_unavailable: { text: "Status Web Push pada server belum dapat diverifikasi.", tone: "danger", label: "Tidak terverifikasi", canEnable: false },
  };
  return presentations[state.reason] || { text: "Status notifikasi belum dapat ditentukan.", tone: "danger", label: "Tidak diketahui", canEnable: false };
};

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap, refreshAll, invalidate } = useFinance();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const auditResource = useApiResource("audit.list", { limit: 50 }, { enabled: ownerMode });
  const healthResource = useApiResource("system.health");
  const integrationResource = useApiResource("integrations.status");
  const periodsResource = useApiResource("periods.list", {}, { enabled: ownerMode });
  const archiveResource = useApiResource("archive.list", {}, { enabled: ownerMode });
  const [result, setResult] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importConfirmation, setImportConfirmation] = useState("");
  const [restoreFileId, setRestoreFileId] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [memberForm, setMemberForm] = useState({ email: "", name: "", role: "member" });
  const [periodForm, setPeriodForm] = useState({ period_key: previousMonthInJakarta(), reason: "Review dan rekonsiliasi selesai" });
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateState, setDeactivateState] = useState({ status: "idle", error: null });
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenState, setReopenState] = useState({ status: "idle", error: null });
  const [reactivateTarget, setReactivateTarget] = useState(null);
  const [reactivateState, setReactivateState] = useState({ status: "idle", error: null });
  const [restoreArchiveTarget, setRestoreArchiveTarget] = useState(null);
  const [restoreArchiveState, setRestoreArchiveState] = useState({ status: "idle", error: null });
  const [periodClosePreview, setPeriodClosePreview] = useState(null);
  const [periodCloseState, setPeriodCloseState] = useState({ status: "idle", error: null });
  const [pushState, setPushState] = useState({ status: "loading", supported: true, permission: "default", enabled: false, reason: "loading", browserSubscribed: false });
  const [exporting, setExporting] = useState(false);

  const refreshPushState = useCallback(async () => {
    try {
      const next = await getPushNotificationState();
      setPushState({ status: "ready", ...next });
      return next;
    } catch (error) {
      setPushState({ status: "error", supported: true, permission: "unknown", enabled: false, reason: "server_status_unavailable", browserSubscribed: false, error });
      return null;
    }
  }, []);
  useEffect(() => { refreshPushState(); }, [refreshPushState]);

  const backendStatus = healthResource.status === "error"
    ? { label: "Tidak tersedia", tone: "danger" }
    : healthResource.status !== "ready"
      ? { label: "Memeriksa", tone: "info" }
      : healthResource.data?.maintenanceMode || healthResource.data?.status === "maintenance"
        ? { label: "Maintenance", tone: "danger" }
        : healthResource.data?.status === "ok" && Number(healthResource.data?.schemaVersion || 0) > 0
          ? { label: "Siap", tone: "active" }
          : { label: "Tidak terverifikasi", tone: "warning" };
  const backendSummary = healthResource.status === "error"
    ? "Status backend tidak dapat dimuat."
    : healthResource.status !== "ready"
      ? "Memeriksa database dan schema..."
      : `${healthResource.data?.status === "maintenance" || healthResource.data?.maintenanceMode
        ? "Mode maintenance"
        : healthResource.data?.status === "ok" ? "Database tersambung" : "Status backend tidak diketahui"} · schema v${healthResource.data?.schemaVersion || "-"}`;

  const run = async (action, payload = {}, options = {}) => {
    setResult({ status: "loading", text: "Memproses..." });
    try {
      let data;
      if (action === "notifications.enable") data = await enablePushNotifications();
      else if (action === "notifications.disable") data = await disablePushNotifications();
      else if (action === "notifications.test") data = await testPushNotification();
      else data = await runSettingsAction(action, payload, { idempotencyKey: createIdempotencyKey(), ...options });
      if (action.startsWith("notifications.")) await refreshPushState();
      if (["calendar.sync", "mirror.sync", "mirror.rebuild", "backup.create"].includes(action)) await integrationResource.reload();
      const fileLink = data?.fileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.fileId)}` : null;
      const message = action === "backup.create"
        ? `Backup teknis terverifikasi: ${data.fileName}`
        : action === "mirror.rebuild" ? "Pembangunan ulang mirror sudah masuk antrean."
          : action === "mirror.sync" ? "Sinkronisasi mirror sudah masuk antrean."
            : action === "calendar.sync" ? "Sinkronisasi Calendar sudah masuk antrean."
              : action === "notifications.enable" ? "Perangkat berhasil didaftarkan. Kirim notifikasi uji untuk memverifikasi penerimaan."
                : action === "notifications.disable" ? "Notifikasi dinonaktifkan pada perangkat ini."
                  : action === "notifications.test" ? "Notifikasi uji dikirim. Periksa panel notifikasi pada perangkat ini."
                    : action === "integrity.run" ? (data.ok ? "Integrity check lulus." : `Integrity check menemukan ${data.issues?.length || 0} masalah.`)
                      : "Operasi berhasil diverifikasi.";
      setResult({ status: "success", text: message, fileLink });
      return data;
    } catch (error) {
      setResult({ status: "danger", text: error.message });
      return null;
    }
  };

  const downloadExcel = async () => {
    setExporting(true);
    setResult({ status: "loading", text: "Menyiapkan Excel..." });
    try {
      const data = await downloadFinanceExcel();
      setResult({ status: "success", text: `${data.fileName} berhasil diunduh.` });
    } catch (error) { setResult({ status: "danger", text: error.message }); }
    finally { setExporting(false); }
  };

  const previewImport = async () => {
    try {
      const records = await readTransactionImportFile(importFile);
      setImportPreview(await run("import.preview", { records }) || null);
    } catch (error) {
      setImportPreview(null);
      setResult({ status: "danger", text: error.message });
    }
  };
  const applyImport = async () => {
    if (!importPreview) return;
    const applied = await run("import.apply", { previewToken: importPreview.previewToken, confirmation: importConfirmation });
    if (!applied) return;
    setImportPreview(null); setImportConfirmation(""); setImportFile(null); await refreshAll();
  };
  const previewRestore = async () => setRestorePreview(await run("restore.preview", { backupFileId: restoreFileId.trim() }) || null);
  const applyRestore = async () => {
    if (!restorePreview) return;
    const applied = await run("restore.apply", { backupFileId: restoreFileId.trim(), previewToken: restorePreview.previewToken, confirmation: restoreConfirmation });
    if (!applied) return;
    setRestorePreview(null); setRestoreConfirmation(""); await refreshAll();
  };
  const saveMember = async (event) => {
    event.preventDefault();
    const email = memberForm.email.trim().toLowerCase();
    const existing = (usersResource.data?.items || []).find((item) => item.email.toLowerCase() === email) || null;
    if (existing?.status === "inactive") {
      setResult({ status: "warning", text: "Email tersebut adalah anggota nonaktif. Gunakan tombol Aktifkan kembali agar reaktivasi dilakukan secara eksplisit." });
      return;
    }
    const payload = { ...memberForm, email, row_version: existing?.row_version };
    if (!await run("users.upsert", payload, { rowVersion: existing?.row_version })) return;
    setMemberForm({ email: "", name: "", role: "member" });
    await usersResource.reload();
  };
  const deactivateMember = async (reason) => {
    if (!deactivateTarget) return;
    setDeactivateState({ status: "submitting", error: null });
    try {
      await deactivateUser({ user_id: deactivateTarget.user_id, row_version: deactivateTarget.row_version, reason }, { rowVersion: deactivateTarget.row_version, idempotencyKey: createIdempotencyKey() });
      await usersResource.reload();
      setDeactivateTarget(null);
      setDeactivateState({ status: "idle", error: null });
      setResult({ status: "success", text: "Anggota dinonaktifkan. Selaraskan ALLOWED_USERS_JSON sebelum deployment berikutnya." });
    } catch (error) { setDeactivateState({ status: "error", error }); }
  };
  const previewPeriodClose = async (event) => {
    event.preventDefault();
    setPeriodCloseState({ status: "submitting", error: null });
    try {
      const preview = await runSettingsAction("periods.previewClose", { period_key: periodForm.period_key }, { force: true });
      if (!preview.canClose) {
        setResult({ status: "warning", text: `Periode belum dapat ditutup. Ditemukan ${preview.issues.length} masalah yang harus diselesaikan.` });
        setPeriodCloseState({ status: "idle", error: null });
        return;
      }
      setPeriodClosePreview(preview);
      setPeriodCloseState({ status: "idle", error: null });
    } catch (error) {
      setPeriodCloseState({ status: "error", error });
      setResult({ status: "danger", text: error.message });
    }
  };
  const closePeriod = async (_reason, confirmationState = {}) => {
    if (!periodClosePreview) return;
    setPeriodCloseState({ status: "submitting", error: null });
    try {
      await runSettingsAction("periods.close", { ...periodForm, confirmation: confirmationState.confirmation }, { idempotencyKey: createIdempotencyKey() });
      setPeriodClosePreview(null);
      setPeriodCloseState({ status: "idle", error: null });
      setResult({ status: "success", text: `Periode ${periodForm.period_key} berhasil ditutup setelah validasi ulang backend.` });
      await Promise.all([refreshAll(), auditResource.reload(), periodsResource.reload()]);
    } catch (error) { setPeriodCloseState({ status: "error", error }); }
  };
  const reactivateMember = async (reason) => {
    if (!reactivateTarget) return;
    setReactivateState({ status: "submitting", error: null });
    try {
      await reactivateUser({ user_id: reactivateTarget.user_id, row_version: reactivateTarget.row_version, reason }, { rowVersion: reactivateTarget.row_version, idempotencyKey: createIdempotencyKey() });
      setReactivateTarget(null);
      setReactivateState({ status: "idle", error: null });
      setResult({ status: "success", text: "Anggota berhasil diaktifkan kembali setelah allowlist diverifikasi backend." });
      await Promise.all([usersResource.reload(), archiveResource.reload(), auditResource.reload()]);
    } catch (error) { setReactivateState({ status: "error", error }); }
  };
  const restoreArchivedItem = async (reason) => {
    if (!restoreArchiveTarget) return;
    setRestoreArchiveState({ status: "submitting", error: null });
    try {
      const action = restoreArchiveTarget.type === "account" ? "accounts.restore" : "categories.restore";
      const idKey = restoreArchiveTarget.type === "account" ? "account_id" : "category_id";
      await runSettingsAction(action, { [idKey]: restoreArchiveTarget.item[idKey], row_version: restoreArchiveTarget.item.row_version, reason }, { rowVersion: restoreArchiveTarget.item.row_version, idempotencyKey: createIdempotencyKey() });
      invalidate([
        restoreArchiveTarget.type === "account" ? "accounts.list" : "categories.list",
        "archive.list", "app.initialState", "dashboard.overview", "reports.monthly",
      ]);
      setRestoreArchiveTarget(null);
      setRestoreArchiveState({ status: "idle", error: null });
      setResult({ status: "success", text: `${restoreArchiveTarget.type === "account" ? "Rekening" : "Kategori"} berhasil dipulihkan.` });
      await Promise.all([archiveResource.reload(), auditResource.reload(), refreshAll()]);
    } catch (error) { setRestoreArchiveState({ status: "error", error }); }
  };
  const reopenPeriod = async (reason) => {
    if (!reopenTarget) return;
    setReopenState({ status: "submitting", error: null });
    try {
      await requestReopenPeriod({ closure_id: reopenTarget.closure_id, row_version: reopenTarget.row_version, reason }, { rowVersion: reopenTarget.row_version, idempotencyKey: createIdempotencyKey() });
      const periodKey = reopenTarget.period_key;
      setReopenTarget(null); setReopenState({ status: "idle", error: null });
      setResult({ status: "success", text: `Periode ${periodKey} berhasil dibuka kembali dan tercatat di audit.` });
      await Promise.all([refreshAll(), auditResource.reload(), periodsResource.reload()]);
    } catch (error) { setReopenState({ status: "error", error }); }
  };

  const integrations = integrationResource.data || healthResource.data?.integrations || {};
  const sheets = providerSummary(integrations, "sheets");
  const calendar = providerSummary(integrations, "calendar");
  const pushView = pushPresentation(pushState);
  const pushBusy = result?.status === "loading";

  return (
    <div className="page-stack settings-page">
      <RefreshWarning error={usersResource.refreshError || auditResource.refreshError || healthResource.refreshError || integrationResource.refreshError || periodsResource.refreshError || archiveResource.refreshError} onRetry={() => Promise.all([usersResource.reload(), auditResource.reload(), healthResource.reload(), integrationResource.reload(), periodsResource.reload(), archiveResource.reload()])} />
      <PageHeader title="Pengaturan" description="Turso menyimpan data resmi. Sheets, Calendar, Drive, dan notifikasi berjalan sebagai integrasi terpisah." />
      {result ? <div className={`notice notice--${result.status}`} role="status"><span>{result.text}</span>{result.fileLink ? <a href={result.fileLink} target="_blank" rel="noopener">Buka backup di Google Drive</a> : null}</div> : null}

      <section className="settings-grid" aria-label="Status sistem">
        <Card className="settings-card"><FiShield /><div><h2>Akses aplikasi</h2><p>{user?.email} · role {user?.role}</p></div><span className="status-badge status-badge--active">Diizinkan</span></Card>
        <Card className="settings-card"><FiDatabase /><div><h2>Turso database</h2><p>Schema {bootstrap?.config?.schemaVersion || healthResource.data?.schemaVersion || "-"} · {bootstrap?.config?.timezone || healthResource.data?.timezone || "Asia/Jakarta"}</p></div><span className={`status-badge status-badge--${backendStatus.tone}`}>{backendStatus.label}</span></Card>
        <Card className="settings-card"><FiFileText /><div><h2>Google Sheets mirror</h2><p>{integrations.configured?.sheets ? `Read-only · antrean ${sheets.pending}` : "Belum dikonfigurasi"}</p></div><span className={`status-badge status-badge--${integrations.configured?.sheets ? "active" : "warning"}`}>{integrations.configured?.sheets ? "Terhubung" : "Belum siap"}</span></Card>
        <Card className="settings-card"><FiCalendar /><div><h2>Google Calendar</h2><p>{integrations.configured?.calendar ? `Terhubung · antrean ${calendar.pending}` : "Belum dikonfigurasi"}</p></div><span className={`status-badge status-badge--${integrations.configured?.calendar ? "active" : "warning"}`}>{integrations.configured?.calendar ? "Terhubung" : "Belum siap"}</span></Card>
        <Card className="settings-card"><FiBell /><div><h2>Notifikasi perangkat</h2><p role="status" aria-live="polite">{pushView.text}{pushState.activeDeviceCount > 1 ? ` ${pushState.activeDeviceCount} perangkat aktif pada akun ini.` : ""}</p></div><span className={`status-badge status-badge--${pushView.tone}`}>{pushView.label}</span></Card>
        <Card className="settings-card"><FiCheckCircle /><div><h2>Status backend</h2><p role="status" aria-live="polite">{backendSummary}</p></div><span className={`status-badge status-badge--${backendStatus.tone}`}>{backendStatus.label}</span></Card>
      </section>

      <section className="settings-section" aria-labelledby="device-notification-title">
        <div className="settings-section__heading">
          <div><p className="eyebrow">Integrasi perangkat</p><h2 id="device-notification-title">Notifikasi perangkat</h2></div>
          <p>Setiap pengguna mengaktifkan subscription pada browser atau ponselnya sendiri. Backend hanya mengirim ke perangkat yang terdaftar pada akun tersebut.</p>
        </div>
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Web Push</p><h2>Browser ini</h2><p role="status" aria-live="polite">{pushView.text}</p></div><FiBell /></div>
          <div className="button-group">
            {pushState.enabled ? <Button disabled={pushBusy} onClick={() => run("notifications.test")}>Uji notifikasi</Button> : null}
            {!pushState.enabled && pushView.canEnable ? <Button variant="primary" disabled={pushBusy} onClick={() => run("notifications.enable")}>{pushState.browserSubscribed ? "Daftarkan ulang" : "Aktifkan"}</Button> : null}
            {pushState.browserSubscribed ? <Button disabled={pushBusy} onClick={() => run("notifications.disable")}>Nonaktifkan</Button> : null}
            {!pushState.browserSubscribed && !pushView.canEnable ? <span className={`status-badge status-badge--${pushView.tone}`}>{pushView.label}</span> : null}
          </div>
        </Card>
      </section>

      {ownerMode ? (
        <>
          <section className="settings-section" aria-labelledby="access-members-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Akses dan anggota</p><h2 id="access-members-title">Owner dan pasangan</h2></div>
              <p>Kelola dua pengguna yang diizinkan. Email dan role harus tetap sama dengan ALLOWED_USERS_JSON di Vercel.</p>
            </div>
            <Card className="panel">
              <div className="panel__header"><div><p className="eyebrow">Anggota</p><h2>Daftar akses aplikasi</h2><p>Backend tetap memverifikasi UID, email, email_verified, status, role, dan allowlist pada setiap request.</p></div><FiUsers /></div>
              <form className="form-grid" onSubmit={saveMember}>
                <label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="field"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="member">Member</option><option value="owner">Owner</option></select></label>
                <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Simpan anggota</Button></div>
              </form>
              <div className="compact-list compact-list--stacked">
                {(usersResource.data?.items || []).map((member) => (
                  <div key={member.user_id}>
                    <span><strong>{member.name || member.email}</strong><small>{member.email} · {member.role} · {member.status}</small></span>
                    {member.status === "active" && !member.is_current ? <Button variant="danger" icon={FiUserMinus} type="button" onClick={() => { setDeactivateTarget(member); setDeactivateState({ status: "idle", error: null }); }}>Nonaktifkan</Button> : null}
                    {member.status === "inactive" ? <Button icon={FiRotateCcw} type="button" onClick={() => { setReactivateTarget(member); setReactivateState({ status: "idle", error: null }); }}>Aktifkan kembali</Button> : null}
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section className="settings-section" aria-labelledby="integration-settings-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Integrasi</p><h2 id="integration-settings-title">Layanan terhubung</h2></div>
              <p>Google Sheets dan Calendar adalah integrasi satu arah dari Turso. Tindakan sinkronisasi hanya tersedia untuk owner.</p>
            </div>
            <div className="two-column-grid">
              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Google Sheets</p><h2>Mirror baca</h2><p>Edit manual di Sheets tidak mengubah saldo resmi.</p></div><FiFileText /></div>
                <div className="compact-list compact-list--stacked"><div><span><strong>Status mirror</strong><small>{sheets.lastUpdatedAt || "Belum pernah diproses"} · pending {sheets.pending}</small></span><span className={`status-badge status-badge--${integrations.configured?.sheets ? "active" : "warning"}`}>{integrations.configured?.sheets ? "Siap" : "Belum siap"}</span></div></div>
                <div className="button-group"><Button disabled={!integrations.configured?.sheets} onClick={() => run("mirror.sync")}>Sinkronkan</Button><Button disabled={!integrations.configured?.sheets} onClick={() => run("mirror.rebuild")}>Bangun ulang</Button></div>
              </Card>

              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Google Calendar</p><h2>Jadwal keuangan bersama</h2><p>Kalender menjadi pengingat. Status pembayaran tetap berasal dari ledger.</p></div><FiCalendar /></div>
                <div className="compact-list compact-list--stacked"><div><span><strong>Status kalender</strong><small>{calendar.lastUpdatedAt || "Belum pernah diproses"} · pending {calendar.pending}</small></span><span className={`status-badge status-badge--${integrations.configured?.calendar ? "active" : "warning"}`}>{integrations.configured?.calendar ? "Siap" : "Belum siap"}</span></div></div>
                <Button disabled={!integrations.configured?.calendar} onClick={() => run("calendar.sync")}>Sinkronkan dan rekonsiliasi</Button>
              </Card>

            </div>
          </section>

          <section className="settings-section" aria-labelledby="portability-settings-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Data dan portabilitas</p><h2 id="portability-settings-title">Export dan import transaksi</h2></div>
              <p>Excel adalah salinan baca. Import selalu melalui preview, validasi referensi, pemeriksaan duplikat, dan apply atomik.</p>
            </div>
            <div className="two-column-grid">
              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Export</p><h2>Unduh Excel lengkap</h2><p>File export bukan sumber restore dan tidak menggantikan backup teknis.</p></div><FiDownload /></div>
                <Button variant="primary" icon={FiDownload} loading={exporting} onClick={downloadExcel}>Unduh Excel lengkap</Button>
              </Card>

              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Import transaksi</p><h2>Preview sebelum apply</h2><p>File JSON/CSV maksimal 50 transaksi agar apply tetap atomik.</p></div><FiUploadCloud /></div>
                <div className="stack-form">
                  <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
                  <Button onClick={previewImport} disabled={!importFile}>Preview import</Button>
                  {importPreview ? <div className="notice notice--warning"><span>Valid: {importPreview.validCount}. Invalid: {importPreview.invalid.length}. Duplikat: {importPreview.duplicates.length}.</span></div> : null}
                  {importPreview ? <><label className="field"><span>Ketik IMPORT TRANSAKSI</span><input value={importConfirmation} onChange={(event) => setImportConfirmation(event.target.value)} /></label><Button variant="primary" onClick={applyImport} disabled={importConfirmation !== "IMPORT TRANSAKSI"}>Apply import</Button></> : null}
                </div>
              </Card>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="backup-recovery-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Backup dan pemulihan</p><h2 id="backup-recovery-title">Proteksi data dan recovery</h2></div>
              <p>Gunakan pemulihan per item untuk salah arsip biasa. Full restore hanya untuk insiden yang sudah melalui preview dan safety backup.</p>
            </div>
            <details className="owner-admin-section">
              <summary><span>Buka alat backup dan pemulihan</span><small>Tindakan dalam bagian ini dapat memengaruhi banyak data dan wajib diverifikasi sebelum dijalankan.</small></summary>
              <div className="two-column-grid owner-admin-grid">
                <Card className="panel">
                  <div className="panel__header"><div><p className="eyebrow">Proteksi human error</p><h2>Hapus, arsipkan, atau balikkan</h2><p>Data yang pernah dipakai tidak dihapus permanen. Purge umum dinonaktifkan pada aplikasi harian.</p></div><FiShield /></div>
                  <div className="compact-list compact-list--stacked">
                    <div><span><strong>Transaksi</strong><small>Batalkan atau pulihkan; tidak pernah hard delete.</small></span><span className="status-badge status-badge--active">Audit tetap</span></div>
                    <div><span><strong>Rekening/kategori terpakai</strong><small>Arsipkan agar histori dan laporan tetap konsisten.</small></span><span className="status-badge">Reversible</span></div>
                    <div><span><strong>Purge umum</strong><small>Dinonaktifkan pada aplikasi harian.</small></span><span className="status-badge status-badge--warning">Disabled</span></div>
                  </div>
                </Card>

                <Card className="panel">
                  <div className="panel__header"><div><p className="eyebrow">Backup recovery</p><h2>Snapshot teknis ke Drive</h2><p>Menyimpan ID, audit, row version, checksum, dan relasi untuk pemulihan.</p></div><FiDownloadCloud /></div>
                  <Button onClick={() => run("backup.create", { type: "manual" })}>Buat backup terverifikasi</Button>
                </Card>

                <Card className="panel panel--wide">
                  <div className="panel__header"><div><p className="eyebrow">Data arsip</p><h2>Pulihkan satu per satu</h2><p>Pemulihan menggunakan row version dan validasi backend. Full restore tidak diperlukan untuk salah arsip biasa.</p></div><FiArchive /></div>
                  {archiveResource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat data arsip...</p> : null}
                  {archiveResource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{archiveResource.error?.message || "Data arsip belum dapat dimuat."}</span><Button type="button" onClick={archiveResource.reload}>Coba lagi</Button></div> : null}
                  {archiveResource.status === "ready" ? (
                    <div className="compact-list compact-list--stacked">
                      {(archiveResource.data?.accounts || []).map((account) => <div key={account.account_id}><span><strong>{accountDisplayLabel(account)}</strong><small>Rekening diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setRestoreArchiveTarget({ type: "account", item: account }); setRestoreArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
                      {(archiveResource.data?.categories || []).map((category) => <div key={category.category_id}><span><strong>{category.name}</strong><small>Kategori · {category.transaction_type}</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setRestoreArchiveTarget({ type: "category", item: category }); setRestoreArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
                      {!archiveResource.data?.accounts?.length && !archiveResource.data?.categories?.length ? <p className="empty-inline-message">Belum ada rekening atau kategori dalam arsip.</p> : null}
                    </div>
                  ) : null}
                </Card>

                <Card className="panel panel--wide">
                  <div className="panel__header"><div><p className="eyebrow">Restore guarded</p><h2>Pulihkan backup teknis Turso</h2><p>Restore membuat safety backup, menyalakan maintenance, menjalankan transaction, lalu integrity check. Excel dan Sheets tidak dapat dipakai untuk restore.</p></div><FiDownloadCloud /></div>
                  <div className="form-grid">
                    <label className="field form-grid__full"><span>Google Drive file ID backup teknis</span><input value={restoreFileId} onChange={(event) => { setRestoreFileId(event.target.value); setRestorePreview(null); }} /></label>
                    <div className="form-grid__full"><Button onClick={previewRestore} disabled={!restoreFileId.trim()}>Validasi dan preview</Button></div>
                    {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Schema {restorePreview.schemaVersion} valid. Preview berlaku 10 menit.</span></div> : null}
                    {restorePreview ? <><label className="field form-grid__full"><span>Ketik RESTORE SALDO BERSAMA</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></label><div className="form-grid__full form-actions"><Button variant="primary" onClick={applyRestore} disabled={restoreConfirmation !== "RESTORE SALDO BERSAMA"}>Apply restore</Button></div></> : null}
                  </div>
                </Card>
              </div>
            </details>
          </section>

          <section className="settings-section" aria-labelledby="period-control-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Kontrol periode</p><h2 id="period-control-title">Integritas dan tutup buku</h2></div>
              <p>Integrity check dilakukan sebelum periode dikunci. Buka kembali periode hanya melalui konfirmasi owner dan audit.</p>
            </div>
            <div className="two-column-grid">
              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Integritas database</p><h2>Periksa konsistensi data</h2><p>Validasi referensi, saldo, queue, schema, dan kondisi operasional penting.</p></div><FiCheckCircle /></div>
                <Button variant="primary" onClick={() => run("integrity.run")}>Periksa integritas</Button>
              </Card>

              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Tutup buku</p><h2>Kunci periode bulanan</h2><p>Periode ditutup setelah transaksi teralokasi dan integrity check lulus.</p></div><FiLock /></div>
                <form className="form-grid" onSubmit={previewPeriodClose}>
                  <label className="field"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={periodForm.period_key} onChange={(event) => setPeriodForm((current) => ({ ...current, period_key: event.target.value }))} /></label>
                  <label className="field form-grid__full"><span>Catatan penutupan</span><input required maxLength="200" value={periodForm.reason} onChange={(event) => setPeriodForm((current) => ({ ...current, reason: event.target.value }))} /></label>
                  <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Validasi dan tutup periode</Button></div>
                </form>
                <div className="compact-list compact-list--stacked">{(periodsResource.data?.items || []).slice(0, 6).map((period) => <div key={period.closure_id}><span><strong>{period.period_key}</strong><small>{period.status} · {period.reason || "Tanpa catatan"}</small></span>{period.status === "closed" ? <button type="button" className="icon-button" onClick={() => { setReopenTarget(period); setReopenState({ status: "idle", error: null }); }} aria-label={`Buka kembali periode ${period.period_key}`}><FiUnlock /></button> : null}</div>)}</div>
              </Card>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="audit-security-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Audit dan keamanan</p><h2 id="audit-security-title">Status backend dan aktivitas penting</h2></div>
              <p>Actor dan perubahan penting dicatat backend. Audit bersifat append-only dan tidak dapat diedit atau dihapus.</p>
            </div>
            <div className="two-column-grid">
              <Card className="panel">
                <div className="panel__header"><div><p className="eyebrow">Status backend</p><h2>Kesiapan layanan</h2><p role="status" aria-live="polite">{backendSummary}.</p></div><FiDatabase /></div>
                <div className="compact-list compact-list--stacked"><div><span><strong>Mode operasi</strong><small>{healthResource.data?.maintenanceMode ? "Maintenance aktif" : "Operasi normal"}</small></span><span className={`status-badge status-badge--${backendStatus.tone}`}>{backendStatus.label}</span></div></div>
              </Card>

              <Card className="panel panel--wide">
                <div className="panel__header"><div><p className="eyebrow">Audit append-only</p><h2>Aktivitas penting terbaru</h2><p>Actor dan perubahan penting dicatat backend. Audit tidak dapat diedit atau dihapus.</p></div><FiShield /></div>
                {(auditResource.data?.items || []).length ? (
                  <>
                    <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Aksi</th><th>Entity</th><th>Hasil</th></tr></thead><tbody>{(auditResource.data?.items || []).map((entry) => <tr key={entry.audit_id}><td>{entry.timestamp}</td><td>{entry.actor_email}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td>{entry.result}</td></tr>)}</tbody></table></div>
                    <div className="mobile-data-list audit-mobile-list" aria-label="Aktivitas audit terbaru">{(auditResource.data?.items || []).map((entry) => <article className="mobile-data-card audit-mobile-card" key={entry.audit_id}><div><strong>{entry.action}</strong><span className={`status-badge status-badge--${entry.result === "success" ? "active" : "warning"}`}>{entry.result}</span></div><small>{entry.timestamp}</small><dl><div><dt>Actor</dt><dd>{entry.actor_email}</dd></div><div><dt>Entity</dt><dd>{entry.entity_type}</dd></div></dl></article>)}</div>
                  </>
                ) : <p className="empty-inline-message">Belum ada aktivitas audit untuk ditampilkan.</p>}
              </Card>
            </div>
          </section>
        </>
      ) : null}

      <ConfirmationModal
        open={Boolean(deactivateTarget)}
        title="Nonaktifkan anggota?"
        description={deactivateTarget ? `${deactivateTarget.email} tidak lagi dapat memakai aplikasi. Data keuangan dan audit tidak dihapus.` : ""}
        confirmLabel="Nonaktifkan anggota"
        reasonLabel="Alasan penonaktifan"
        requireReason
        acknowledgementLabel="Saya sudah memastikan anggota ini tidak memiliki data personal aktif yang perlu dipindahkan."
        busy={deactivateState.status === "submitting"}
        error={deactivateState.error}
        onCancel={() => deactivateState.status !== "submitting" && setDeactivateTarget(null)}
        onConfirm={deactivateMember}
      />
      <ConfirmationModal
        open={Boolean(reactivateTarget)}
        title="Aktifkan kembali anggota?"
        description={reactivateTarget ? `${reactivateTarget.email} akan memperoleh akses kembali hanya jika email dan role masih cocok dengan ALLOWED_USERS_JSON.` : ""}
        confirmLabel="Aktifkan kembali"
        reasonLabel="Alasan reaktivasi"
        requireReason
        tone="primary"
        busy={reactivateState.status === "submitting"}
        error={reactivateState.error}
        onCancel={() => reactivateState.status !== "submitting" && setReactivateTarget(null)}
        onConfirm={reactivateMember}
      />
      <ConfirmationModal
        open={Boolean(restoreArchiveTarget)}
        title={restoreArchiveTarget?.type === "account" ? "Pulihkan rekening?" : "Pulihkan kategori?"}
        description={restoreArchiveTarget ? `${restoreArchiveTarget.item.name} akan aktif kembali setelah backend memeriksa konflik, kepemilikan, dan row version terbaru.` : ""}
        confirmLabel="Pulihkan data"
        reasonLabel="Alasan pemulihan"
        requireReason
        tone="primary"
        busy={restoreArchiveState.status === "submitting"}
        error={restoreArchiveState.error}
        onCancel={() => restoreArchiveState.status !== "submitting" && setRestoreArchiveTarget(null)}
        onConfirm={restoreArchivedItem}
      />
      <ConfirmationModal
        open={Boolean(periodClosePreview)}
        title="Tutup periode setelah validasi?"
        description={periodClosePreview ? `Periode ${periodClosePreview.periodKey} akan dikunci. Transaksi hanya dapat diubah setelah owner membuka kembali periode secara berurutan.` : ""}
        confirmLabel="Tutup periode"
        expectedConfirmation={periodClosePreview?.confirmation || ""}
        acknowledgementLabel="Saya sudah memeriksa jumlah transaksi, pemasukan, pengeluaran, dan memahami periode akan terkunci."
        countdownSeconds={5}
        busy={periodCloseState.status === "submitting"}
        error={periodCloseState.error}
        onCancel={() => periodCloseState.status !== "submitting" && setPeriodClosePreview(null)}
        onConfirm={closePeriod}
      >
        {periodClosePreview ? (
          <div className="compact-list compact-list--stacked">
            <div><span><strong>Transaksi aktif</strong></span><strong>{periodClosePreview.activeTransactionCount}</strong></div>
            <div><span><strong>Transaksi cancelled</strong></span><strong>{periodClosePreview.cancelledTransactionCount}</strong></div>
            <div><span><strong>Total pemasukan</strong></span><strong>Rp{periodClosePreview.incomeTotal.toLocaleString("id-ID")}</strong></div>
            <div><span><strong>Total pengeluaran</strong></span><strong>Rp{periodClosePreview.expenseTotal.toLocaleString("id-ID")}</strong></div>
          </div>
        ) : null}
      </ConfirmationModal>
      <ConfirmationModal open={Boolean(reopenTarget)} title="Buka kembali periode?" description={reopenTarget ? `Periode ${reopenTarget.period_key} akan menerima perubahan lagi. Snapshot lama tetap berada di audit.` : ""} confirmLabel="Buka periode" reasonLabel="Alasan membuka kembali" requireReason tone="primary" busy={reopenState.status === "submitting"} error={reopenState.error} onCancel={() => reopenState.status !== "submitting" && setReopenTarget(null)} onConfirm={reopenPeriod} />
    </div>
  );
};

export default SettingsPage;
