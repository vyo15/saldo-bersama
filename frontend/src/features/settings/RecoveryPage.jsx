import { useState } from "react";
import { FiArchive, FiDownloadCloud, FiRotateCcw, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { categoryTypeLabel } from "../../shared/presentation/category.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const RECOVERY_TYPES = Object.freeze({
  account: { action: "accounts.restore", idKey: "account_id", label: "Rekening" },
  category: { action: "categories.restore", idKey: "category_id", label: "Kategori" },
  envelopeRule: { action: "envelopes.restoreRule", idKey: "envelope_rule_id", label: "Kantong" },
  goal: { action: "goals.restore", idKey: "goal_id", label: "Target" },
  recurringRule: { action: "recurring.restoreRule", idKey: "recurring_rule_id", label: "Aturan rutin" },
  budget: { action: "budgets.restore", idKey: "budget_id", label: "Anggaran" },
});

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
    const config = RECOVERY_TYPES[archiveTarget.type];
    if (!config) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      await runSettingsAction(config.action, { [config.idKey]: archiveTarget.item[config.idKey], row_version: archiveTarget.item.row_version, reason }, { rowVersion: archiveTarget.item.row_version });
      invalidate([
        "accounts.list", "categories.list", "envelopes.list", "goals.list", "recurring.list", "budgets.list",
        "archive.list", "app.initialState", "dashboard.overview", "reports.monthly",
      ]);
      setResult({ status: "success", text: `${config.label} berhasil dipulihkan.` });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      await Promise.allSettled([archiveResource.reload(), refreshAll()]);
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };

  const previewRestore = async () => {
    setRestoreBusy(true);
    setResult({ status: "loading", text: "Memvalidasi backup teknis..." });
    try {
      const data = await runSettingsAction("restore.preview", { backupFileId: backupFileId.trim() }, {});
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
      await runSettingsAction("restore.apply", { backupFileId: backupFileId.trim(), previewToken: restorePreview.previewToken, confirmation: restoreConfirmation }, {});
      setRestorePreview(null);
      setRestoreConfirmation("");
      setResult({ status: "success", text: "Restore selesai setelah safety backup, transaction, dan integrity check backend." });
      await Promise.allSettled([refreshAll()]);
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
              {(archiveResource.data?.envelopeRules || []).map((rule) => <div key={rule.envelope_rule_id}><span><strong>{rule.name}</strong><small>Kantong/alokasi diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "envelopeRule", item: rule }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {(archiveResource.data?.goals || []).map((goal) => <div key={goal.goal_id}><span><strong>{goal.name}</strong><small>Target tabungan diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "goal", item: goal }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {(archiveResource.data?.recurringRules || []).map((rule) => <div key={rule.recurring_rule_id}><span><strong>{rule.name}</strong><small>Aturan rutin diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "recurringRule", item: rule }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {(archiveResource.data?.budgets || []).map((budget) => <div key={budget.budget_id}><span><strong>{budget.name}</strong><small>Anggaran {budget.period_key} diarsipkan</small></span><Button icon={FiRotateCcw} type="button" onClick={() => { setArchiveTarget({ type: "budget", item: budget }); setArchiveState({ status: "idle", error: null }); }}>Pulihkan</Button></div>)}
              {!archiveResource.data?.accounts?.length && !archiveResource.data?.categories?.length && !archiveResource.data?.envelopeRules?.length && !archiveResource.data?.goals?.length && !archiveResource.data?.recurringRules?.length && !archiveResource.data?.budgets?.length ? <p className="empty-inline-message">Belum ada data dalam arsip.</p> : null}
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
          title={archiveTarget ? `Pulihkan ${RECOVERY_TYPES[archiveTarget.type]?.label?.toLowerCase() || "data"}?` : "Pulihkan data?"}
          description={archiveTarget ? `${archiveTarget.item.name} akan aktif kembali setelah backend memeriksa dependensi, konflik, kepemilikan, dan row version terbaru.` : ""}
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
