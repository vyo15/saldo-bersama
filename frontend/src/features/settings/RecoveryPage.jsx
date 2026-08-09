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

const archiveGroups = (data = {}) => [
  ["account", data.accounts || [], (item) => accountDisplayLabel(item), () => "Rekening diarsipkan"],
  ["category", data.categories || [], (item) => item.name, (item) => `Kategori · ${categoryTypeLabel(item.transaction_type)}`],
  ["envelopeRule", data.envelopeRules || [], (item) => item.name, () => "Kantong/alokasi diarsipkan"],
  ["goal", data.goals || [], (item) => item.name, () => "Target tabungan diarsipkan"],
  ["recurringRule", data.recurringRules || [], (item) => item.name, () => "Aturan rutin diarsipkan"],
  ["budget", data.budgets || [], (item) => item.name, (item) => `Anggaran ${item.period_key} diarsipkan`],
];

const archivedItemId = (type, item) => item[RECOVERY_TYPES[type].idKey];

const ArchiveItems = ({ data, openRestore }) => {
  const groups = archiveGroups(data);
  const empty = groups.every(([, items]) => items.length === 0);
  return <div className="compact-list compact-list--stacked">{groups.flatMap(([type, items, title, detail]) => items.map((item) => <div key={`${type}-${archivedItemId(type, item)}`}><span><strong>{title(item)}</strong><small>{detail(item)}</small></span><Button icon={FiRotateCcw} type="button" onClick={() => openRestore(type, item)}>Pulihkan</Button></div>))}{empty ? <p className="empty-inline-message">Belum ada data dalam arsip.</p> : null}</div>;
};

const ArchivePanel = ({ resource, openRestore }) => <Card className="panel">
  <div className="panel__header"><div><p className="eyebrow">Data arsip</p><h2>Pulihkan satu per satu</h2><p>Data yang pernah dipakai tidak dihapus permanen. Purge umum tetap dinonaktifkan.</p></div><FiArchive aria-hidden="true" /></div>
  {resource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat data arsip...</p> : null}
  {resource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{resource.error?.message || "Data arsip belum dapat dimuat."}</span><Button type="button" onClick={resource.reload}>Coba lagi</Button></div> : null}
  {resource.status === "ready" ? <ArchiveItems data={resource.data} openRestore={openRestore} /> : null}
</Card>;

const RestorePanel = ({ backupFileId, setBackupFileId, restorePreview, setRestorePreview, restoreConfirmation, setRestoreConfirmation, restoreBusy, previewRestore, applyRestore }) => <Card className="panel">
  <div className="panel__header"><div><p className="eyebrow">Restore guarded</p><h2>Pulihkan backup teknis Turso</h2><p>Excel dan Google Sheets tidak dapat dipakai untuk restore.</p></div><FiDownloadCloud aria-hidden="true" /></div>
  <div className="form-grid">
    <label className="field form-grid__full"><span>Google Drive file ID backup teknis</span><input value={backupFileId} onChange={(event) => { setBackupFileId(event.target.value); setRestorePreview(null); setRestoreConfirmation(""); }} /></label>
    <div className="form-grid__full"><Button onClick={previewRestore} loading={restoreBusy && !restorePreview} disabled={!backupFileId.trim()}>Validasi dan preview</Button></div>
    {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Schema {restorePreview.schemaVersion} valid. Preview berlaku 10 menit.</span></div> : null}
    {restorePreview ? <label className="field form-grid__full"><span>Ketik RESTORE SALDO BERSAMA</span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></label> : null}
    {restorePreview ? <div className="form-grid__full form-actions"><Button variant="primary" onClick={applyRestore} loading={restoreBusy} disabled={restoreConfirmation !== "RESTORE SALDO BERSAMA"}>Terapkan restore</Button></div> : null}
  </div>
</Card>;

const RecoveryView = ({ resource, result, openRestore, restoreProps, archiveTarget, archiveState, setArchiveTarget, restoreArchivedItem }) => <OwnerSettingsGuard><section className={styles.pageContent} aria-labelledby="recovery-settings-title">
  <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
  <div className={styles.pageHeading}><p className="eyebrow">Pemulihan data</p><h2 id="recovery-settings-title">Pulihkan item arsip atau backup teknis</h2><p>Gunakan pemulihan per item untuk salah arsip. Full restore hanya untuk insiden terverifikasi dan tetap melalui preview, safety backup, maintenance lock, apply atomik, integrity check, dan audit.</p></div>
  <SettingsNotice result={result} /><ArchivePanel resource={resource} openRestore={openRestore} /><RestorePanel {...restoreProps} />
  <div className="notice notice--warning"><FiShield aria-hidden="true" /><span>Jangan menjalankan full restore untuk kesalahan arsip biasa. Pilih item di atas agar dampak tetap terbatas.</span></div>
  <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget ? `Pulihkan ${RECOVERY_TYPES[archiveTarget.type]?.label?.toLowerCase() || "data"}?` : "Pulihkan data?"} description={archiveTarget ? `${archiveTarget.item.name} akan aktif kembali setelah backend memeriksa dependensi, konflik, kepemilikan, dan row version terbaru.` : ""} confirmLabel="Pulihkan data" reasonLabel="Alasan pemulihan" requireReason tone="primary" busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={restoreArchivedItem} />
</section></OwnerSettingsGuard>;

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

  const openRestore = (type, item) => { setArchiveTarget({ type, item }); setArchiveState({ status: "idle", error: null }); };
  const restoreProps = { backupFileId, setBackupFileId, restorePreview, setRestorePreview, restoreConfirmation, setRestoreConfirmation, restoreBusy, previewRestore, applyRestore };
  return <RecoveryView resource={archiveResource} result={result} openRestore={openRestore} restoreProps={restoreProps} archiveTarget={archiveTarget} archiveState={archiveState} setArchiveTarget={setArchiveTarget} restoreArchivedItem={restoreArchivedItem} />;
};

export default RecoveryPage;
