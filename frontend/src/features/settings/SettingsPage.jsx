import { useCallback, useEffect, useState } from "react";
import {
  FiBell, FiCalendar, FiCheckCircle, FiDatabase, FiDownload, FiDownloadCloud, FiFileText,
  FiLock, FiRefreshCw, FiShield, FiUploadCloud, FiUnlock, FiUserMinus, FiUsers,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { deactivateUser, downloadFinanceExcel, reopenPeriod as requestReopenPeriod, runSettingsAction } from "./settings.api.js";
import { disablePushNotifications, enablePushNotifications, getPushNotificationState } from "../../services/notifications.js";
import { readTransactionImportFile } from "../../services/importer.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { currentMonthInJakarta, previousMonthInJakarta } from "../../domain/dates.js";

const providerSummary = (integration, provider) => {
  const item = integration?.providers?.[provider] || {};
  const pending = Number(item.pending || 0) + Number(item.processing || 0) + Number(item.failed || 0);
  return { pending, completed: Number(item.completed || 0), lastUpdatedAt: item.lastUpdatedAt || null };
};

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap, refreshAll } = useFinance();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const auditResource = useApiResource("audit.list", { limit: 50 }, { enabled: ownerMode });
  const healthResource = useApiResource("system.health");
  const integrationResource = useApiResource("integrations.status");
  const periodsResource = useApiResource("periods.list", {}, { enabled: ownerMode });
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
  const [pushState, setPushState] = useState({ status: "loading", supported: true, permission: "default", enabled: false });
  const [exporting, setExporting] = useState(false);

  const refreshPushState = useCallback(async () => {
    try {
      const next = await getPushNotificationState();
      setPushState({ status: "ready", ...next });
      return next;
    } catch (error) {
      setPushState({ status: "error", supported: false, permission: "unknown", enabled: false, error });
      return null;
    }
  }, []);
  useEffect(() => { refreshPushState(); }, [refreshPushState]);

  const backendStatus = healthResource.status === "error"
    ? { label: "Tidak tersedia", tone: "danger" }
    : healthResource.status !== "ready"
      ? { label: "Memeriksa", tone: "info" }
      : healthResource.data?.maintenanceMode
        ? { label: "Maintenance", tone: "danger" }
        : healthResource.data?.database !== "ok" || healthResource.data?.schema?.ready === false
          ? { label: "Degraded", tone: "danger" }
          : { label: "Siap", tone: "active" };

  const run = async (action, payload = {}, options = {}) => {
    setResult({ status: "loading", text: "Memproses..." });
    try {
      let data;
      if (action === "notifications.enable") data = await enablePushNotifications();
      else if (action === "notifications.disable") data = await disablePushNotifications();
      else data = await runSettingsAction(action, payload, { idempotencyKey: createIdempotencyKey(), ...options });
      if (action.startsWith("notifications.")) await refreshPushState();
      if (["calendar.sync", "mirror.sync", "mirror.rebuild", "backup.create"].includes(action)) await integrationResource.reload();
      const fileLink = data?.fileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.fileId)}` : null;
      const message = action === "backup.create"
        ? `Backup teknis terverifikasi: ${data.fileName}`
        : action === "mirror.rebuild" ? "Pembangunan ulang mirror sudah masuk antrean."
          : action === "mirror.sync" ? "Sinkronisasi mirror sudah masuk antrean."
            : action === "calendar.sync" ? "Sinkronisasi Calendar sudah masuk antrean."
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
    const payload = { ...memberForm, email, row_version: existing?.row_version };
    if (!await run("users.upsert", payload, { rowVersion: existing?.row_version })) return;
    setMemberForm({ email: "", name: "", role: "member" });
    await usersResource.reload();
  };
  const deactivateMember = async () => {
    if (!deactivateTarget) return;
    setDeactivateState({ status: "submitting", error: null });
    try {
      await deactivateUser({ user_id: deactivateTarget.user_id, row_version: deactivateTarget.row_version }, { rowVersion: deactivateTarget.row_version, idempotencyKey: createIdempotencyKey() });
      await usersResource.reload();
      setDeactivateTarget(null);
      setDeactivateState({ status: "idle", error: null });
      setResult({ status: "success", text: "Anggota dinonaktifkan. Selaraskan ALLOWED_USERS_JSON sebelum deployment berikutnya." });
    } catch (error) { setDeactivateState({ status: "error", error }); }
  };
  const closePeriod = async (event) => {
    event.preventDefault();
    if (await run("periods.close", periodForm)) await Promise.all([refreshAll(), auditResource.reload(), periodsResource.reload()]);
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

  return (
    <div className="page-stack settings-page">
      <RefreshWarning error={usersResource.refreshError || auditResource.refreshError || healthResource.refreshError || integrationResource.refreshError || periodsResource.refreshError} onRetry={() => Promise.all([usersResource.reload(), auditResource.reload(), healthResource.reload(), integrationResource.reload(), periodsResource.reload()])} />
      <PageHeader title="Pengaturan" description="Turso menyimpan data resmi. Sheets, Calendar, Drive, dan notifikasi berjalan sebagai integrasi terpisah." />
      {result ? <div className={`notice notice--${result.status}`} role="status"><span>{result.text}</span>{result.fileLink ? <a href={result.fileLink} target="_blank" rel="noopener">Buka backup di Google Drive</a> : null}</div> : null}

      <section className="settings-grid">
        <Card className="settings-card"><FiShield /><div><h2>Akses aplikasi</h2><p>{user?.email} · role {user?.role}</p></div><span className="status-badge status-badge--active">Diizinkan</span></Card>
        <Card className="settings-card"><FiDatabase /><div><h2>Turso database</h2><p>Schema {bootstrap?.config?.schemaVersion || healthResource.data?.schema?.version || "-"} · {bootstrap?.config?.timezone || "Asia/Jakarta"}</p></div>{ownerMode ? <Button onClick={() => run("integrity.run")}>Periksa integritas</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiCalendar /><div><h2>Google Calendar</h2><p>{integrations.configured?.calendar ? `Terhubung · antrean ${calendar.pending}` : "Belum dikonfigurasi"}</p></div>{ownerMode ? <Button disabled={!integrations.configured?.calendar} onClick={() => run("calendar.sync")}>Sinkronkan</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiFileText /><div><h2>Google Sheets mirror</h2><p>{integrations.configured?.sheets ? `Read-only · antrean ${sheets.pending}` : "Belum dikonfigurasi"}</p></div>{ownerMode ? <Button disabled={!integrations.configured?.sheets} onClick={() => run("mirror.sync")}>Sinkronkan</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiBell /><div><h2>Notifikasi perangkat</h2><p>{pushState.enabled ? "Aktif pada browser ini." : pushState.supported ? "Belum aktif pada browser ini." : "Browser tidak mendukung Web Push."}</p></div>{pushState.enabled ? <Button onClick={() => run("notifications.disable")}>Nonaktifkan</Button> : <Button disabled={!pushState.supported || pushState.status === "loading"} onClick={() => run("notifications.enable")}>Aktifkan</Button>}</Card>
        <Card className="settings-card"><FiCheckCircle /><div><h2>Status backend</h2><p>Database {healthResource.data?.database || "-"} · schema {healthResource.data?.schema?.ready ? "siap" : "belum siap"}</p></div><span className={`status-badge status-badge--${backendStatus.tone}`}>{backendStatus.label}</span></Card>
      </section>

      {ownerMode ? (
        <>
          <section className="settings-section" aria-labelledby="collaboration-settings-title">
            <div className="settings-section__heading">
              <div><p className="eyebrow">Kolaborasi</p><h2 id="collaboration-settings-title">Anggota dan integrasi</h2></div>
              <p>Kelola akses dua pengguna dan layanan Google yang terhubung.</p>
            </div>
            <div className="two-column-grid">
          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Anggota</p><h2>Owner dan pasangan</h2><p>Email dan role wajib sama dengan ALLOWED_USERS_JSON di Vercel.</p></div><FiUsers /></div>
            <form className="form-grid" onSubmit={saveMember}>
              <label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label className="field"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="member">Member</option><option value="owner">Owner</option></select></label>
              <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Simpan anggota</Button></div>
            </form>
            <div className="compact-list compact-list--stacked">{(usersResource.data?.items || []).map((member) => <div key={member.user_id}><span><strong>{member.name || member.email}</strong><small>{member.email} · {member.role} · {member.status}</small></span>{member.status === "active" && !member.is_current ? <button className="icon-button icon-button--danger" type="button" onClick={() => { setDeactivateTarget(member); setDeactivateState({ status: "idle", error: null }); }} aria-label={`Nonaktifkan ${member.email}`}><FiUserMinus /></button> : null}</div>)}</div>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Integrasi Google</p><h2>Mirror dan kalender</h2><p>Sinkronisasi satu arah dari Turso. Edit manual di Sheets tidak mengubah saldo resmi.</p></div><FiRefreshCw /></div>
            <div className="compact-list compact-list--stacked">
              <div><span><strong>Sheets mirror</strong><small>{sheets.lastUpdatedAt || "Belum pernah diproses"} · pending {sheets.pending}</small></span><Button disabled={!integrations.configured?.sheets} onClick={() => run("mirror.rebuild")}>Bangun ulang</Button></div>
              <div><span><strong>Calendar shared</strong><small>{calendar.lastUpdatedAt || "Belum pernah diproses"} · pending {calendar.pending}</small></span><Button disabled={!integrations.configured?.calendar} onClick={() => run("calendar.sync")}>Rekonsiliasi</Button></div>
            </div>
          </Card>
            </div>
          </section>

          <details className="owner-admin-section">
            <summary>
              <span>Administrasi owner</span>
              <small>Export, backup, tutup periode, import, restore, dan audit.</small>
            </summary>
            <div className="two-column-grid owner-admin-grid">
          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Export</p><h2>Unduh Excel lengkap</h2><p>Excel adalah salinan baca dan bukan file restore.</p></div><FiDownload /></div>
            <Button variant="primary" icon={FiDownload} loading={exporting} onClick={downloadExcel}>Unduh Excel lengkap</Button>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Backup recovery</p><h2>Snapshot teknis ke Drive</h2><p>Menyimpan ID, audit, row version, checksum, dan relasi untuk pemulihan.</p></div><FiDownloadCloud /></div>
            <Button onClick={() => run("backup.create", { type: "manual" })}>Buat backup terverifikasi</Button>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Tutup buku</p><h2>Kunci periode bulanan</h2><p>Periode ditutup setelah transaksi teralokasi dan integrity check lulus.</p></div><FiLock /></div>
            <form className="form-grid" onSubmit={closePeriod}>
              <label className="field"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={periodForm.period_key} onChange={(event) => setPeriodForm((current) => ({ ...current, period_key: event.target.value }))} /></label>
              <label className="field form-grid__full"><span>Catatan penutupan</span><input required maxLength="200" value={periodForm.reason} onChange={(event) => setPeriodForm((current) => ({ ...current, reason: event.target.value }))} /></label>
              <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Validasi dan tutup periode</Button></div>
            </form>
            <div className="compact-list compact-list--stacked">{(periodsResource.data?.items || []).slice(0, 6).map((period) => <div key={period.closure_id}><span><strong>{period.period_key}</strong><small>{period.status} · {period.reason || "Tanpa catatan"}</small></span>{period.status === "closed" ? <button type="button" className="icon-button" onClick={() => { setReopenTarget(period); setReopenState({ status: "idle", error: null }); }} aria-label={`Buka kembali periode ${period.period_key}`}><FiUnlock /></button> : null}</div>)}</div>
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

          <Card className="panel panel--wide">
            <div className="panel__header"><div><p className="eyebrow">Restore guarded</p><h2>Pulihkan backup teknis Turso</h2><p>Restore membuat safety backup, menyalakan maintenance, menjalankan transaction, lalu integrity check. Excel dan Sheets tidak dapat dipakai untuk restore.</p></div><FiDownloadCloud /></div>
            <div className="form-grid">
              <label className="field form-grid__full"><span>Google Drive file ID backup teknis</span><input value={restoreFileId} onChange={(event) => { setRestoreFileId(event.target.value); setRestorePreview(null); }} /></label>
              <div className="form-grid__full"><Button onClick={previewRestore} disabled={!restoreFileId.trim()}>Validasi dan preview</Button></div>
              {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Schema {restorePreview.schemaVersion} valid. Preview berlaku 10 menit.</span></div> : null}
              {restorePreview ? <><label className="field form-grid__full"><span>Ketik RESTORE SALDO BERSAMA</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></label><div className="form-grid__full form-actions"><Button variant="primary" onClick={applyRestore} disabled={restoreConfirmation !== "RESTORE SALDO BERSAMA"}>Apply restore</Button></div></> : null}
            </div>
          </Card>

          <Card className="panel panel--wide">
            <div className="panel__header"><div><p className="eyebrow">Audit append-only</p><h2>Aktivitas penting terbaru</h2><p>Actor dan perubahan penting dicatat backend. Audit tidak dapat diedit atau dihapus.</p></div><FiShield /></div>
            {(auditResource.data?.items || []).length ? (
              <>
                <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Aksi</th><th>Entity</th><th>Hasil</th></tr></thead><tbody>{(auditResource.data?.items || []).map((entry) => <tr key={entry.audit_id}><td>{entry.timestamp}</td><td>{entry.actor_email}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td>{entry.result}</td></tr>)}</tbody></table></div>
                <div className="mobile-data-list audit-mobile-list" aria-label="Aktivitas audit terbaru">
                  {(auditResource.data?.items || []).map((entry) => (
                    <article className="mobile-data-card audit-mobile-card" key={entry.audit_id}>
                      <div><strong>{entry.action}</strong><span className={`status-badge status-badge--${entry.result === "success" ? "active" : "warning"}`}>{entry.result}</span></div>
                      <small>{entry.timestamp}</small>
                      <dl><div><dt>Actor</dt><dd>{entry.actor_email}</dd></div><div><dt>Entity</dt><dd>{entry.entity_type}</dd></div></dl>
                    </article>
                  ))}
                </div>
              </>
            ) : <p className="empty-inline-message">Belum ada aktivitas audit untuk ditampilkan.</p>}
          </Card>
            </div>
          </details>
        </>
      ) : null}

      <ConfirmationModal open={Boolean(deactivateTarget)} title="Nonaktifkan anggota?" description={deactivateTarget ? `${deactivateTarget.email} tidak lagi dapat memakai data setelah database dan ALLOWED_USERS_JSON Vercel diselaraskan.` : ""} confirmLabel="Nonaktifkan anggota" busy={deactivateState.status === "submitting"} error={deactivateState.error} onCancel={() => deactivateState.status !== "submitting" && setDeactivateTarget(null)} onConfirm={deactivateMember} />
      <ConfirmationModal open={Boolean(reopenTarget)} title="Buka kembali periode?" description={reopenTarget ? `Periode ${reopenTarget.period_key} akan menerima perubahan lagi. Snapshot lama tetap berada di audit.` : ""} confirmLabel="Buka periode" reasonLabel="Alasan membuka kembali" requireReason tone="primary" busy={reopenState.status === "submitting"} error={reopenState.error} onCancel={() => reopenState.status !== "submitting" && setReopenTarget(null)} onConfirm={reopenPeriod} />
    </div>
  );
};

export default SettingsPage;
