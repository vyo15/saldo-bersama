import { useState } from "react";
import { FiArchive, FiDownloadCloud, FiRotateCcw, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../accounts/accountPresentation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { categoryTypeLabel } from "../categories/categoryPresentation.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const RecoveryPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const archiveResource = useApiResource("archive.list", {}, { enabled: ownerMode });
  const [result, setResult] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [backupFileId, setBackupFileId] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);

  const restoreArchivedItem = async (reason) => {
    if (!archiveTarget) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      const action = archiveTarget.type === "account" ? "accounts.restore" : "categories.restore";
      const idKey = archiveTarget.type === "account" ? "account_id" : "category_id";
      await runSettingsAction(action, { [idKey]: archiveTarget.item[idKey], row_version: archiveTarget.item.row_version, reason }, { rowVersion: archiveTarget.item.row_version, idempotencyKey: createIdempotencyKey() });
      invalidate([
        archiveTarget.type === "account" ? "accounts.list" : "categories.list",
        "archive.list", "app.initialState", "dashboard.overview", "reports.monthly",
      ]);
      setResult({ status: "success", text: `${archiveTarget.type === "account" ? "Rekening" : "Kategori"} berhasil dipulihkan.` });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      await Promise.all([archiveResource.reload(), refreshAll()]);
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };

  const previewRestore = async () => {
    setRestoreBusy(true);
    setResult({ status: "loading", text: "Memvalidasi backup teknis..." });
    try {
      const data = await runSettingsAction("restore.preview", { backupFileId: backupFileId.trim() }, { idempotencyKey: createIdempotencyKey() });
      setRestorePreview(data);
      setResult({ status: "warning", text: `Backup schema ${data.schemaVersion} valid. Preview berlaku 10 menit.` });
    } catch (error) {
      setRestorePreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setRestoreBusy(false);
    }
  };

  const applyRestore = async () => {
    if (!restorePreview) return;
    setRestoreBusy(true);
    setResult({ status: "loading", text: "Membuat safety backup dan menjalankan restore guarded..." });
    try {
      await runSettingsAction("restore.apply", { backupFileId: backupFileId.trim(), previewToken: restorePreview.previewToken, confirmation: restoreConfirmation }, { idempotencyKey: createIdempotencyKey() });
      setRestorePreview(null);
      setRestoreConfirmation("");
      setResult({ status: "success", text: "Restore selesai setelah safety backup, transaction, dan integrity check backend." });
      await refreshAll();
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="recovery-settings-title">
        <RefreshWarning error={archiveResource.refreshError} onRetry={archiveResource.reload} />
        <div className={styles.pageHeading}>
          <p className="eyebrow">Pemulihan data</p>
          <h2 id="recovery-settings-title">Pulihkan item arsip atau backup teknis</h2>
          <p>Gunakan pemulihan per item untuk salah arsip. Full restore hanya untuk insiden terverifikasi dan tetap melalui preview, safety backup, maintenance lock, apply atomik, integrity check, dan audit.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Data arsip</p><h2>Pulihkan satu per satu</h2><p>Data yang pernah dipakai tidak dihapus permanen. Purge umum tetap dinonaktifkan.</p></div><FiArchive aria-hidden="true" /></div>
          {archiveResource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat data arsip...</p> : null}
          {archiveResource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{archiveResource.error?.message || "Data arsip belum dapat dimuat."}</span><Button type="button" onClick={archiveResource.reload}>Coba lagi</Button></div> : null}
          {archiveResource.status === "ready" ? (
            <div className="compact-list compact-list--stacked">
              {(archiveResource.data?.accounts || []).map((account) => <div key={account.account_id}><span><strong>{accountDisplayLabel(account)}</strong><small>Rekening diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "account", item: account }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {(archiveResource.data?.categories || []).map((category) => <div key={category.category_id}><span><strong>{category.name}</strong><small>Kategori · {categoryTypeLabel(category.transaction_type)}</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "category", item: category }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {!archiveResource.data?.accounts?.length && !archiveResource.data?.categories?.length ? <p className="empty-inline-message">Belum ada rekening atau kategori dalam arsip.</p> : null}
            </div>
          ) : null}
        </Card>
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Restore guarded</p><h2>Pulihkan backup teknis Turso</h2><p>Excel dan Google Sheets tidak dapat dipakai untuk restore.</p></div><FiDownloadCloud aria-hidden="true" /></div>
          <div className="form-grid">
            <label className="field form-grid__full"><span>Google Drive file ID backup teknis</span><input value={backupFileId} onChange={(event) => { setBackupFileId(event.target.value); setRestorePreview(null); setRestoreConfirmation(""); }} /></label>
            <div className="form-grid__full"><Button onClick={previewRestore} loading={restoreBusy && !restorePreview} disabled={!backupFileId.trim()}>Validasi dan preview</Button></div>
            {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Schema {restorePreview.schemaVersion} valid. Preview berlaku 10 menit.</span></div> : null}
            {restorePreview ? <label className="field form-grid__full"><span>Ketik RESTORE SALDO BERSAMA</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></label> : null}
            {restorePreview ? <div className="form-grid__full form-actions"><Button variant="primary" onClick={applyRestore} loading={restoreBusy} disabled={restoreConfirmation !== "RESTORE SALDO BERSAMA"}>Terapkan restore</Button></div> : null}
          </div>
        </Card>
        <div className="notice notice--warning"><FiShield aria-hidden="true" /><span>Jangan menjalankan full restore untuk kesalahan arsip biasa. Pilih item di atas agar dampak tetap terbatas.</span></div>
        <ConfirmationModal
          open={Boolean(archiveTarget)}
          title={archiveTarget?.type === "account" ? "Pulihkan rekening?" : "Pulihkan kategori?"}
          description={archiveTarget ? `${archiveTarget.item.name} akan aktif kembali setelah backend memeriksa konflik, kepemilikan, dan row version terbaru.` : ""}
          confirmLabel="Pulihkan data"
          reasonLabel="Alasan pemulihan"
          requireReason
          tone="primary"
          busy={archiveState.status === "submitting"}
          error={archiveState.error}
          onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)}
          onConfirm={restoreArchivedItem}
        />
      </section>
    </OwnerSettingsGuard>
  );
};

export default RecoveryPage;
