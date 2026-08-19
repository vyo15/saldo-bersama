import { useState } from "react";
import { FiArchive, FiDownloadCloud, FiRotateCcw, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { formatDateTimeJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { categoryTypeLabel } from "../../shared/presentation/category.js";
import MaintenanceRecoveryPanel from "./MaintenanceRecoveryPanel.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { runSettingsAction } from "./settings.api.js";
import { useMaintenanceRecovery } from "./useMaintenanceRecovery.js";
import styles from "./Settings.module.css";

const RECOVERY_TYPES = Object.freeze({
  account: { action: "accounts.restore", idKey: "account_id", label: "Rekening" },
  category: { action: "categories.restore", idKey: "category_id", label: "Kategori" },
  envelopeRule: { action: "envelopes.restoreRule", idKey: "envelope_rule_id", label: "Alokasi" },
  goal: { action: "goals.restore", idKey: "goal_id", label: "Target" },
  recurringRule: { action: "recurring.restoreRule", idKey: "recurring_rule_id", label: "Aturan rutin" },
  budget: { action: "budgets.restore", idKey: "budget_id", label: "Kebutuhan" },
});
const RESTORE_REFRESH_KEYS = Object.freeze([
  "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
  "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly",
  "periods.list", "reconciliations.list", "users.list", "audit.list", "archive.list",
  "notifications.status", "notifications.preferences", "integrations.status", "system.health", "reset.status",
]);
const RESTORE_ACKNOWLEDGEMENTS = Object.freeze([
  "Saya sudah memastikan file dan waktu backup yang akan dipulihkan sudah benar.",
  "Saya memahami restore akan mengganti dataset aktif dengan isi backup yang dipreview.",
  "Saya memahami safety backup baru dibuat sebelum restore dan maintenance tetap aktif jika integrity check gagal.",
]);
const RESTORE_TABLES = Object.freeze([
  ["transactions", "Transaksi"], ["accounts", "Rekening"], ["categories", "Kategori"], ["users", "Pengguna"],
  ["envelope_rules", "Aturan alokasi"], ["savings_goals", "Target"], ["recurring_rules", "Jadwal rutin"],
  ["budgets", "Kebutuhan"], ["audit_log", "Audit log"],
]);

const formatCount = (value) => Number(value || 0).toLocaleString("id-ID");
const formatRecoveryDateTime = (value) => formatDateTimeJakarta(value, { fallback: "Tidak tersedia" });

const archiveGroups = (data = {}) => [
  ["account", data.accounts || [], (item) => accountDisplayLabel(item), () => "Rekening diarsipkan"],
  ["category", data.categories || [], (item) => item.name, (item) => `Kategori · ${categoryTypeLabel(item.transaction_type)}`],
  ["envelopeRule", data.envelopeRules || [], (item) => item.name, () => "Alokasi/alokasi diarsipkan"],
  ["goal", data.goals || [], (item) => item.name, () => "Target tabungan diarsipkan"],
  ["recurringRule", data.recurringRules || [], (item) => item.name, () => "Aturan rutin diarsipkan"],
  ["budget", data.budgets || [], (item) => item.name, (item) => `Kebutuhan ${item.period_key} diarsipkan`],
];

const archivedItemId = (type, item) => item[RECOVERY_TYPES[type].idKey];

const ArchiveItems = ({ data, openRestore }) => {
  const groups = archiveGroups(data);
  const empty = groups.every(([, items]) => items.length === 0);
  return <div className="compact-list compact-list--stacked">{groups.flatMap(([type, items, title, detail]) => items.map((item) => <div key={`${type}-${archivedItemId(type, item)}`}><span><strong>{title(item)}</strong><small>{detail(item)}</small></span><Button icon={FiRotateCcw} type="button" onClick={() => openRestore(type, item)}>Pulihkan</Button></div>))}{empty ? <p className="empty-inline-message">Belum ada data dalam arsip.</p> : null}</div>;
};

const ArchivePanel = ({ resource, openRestore }) => <Card className="panel">
  <div className="panel__header"><div><h2>Item diarsipkan</h2></div><FiArchive aria-hidden="true" /></div>
  {resource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat data arsip...</p> : null}
  {resource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{resource.error?.message || "Data arsip belum dapat dimuat."}</span><Button type="button" onClick={resource.reload}>Coba lagi</Button></div> : null}
  {resource.status === "ready" ? <ArchiveItems data={resource.data} openRestore={openRestore} /> : null}
</Card>;

const RestorePreviewSummary = ({ preview, compact = false }) => {
  if (!preview) return null;
  return (
    <div className={`${styles.restorePreview}${compact ? ` ${styles.restorePreviewCompact}` : ""}`}>
      <div className={styles.restorePreviewIdentity}>
        <div><span>File backup</span><strong>{preview.fileName || "Tidak tersedia"}</strong></div>
        <div><span>Dibuat</span><strong>{formatRecoveryDateTime(preview.createdAt)}</strong></div>
        <div><span>Schema</span><strong>v{preview.schemaVersion || "-"}</strong></div>
      </div>
      <div className={styles.restorePreviewGrid} aria-label="Jumlah data dalam backup">
        {RESTORE_TABLES.map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatCount(preview.tables?.[key])}</strong></div>)}
      </div>
    </div>
  );
};

const RestorePanel = ({ backupFileId, setBackupFileId, restorePreview, restoreBusy, healthReady, maintenanceMode, previewRestore, openConfirmation }) => <Card className="panel">
  <div className="panel__header"><div><h2>Pulihkan backup</h2><p>Gunakan hanya backup teknis Google Drive yang sudah diverifikasi.</p></div><FiDownloadCloud aria-hidden="true" /></div>
  <div className="form-grid">
    <label className="field form-grid__full"><span>Google Drive file ID backup teknis</span><input value={backupFileId} onChange={(event) => setBackupFileId(event.target.value)} /></label>
    <div className="form-grid__full"><Button onClick={previewRestore} loading={restoreBusy && !restorePreview} disabled={!backupFileId.trim() || !healthReady || maintenanceMode}>Validasi dan preview</Button></div>
    {!healthReady ? <div className="notice notice--warning form-grid__full"><span>Status backend dan maintenance belum terverifikasi. Muat ulang status sebelum memulai full restore.</span></div> : null}
    {maintenanceMode ? <div className="notice notice--warning form-grid__full"><span>Restore baru diblokir karena maintenance aktif. Jalankan recovery terlebih dahulu.</span></div> : null}
    {restorePreview ? <div className="notice notice--warning form-grid__full"><span>Backup valid. Periksa identitas dan jumlah data dengan teliti. Preview berlaku 10 menit.</span></div> : null}
    {restorePreview ? <div className="form-grid__full"><RestorePreviewSummary preview={restorePreview} /></div> : null}
    {restorePreview ? <div className="form-grid__full form-actions"><Button variant="danger" onClick={openConfirmation} loading={restoreBusy} disabled={!healthReady || maintenanceMode}>Tinjau & terapkan restore</Button></div> : null}
  </div>
</Card>;

const RestoreConfirmation = ({ preview, open, busy, error, onCancel, onConfirm }) => (
  <ConfirmationModal
    open={open}
    title="Pulihkan seluruh data dari backup?"
    description="Dataset aktif akan diganti dengan isi backup yang sudah dipreview. Safety backup baru dibuat sebelum perubahan dimulai."
    confirmLabel="Pulihkan backup"
    reasonLabel="Alasan restore"
    reasonPlaceholder="Contoh: Memulihkan kondisi sebelum import yang salah"
    requireReason
    expectedConfirmation="RESTORE SALDO BERSAMA"
    acknowledgementItems={RESTORE_ACKNOWLEDGEMENTS}
    countdownSeconds={10}
    busy={busy}
    error={error}
    tone="danger"
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    <RestorePreviewSummary preview={preview} compact />
  </ConfirmationModal>
);

const useArchiveRecovery = ({ archiveResource, invalidate, refreshAll, setResult }) => {
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });

  const openRestore = (type, item) => {
    setArchiveTarget({ type, item });
    setArchiveState({ status: "idle", error: null });
  };

  const restoreArchivedItem = async (reason) => {
    if (!archiveTarget) return;
    const config = RECOVERY_TYPES[archiveTarget.type];
    if (!config) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      await runSettingsAction(config.action, {
        [config.idKey]: archiveTarget.item[config.idKey],
        row_version: archiveTarget.item.row_version,
        reason,
      }, { rowVersion: archiveTarget.item.row_version });
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

  return { archiveTarget, setArchiveTarget, archiveState, openRestore, restoreArchivedItem };
};

const useFullRestore = ({ archiveResource, healthResource, healthReady, maintenanceMode, invalidate, refreshAll, setResult }) => {
  const [backupFileId, setBackupFileIdState] = useState("");
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreConfirmationOpen, setRestoreConfirmationOpen] = useState(false);
  const [restoreError, setRestoreError] = useState(null);

  const setBackupFileId = (value) => {
    setBackupFileIdState(value);
    setRestorePreview(null);
    setRestoreConfirmationOpen(false);
    setRestoreError(null);
  };

  const previewRestore = async () => {
    if (!healthReady || maintenanceMode) return;
    setRestoreBusy(true);
    setRestoreError(null);
    setResult({ status: "loading", text: "Memvalidasi checksum, schema, dan isi backup teknis..." });
    try {
      const data = await runSettingsAction("restore.preview", { backupFileId: backupFileId.trim() }, {});
      setRestorePreview(data);
      setResult({ status: "warning", text: "Backup valid. Cocokkan nama file, waktu, schema, dan jumlah data sebelum restore." });
    } catch (error) {
      setRestorePreview(null);
      setResult({ status: "danger", text: error.message });
    } finally {
      setRestoreBusy(false);
    }
  };

  const applyRestore = async (reason, confirmationState) => {
    if (!restorePreview || !healthReady || maintenanceMode) return;
    setRestoreBusy(true);
    setRestoreError(null);
    setResult({ status: "loading", text: "Membuat safety backup dan menjalankan restore guarded..." });
    try {
      await runSettingsAction("restore.apply", {
        backupFileId: backupFileId.trim(),
        previewToken: restorePreview.previewToken,
        confirmation: confirmationState.confirmation,
        acknowledged: confirmationState.acknowledged,
        reason,
      }, {});
      setRestoreConfirmationOpen(false);
      setRestorePreview(null);
      setResult({ status: "success", text: "Pemulihan selesai. Integrity check lulus dan dataset aktif sudah diverifikasi." });
      invalidate(RESTORE_REFRESH_KEYS);
      await Promise.allSettled([refreshAll(), archiveResource.reload(), healthResource.reload()]);
    } catch (error) {
      setRestoreError(error);
      setResult({ status: "danger", text: error.message });
      const health = await healthResource.reload().catch(() => null);
      if (health?.maintenanceMode) setRestoreConfirmationOpen(false);
    } finally {
      setRestoreBusy(false);
    }
  };

  const openConfirmation = () => {
    setRestoreError(null);
    setRestoreConfirmationOpen(true);
  };
  const cancelConfirmation = () => {
    if (restoreBusy) return;
    setRestoreConfirmationOpen(false);
    setRestoreError(null);
  };

  return {
    backupFileId, setBackupFileId, restorePreview, restoreBusy, restoreConfirmationOpen, restoreError,
    previewRestore, applyRestore, openConfirmation, cancelConfirmation,
  };
};

const RecoveryPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const archiveResource = useApiResource("archive.list", {}, { enabled: ownerMode });
  const healthResource = useApiResource("system.health", {}, { enabled: ownerMode });
  const [result, setResult] = useState(null);
  const healthReady = healthResource.status === "ready";
  const maintenanceMode = healthReady && Boolean(healthResource.data?.maintenanceMode);
  const archive = useArchiveRecovery({ archiveResource, invalidate, refreshAll, setResult });
  const restore = useFullRestore({ archiveResource, healthResource, healthReady, maintenanceMode, invalidate, refreshAll, setResult });
  const maintenance = useMaintenanceRecovery({
    invalidate,
    setResult,
    onSuccess: () => Promise.allSettled([healthResource.reload(), refreshAll()]),
  });

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="recovery-settings-title">
        <RefreshWarning error={archiveResource.refreshError || healthResource.refreshError} onRetry={() => Promise.all([archiveResource.reload(), healthResource.reload()])} />
        <div className={styles.pageHeading}><h2 id="recovery-settings-title">Pemulihan data</h2><p>Pulihkan item arsip secara terbatas atau lakukan full restore hanya setelah preview backup terverifikasi.</p></div>
        <SettingsNotice result={result} />
        <MaintenanceRecoveryPanel maintenanceMode={maintenanceMode} busy={maintenance.maintenanceBusy} onRecover={maintenance.recoverMaintenance} description="Restore atau maintenance sebelumnya belum selesai dengan kondisi yang dapat dipastikan. Integrity check wajib lulus sebelum operasi baru." />
        <ArchivePanel resource={archiveResource} openRestore={archive.openRestore} />
        <RestorePanel backupFileId={restore.backupFileId} setBackupFileId={restore.setBackupFileId} restorePreview={restore.restorePreview} restoreBusy={restore.restoreBusy} healthReady={healthReady} maintenanceMode={maintenanceMode} previewRestore={restore.previewRestore} openConfirmation={restore.openConfirmation} />
        <div className="notice notice--warning"><FiShield aria-hidden="true" /><span>Jangan menjalankan full restore untuk kesalahan arsip biasa. Pilih item arsip agar dampak tetap terbatas.</span></div>
        <ConfirmationModal open={Boolean(archive.archiveTarget)} title={archive.archiveTarget ? `Pulihkan ${RECOVERY_TYPES[archive.archiveTarget.type]?.label?.toLowerCase() || "data"}?` : "Pulihkan data?"} description={archive.archiveTarget ? `${archive.archiveTarget.item.name} akan aktif kembali setelah validasi terbaru.` : ""} confirmLabel="Pulihkan data" reasonLabel="Alasan pemulihan" requireReason tone="primary" busy={archive.archiveState.status === "submitting"} error={archive.archiveState.error} onCancel={() => archive.archiveState.status !== "submitting" && archive.setArchiveTarget(null)} onConfirm={archive.restoreArchivedItem} />
        <RestoreConfirmation preview={restore.restorePreview} open={restore.restoreConfirmationOpen} busy={restore.restoreBusy} error={restore.restoreError} onCancel={restore.cancelConfirmation} onConfirm={restore.applyRestore} />
      </section>
    </OwnerSettingsGuard>
  );
};

export default RecoveryPage;
