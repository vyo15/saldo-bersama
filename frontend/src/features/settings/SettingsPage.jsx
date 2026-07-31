import { useState } from "react";
import { FiBell, FiCalendar, FiCheckCircle, FiDatabase, FiDownloadCloud, FiFileText, FiLock, FiShield, FiUploadCloud, FiUnlock, FiUserMinus, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Card from "../../components/common/Card.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { apiClient } from "../../services/api/client.js";
import { enablePushNotifications } from "../../services/notifications.js";
import { readTransactionImportFile } from "../../services/importer.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { currentMonthInJakarta } from "../../domain/dates.js";

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap, refreshAll } = useFinance();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const auditResource = useApiResource("audit.list", { limit: 50 }, { enabled: ownerMode });
  const healthResource = useApiResource("system.health");
  const periodsResource = useApiResource("periods.list", {}, { enabled: ownerMode });
  const [result, setResult] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importConfirmation, setImportConfirmation] = useState("");
  const [restoreFileId, setRestoreFileId] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [memberForm, setMemberForm] = useState({ email: "", name: "", role: "member" });
  const [periodForm, setPeriodForm] = useState({ period_key: currentMonthInJakarta(), reason: "Review dan rekonsiliasi selesai" });
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateState, setDeactivateState] = useState({ status: "idle", error: null });
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenState, setReopenState] = useState({ status: "idle", error: null });
  const backendStatus = healthResource.status === "error"
    ? { label: "Tidak tersedia", tone: "danger" }
    : healthResource.status !== "ready"
      ? { label: "Memeriksa", tone: "info" }
      : healthResource.data?.recoveryRequired
        ? { label: "Recovery", tone: "danger" }
        : healthResource.data?.maintenanceMode
          ? { label: "Maintenance", tone: "danger" }
          : { label: "Siap", tone: "active" };

  const run = async (action, payload = {}) => {
    setResult({ status: "loading", text: "Memproses..." });
    try {
      const data = action === "notifications.enable" ? await enablePushNotifications() : await apiClient.request(action, payload, { idempotencyKey: createIdempotencyKey() });
      const fileLink = data?.fileId ? `https://drive.google.com/open?id=${encodeURIComponent(data.fileId)}` : null;
      setResult({ status: "success", text: action === "backup.create" ? `Backup terverifikasi: ${data.fileName}` : "Operasi berhasil diverifikasi.", fileLink });
      return data;
    } catch (error) {
      setResult({ status: "danger", text: error.message });
      return null;
    }
  };

  const previewImport = async () => {
    try {
      const records = await readTransactionImportFile(importFile);
      const preview = await run("import.preview", { records });
      setImportPreview(preview || null);
    } catch { setImportPreview(null); }
  };

  const applyImport = async () => {
    if (!importPreview) return;
    const applied = await run("import.apply", { previewToken: importPreview.previewToken, confirmation: importConfirmation });
    if (!applied) return;
    setImportPreview(null); setImportConfirmation(""); setImportFile(null); await refreshAll();
  };

  const previewRestore = async () => {
    const preview = await run("restore.preview", { backupFileId: restoreFileId.trim() });
    setRestorePreview(preview || null);
  };

  const applyRestore = async () => {
    if (!restorePreview) return;
    const applied = await run("restore.apply", { backupFileId: restoreFileId.trim(), previewToken: restorePreview.previewToken, confirmation: restoreConfirmation });
    if (!applied) return;
    setRestorePreview(null); setRestoreConfirmation(""); await refreshAll();
  };

  const saveMember = async (event) => {
    event.preventDefault();
    const saved = await run("users.upsert", memberForm);
    if (!saved) return;
    setMemberForm({ email: "", name: "", role: "member" });
    await usersResource.reload();
  };

  const deactivateMember = async () => {
    if (!deactivateTarget) return;
    setDeactivateState({ status: "submitting", error: null });
    try {
      const data = await apiClient.request("users.deactivate", { user_id: deactivateTarget.user_id, row_version: deactivateTarget.row_version }, { rowVersion: deactivateTarget.row_version, idempotencyKey: createIdempotencyKey() });
      if (data) await usersResource.reload();
      setDeactivateTarget(null);
      setDeactivateState({ status: "idle", error: null });
      setResult({ status: "success", text: "Anggota dinonaktifkan. Sinkronkan ALLOWED_USERS_JSON di Vercel sebelum deployment berikutnya." });
    } catch (error) {
      setDeactivateState({ status: "error", error });
    }
  };

  const closePeriod = async (event) => {
    event.preventDefault();
    const closed = await run("periods.close", periodForm);
    if (closed) await Promise.all([refreshAll(), auditResource.reload(), periodsResource.reload()]);
  };

  const reopenPeriod = async (reason) => {
    if (!reopenTarget) return;
    setReopenState({ status: "submitting", error: null });
    try {
      await apiClient.request("periods.reopen", { closure_id: reopenTarget.closure_id, row_version: reopenTarget.row_version, reason }, { rowVersion: reopenTarget.row_version, idempotencyKey: createIdempotencyKey() });
      setReopenTarget(null);
      setReopenState({ status: "idle", error: null });
      setResult({ status: "success", text: `Periode ${reopenTarget.period_key} berhasil dibuka kembali dan tercatat di audit.` });
      await Promise.all([refreshAll(), auditResource.reload(), periodsResource.reload()]);
    } catch (error) {
      setReopenState({ status: "error", error });
    }
  };

  return (
    <div className="page-stack">
      <RefreshWarning error={usersResource.refreshError || auditResource.refreshError || healthResource.refreshError || periodsResource.refreshError} onRetry={() => Promise.all([usersResource.reload(), auditResource.reload(), healthResource.reload(), periodsResource.reload()])} />
      <PageHeader title="Pengaturan" description="Konfigurasi sensitif hanya dapat diubah oleh owner dan tetap diverifikasi di server." />
      {result ? <div className={`notice notice--${result.status}`} role="status"><span>{result.text}</span>{result.fileLink ? <a href={result.fileLink} target="_blank" rel="noopener">Buka file di Google Drive</a> : null}</div> : null}
      <section className="settings-grid">
        <Card className="settings-card"><FiShield /><div><h2>Akses aplikasi</h2><p>{user?.email} · role {user?.role}</p></div><span className="status-badge status-badge--active">Diizinkan</span></Card>
        <Card className="settings-card"><FiDatabase /><div><h2>Schema database</h2><p>Versi {bootstrap?.config?.schemaVersion || "-"} · {bootstrap?.config?.timezone || "Asia/Jakarta"}</p></div>{ownerMode ? <Button onClick={() => run("integrity.run")}>Periksa integritas</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiCalendar /><div><h2>Google Calendar</h2><p>Satu kalender Saldo Bersama untuk pengingat kedua akun.</p></div>{ownerMode ? <Button onClick={() => run("calendar.sync")}>Sinkronkan</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiBell /><div><h2>Notifikasi perangkat</h2><p>Push tidak menampilkan nominal sensitif pada layar terkunci.</p></div><Button onClick={() => run("notifications.enable")}>Aktifkan</Button></Card>
        <Card className="settings-card"><FiDownloadCloud /><div><h2>Backup</h2><p>Backup sebelum migration, import besar, dan restore.</p></div>{ownerMode ? <Button onClick={() => run("backup.create", { type: "manual" })}>Buat backup</Button> : <span className="status-badge">Owner</span>}</Card>
        <Card className="settings-card"><FiCheckCircle /><div><h2>Status backend</h2><p>Setup {healthResource.data?.setupStatus || "-"} · migration {healthResource.data?.migrationStatus || "-"}</p></div><span className={`status-badge status-badge--${backendStatus.tone}`}>{backendStatus.label}</span></Card>
      </section>

      {ownerMode ? (
        <section className="two-column-grid">
          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Anggota</p><h2>Owner dan pasangan</h2><p>Email juga wajib tercantum dengan role sama pada ALLOWED_USERS_JSON di Vercel.</p></div><FiUsers /></div>
            <form className="form-grid" onSubmit={saveMember}>
              <label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label className="field"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="member">Member</option><option value="owner">Owner</option></select></label>
              <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Simpan anggota</Button></div>
            </form>
            <div className="compact-list compact-list--stacked">{(usersResource.data?.items || []).map((member) => <div key={member.user_id}><span><strong>{member.name || member.email}</strong><small>{member.email} · {member.role} · {member.status}</small></span>{member.status === "active" && !member.is_current ? <button className="icon-button icon-button--danger" type="button" onClick={() => { setDeactivateTarget(member); setDeactivateState({ status: "idle", error: null }); }} aria-label={`Nonaktifkan ${member.email}`}><FiUserMinus /></button> : null}</div>)}</div>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Tutup buku</p><h2>Kunci periode bulanan</h2><p>Periode hanya ditutup setelah transaksi teralokasi dan integrity check lulus.</p></div><FiLock /></div>
            <form className="form-grid" onSubmit={closePeriod}>
              <label className="field"><span>Periode</span><input type="month" value={periodForm.period_key} onChange={(event) => setPeriodForm((current) => ({ ...current, period_key: event.target.value }))} /></label>
              <label className="field form-grid__full"><span>Catatan penutupan</span><input required maxLength="200" value={periodForm.reason} onChange={(event) => setPeriodForm((current) => ({ ...current, reason: event.target.value }))} /></label>
              <div className="form-grid__full form-actions"><Button variant="primary" type="submit">Validasi dan tutup periode</Button></div>
            </form>
            <div className="compact-list compact-list--stacked">{(periodsResource.data?.items || []).slice(0, 6).map((period) => <div key={period.closure_id}><span><strong>{period.period_key}</strong><small>{period.status} · {period.reason || "Tanpa catatan"}</small></span>{period.status === "closed" ? <button type="button" className="icon-button" onClick={() => { setReopenTarget(period); setReopenState({ status: "idle", error: null }); }} aria-label={`Buka kembali periode ${period.period_key}`}><FiUnlock /></button> : null}</div>)}</div>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Export</p><h2>Salinan data untuk dibaca</h2><p>Export tidak mengubah database.</p></div><FiFileText /></div>
            <div className="button-group"><Button onClick={() => run("export.create", { format: "csv" })}>CSV transaksi</Button><Button onClick={() => run("export.create", { format: "xlsx" })}>Excel lengkap</Button><Button onClick={() => run("export.create", { format: "json" })}>JSON</Button></div>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Import transaksi</p><h2>Preview sebelum apply</h2><p>File JSON/CSV maksimal 500 transaksi per batch.</p></div><FiUploadCloud /></div>
            <div className="stack-form">
              <input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} />
              <Button onClick={previewImport} disabled={!importFile}>Preview import</Button>
              {importPreview ? <div className="notice notice--warning"><span>Valid: {importPreview.validCount}. Invalid: {importPreview.invalid.length}. Duplikat: {importPreview.duplicates.length}.</span></div> : null}
              {importPreview ? <><label className="field"><span>Ketik IMPORT TRANSAKSI</span><input value={importConfirmation} onChange={(event) => setImportConfirmation(event.target.value)} /></label><Button variant="primary" onClick={applyImport} disabled={importConfirmation !== "IMPORT TRANSAKSI"}>Apply import</Button></> : null}
            </div>
          </Card>

          <Card className="panel panel--wide">
            <div className="panel__header"><div><p className="eyebrow">Restore guarded</p><h2>Pulihkan dari salinan spreadsheet</h2><p>Restore membuat safety backup, mengaktifkan maintenance mode, lalu menjalankan integrity check dan rollback otomatis bila gagal.</p></div><FiDownloadCloud /></div>
            <div className="form-grid">
              <label className="field form-grid__full"><span>Google Drive file ID backup</span><input value={restoreFileId} onChange={(event) => { setRestoreFileId(event.target.value); setRestorePreview(null); }} /></label>
              <div className="form-grid__full"><Button onClick={previewRestore} disabled={!restoreFileId.trim()}>Validasi dan preview</Button></div>
              {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Schema {restorePreview.schemaVersion} valid. Preview berlaku 10 menit. Periksa ringkasan sebelum melanjutkan.</span></div> : null}
              {restorePreview ? <><label className="field form-grid__full"><span>Ketik RESTORE SALDO BERSAMA</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></label><div className="form-grid__full form-actions"><Button variant="primary" onClick={applyRestore} disabled={restoreConfirmation !== "RESTORE SALDO BERSAMA"}>Apply restore</Button></div></> : null}
            </div>
          </Card>

          <Card className="panel panel--wide">
            <div className="panel__header"><div><p className="eyebrow">Audit append-only</p><h2>Aktivitas penting terbaru</h2><p>UI hanya menampilkan metadata ringkas; nilai lama dan baru tetap tersimpan di audit backend.</p></div><FiShield /></div>
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Aksi</th><th>Entity</th><th>Hasil</th></tr></thead><tbody>{(auditResource.data?.items || []).map((entry) => <tr key={entry.audit_id}><td>{entry.timestamp}</td><td>{entry.actor_email}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td>{entry.result}</td></tr>)}</tbody></table></div>
          </Card>
        </section>
      ) : null}

      <ConfirmationModal
        open={Boolean(deactivateTarget)}
        title="Nonaktifkan anggota?"
        description={deactivateTarget ? `${deactivateTarget.email} tidak lagi dapat memakai data setelah database dan ALLOWED_USERS_JSON Vercel disinkronkan.` : ""}
        confirmLabel="Nonaktifkan anggota"
        busy={deactivateState.status === "submitting"}
        error={deactivateState.error}
        onCancel={() => deactivateState.status !== "submitting" && setDeactivateTarget(null)}
        onConfirm={deactivateMember}
      />

      <ConfirmationModal
        open={Boolean(reopenTarget)}
        title="Buka kembali periode?"
        description={reopenTarget ? `Periode ${reopenTarget.period_key} akan menerima perubahan lagi. Snapshot lama tetap berada di audit.` : ""}
        confirmLabel="Buka periode"
        reasonLabel="Alasan membuka kembali"
        requireReason
        tone="primary"
        busy={reopenState.status === "submitting"}
        error={reopenState.error}
        onCancel={() => reopenState.status !== "submitting" && setReopenTarget(null)}
        onConfirm={reopenPeriod}
      />
    </div>
  );
};

export default SettingsPage;
