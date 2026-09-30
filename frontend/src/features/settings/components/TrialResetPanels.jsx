import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiRefreshCw, FiShield } from "react-icons/fi";
import { BalanceIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import { formatRupiah } from "../../../domain/money.js";
import { RESET_DOMAIN_LABELS, RESET_TRIAL_OPERATIONAL_LABELS, RESET_TRIAL_PRESERVED_LABELS } from "../resetSummaryLabels.js";
import { formatMaintenanceCount as formatCount } from "../settingsPresentation.js";
import styles from "./SettingsResetPanels.module.css";

const RESET_INTENT_STATE_LABELS = Object.freeze({ processing: "Sedang diproses", unknown: "Belum pasti", completed: "Selesai", missing: "Tidak ditemukan" });
const RESET_BACKUP_STATE_LABELS = Object.freeze({ pending: "Menunggu", processing: "Sedang dibuat", completed: "Selesai", verified: "Terverifikasi", failed: "Gagal" });

const intentStateLabel = (state) => RESET_INTENT_STATE_LABELS[state] || state || "Tidak tersedia";
const backupStateLabel = (state) => RESET_BACKUP_STATE_LABELS[state] || state || "Belum tersedia";
const count = (value) => Math.max(0, Number(value || 0));
const nonZeroEntries = (labels, summary) => labels.filter(([key]) => count(summary?.[key]) > 0);

const ResetFlowSteps = ({ activeStep }) => (
  <ol className={styles.resetFlowSteps} aria-label="Tahapan reset testing">
    {["Pilih reset", "Dampak", "Konfirmasi"].map((label, index) => {
      const step = index + 1;
      return <li key={label} className={step === activeStep ? styles.isActive : step < activeStep ? styles.isComplete : ""} aria-current={step === activeStep ? "step" : undefined}>
        <span>{step < activeStep ? <FiCheckCircle aria-hidden="true" /> : step}</span><small>{label}</small>
      </li>;
    })}
  </ol>
);

const ResetScopeSelector = ({ resetScope, activityScope, activityAndBalancesScope, setResetScope, setPreview, setResult }) => {
  const selectScope = (scope) => { setResetScope(scope); setPreview(null); setResult(null); };
  return (
    <fieldset className={styles.resetScopeSelector}>
      <legend><strong>Apa yang ingin dibersihkan?</strong><small>Pilih hasil akhir yang paling sesuai.</small></legend>
      <label className={resetScope === activityScope ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={activityScope} checked={resetScope === activityScope} onChange={() => selectScope(activityScope)} />
        <span className={styles.resetScopeIcon}><FiRefreshCw aria-hidden="true" /></span>
        <span><strong>Hapus data testing</strong><small>Data uji dihapus. Saldo awal rekening tetap.</small></span>
      </label>
      <label className={resetScope === activityAndBalancesScope ? styles.isSelected : ""}>
        <input type="radio" name="reset-testing-scope" value={activityAndBalancesScope} checked={resetScope === activityAndBalancesScope} onChange={() => selectScope(activityAndBalancesScope)} />
        <span className={styles.resetScopeIcon}><BalanceIcon aria-hidden="true" /></span>
        <span><strong>Hapus data + saldo awal</strong><small>Data uji dihapus dan saldo rekening pada preview menjadi Rp0.</small></span>
      </label>
    </fieldset>
  );
};

const ResetDetailRows = ({ labels, summary }) => {
  const entries = nonZeroEntries(labels, summary);
  if (!entries.length) return null;
  return <div className={styles.resetDetailRows}>{entries.map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatCount(summary?.[key])}</strong></div>)}</div>;
};

const ResetImpactPreview = ({ preview }) => {
  const totalRows = count(preview.summary?.totalRows);
  const balanceReset = preview.balanceReset;
  const balanceAffected = count(balanceReset?.accountsAffected);
  const hasDomain = nonZeroEntries(RESET_DOMAIN_LABELS, preview.summary).length > 0;
  const hasOperational = nonZeroEntries(RESET_TRIAL_OPERATIONAL_LABELS, preview.summary).length > 0;
  const preservedEntries = RESET_TRIAL_PRESERVED_LABELS.filter(([key]) => count(preview.preserved?.[key]) > 0);

  return (
    <section className={styles.resetImpactCard} aria-labelledby="reset-impact-title">
      <div className={styles.resetImpactHeader}>
        <div><strong id="reset-impact-title">Dampak reset</strong><small>Hanya informasi yang relevan ditampilkan.</small></div>
        <span>{formatCount(totalRows)} data</span>
      </div>

      <div className={styles.resetImpactSummary}>
        {totalRows > 0 ? <div><span>Data testing</span><strong>{formatCount(totalRows)} baris</strong></div> : <div><span>Data testing</span><strong>Tidak ada</strong></div>}
        {balanceAffected > 0 ? <div><span>Saldo rekening</span><strong>Menjadi Rp0</strong></div> : null}
      </div>

      <div className={styles.resetImpactSafeList}>
        <span><FiCheckCircle aria-hidden="true" />Rekening, kategori, investasi, dan pengguna tetap ada.</span>
        <span><FiCheckCircle aria-hidden="true" />Audit, backup, dan data pemulihan tetap disimpan.</span>
      </div>

      {hasDomain || hasOperational || balanceAffected > 0 || preservedEntries.length ? <details className={styles.resetImpactDetails}>
        <summary>Lihat rincian data</summary>
        <div className={styles.resetImpactDetailContent}>
          {hasDomain ? <div><strong>Aktivitas & perencanaan</strong><ResetDetailRows labels={RESET_DOMAIN_LABELS} summary={preview.summary} /></div> : null}
          {hasOperational ? <div><strong>Proses sementara</strong><ResetDetailRows labels={RESET_TRIAL_OPERATIONAL_LABELS} summary={preview.summary} /></div> : null}
          {balanceAffected > 0 ? <BalanceResetDetails balanceReset={balanceReset} /> : null}
          {preservedEntries.length ? <div><strong>Tetap disimpan</strong><div className={styles.resetDetailRows}>{preservedEntries.map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatCount(preview.preserved?.[key])}</strong></div>)}</div></div> : null}
        </div>
      </details> : null}
    </section>
  );
};

const BalanceResetDetails = ({ balanceReset }) => (
  <div>
    <strong>Saldo rekening</strong>
    <div className={styles.resetBalanceCompact}>
      <div><span>Total saldo saat ini</span><strong>{formatRupiah(balanceReset.totalCurrentBalance)} <span aria-hidden="true">→</span> Rp0</strong></div>
      {balanceReset.accounts?.map((account) => <div key={account.accountId}><span>{account.name}</span><strong>{formatRupiah(account.currentBalance)} → Rp0</strong></div>)}
    </div>
  </div>
);

const ResetSafetySummary = ({ driveReadiness, driveReady, statusBlocksReset }) => (
  <section className={`${styles.resetSafetySummary} ${!driveReady || statusBlocksReset ? styles.hasWarning : ""}`} aria-labelledby="reset-safety-title">
    <div className={styles.resetSafetyTitle}><FiShield aria-hidden="true" /><strong id="reset-safety-title">Keamanan sebelum reset</strong></div>
    <div className={styles.resetSafetyRows}>
      <div><span>Backup Google Drive</span><strong>{driveReady ? "Siap" : driveReadiness.label}</strong></div>
      <div><span>Status reset lain</span><strong>{statusBlocksReset ? "Perlu diperiksa" : "Tidak ada"}</strong></div>
      <div><span>Preview</span><strong>Valid</strong></div>
    </div>
    {!driveReady ? <p>Backup keamanan belum siap. <Link to="/pengaturan/integrasi">Periksa Integrasi Google</Link>.</p> : null}
  </section>
);

const ResetTestingFlow = ({ resetScope, setResetScope, activityScope, activityAndBalancesScope, previewState, statusBlocksReset, driveReadiness, driveReady, canOpenReset, apply, setResult }) => {
  const preview = previewState.preview;
  const backToScope = () => { previewState.setPreview(null); setResult(null); apply.setApplyError(null); };

  return (
    <div className={styles.resetTestingFlow}>
      <ResetFlowSteps activeStep={preview ? 2 : 1} />
      {!preview ? <div className={styles.resetFlowPanel}>
        <ResetScopeSelector resetScope={resetScope} activityScope={activityScope} activityAndBalancesScope={activityAndBalancesScope} setResetScope={setResetScope} setPreview={previewState.setPreview} setResult={setResult} />
        <Button variant="primary" icon={FiRefreshCw} loading={previewState.previewBusy} disabled={statusBlocksReset} onClick={previewState.loadPreview}>Lihat dampak</Button>
      </div> : <>
        <ResetImpactPreview preview={preview} />
        <ResetSafetySummary driveReadiness={driveReadiness} driveReady={driveReady} statusBlocksReset={statusBlocksReset} />
        <div className={styles.resetFlowActions}>
          <Button type="button" disabled={previewState.previewBusy} onClick={backToScope}>Ubah pilihan</Button>
          <Button variant="primary" disabled={!canOpenReset} onClick={() => { apply.setApplyError(null); apply.setConfirmationOpen(true); }}>Lanjutkan</Button>
        </div>
      </>}
    </div>
  );
};

const ResetConfirmationSummary = ({ preview }) => (
  <div className={styles.resetConfirmationSummary}>
    <ResetFlowSteps activeStep={3} />
    <ResetImpactPreview preview={preview} />
  </div>
);

const ResetConfirmationModal = ({ preview, open, busy, error, onCancel, onConfirm, resetBalances, acknowledgementItems }) => (
  <ConfirmationModal
    open={open}
    title="Konfirmasi reset testing"
    description={resetBalances ? "Data pada preview akan dihapus dan saldo rekening terkait menjadi Rp0 setelah safety backup." : "Data pada preview akan dihapus permanen setelah safety backup."}
    confirmLabel="Reset data"
    reasonLabel="Alasan reset"
    reasonPlaceholder="Contoh: Membersihkan data trial"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "BERSIHKAN DATA TESTING"}
    acknowledgementItems={acknowledgementItems}
    countdownSeconds={8}
    busy={busy}
    error={error}
    tone="danger"
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {preview ? <ResetConfirmationSummary preview={preview} /> : null}
  </ConfirmationModal>
);

const resetStatusPresentation = (status) => {
  const presentations = {
    processing: ["warning", "Operasi sebelumnya masih diproses", "Jangan kirim reset baru. Periksa status lagi sampai hasilnya pasti."],
    recovery_required: ["danger", "Mode pemulihan aktif", "Pemeriksaan konsistensi wajib lulus sebelum perubahan data dibuka kembali."],
    not_committed: ["warning", "Status operasi sebelumnya belum pasti", "Periksa data terbaru sebelum memulai reset baru."],
  };
  return presentations[status?.outcome] || null;
};

const ResetRecoveryPanel = ({ status, statusBusy, onCheck, onReloadPreview }) => {
  const presentation = resetStatusPresentation(status);
  if (!presentation) return null;
  const [tone, title, text] = presentation;
  return (
    <Card className={`${styles.resetRecoveryCard} ${styles[`resetRecoveryCard_${tone}`] || ""}`}>
      <div className={styles.resetRecoveryHeader}>
        <span className={styles.resetRecoveryIcon}><FiAlertTriangle aria-hidden="true" /></span>
        <div><h2>{title}</h2><p>{text}</p></div>
      </div>
      <div className={styles.resetRecoveryMeta}>
        <div><span>Status operasi</span><strong>{intentStateLabel(status.intent?.state)}</strong></div>
        <div><span>Mode pemulihan</span><strong>{status.maintenanceMode ? "Aktif" : "Normal"}</strong></div>
        <div><span>Safety backup</span><strong>{backupStateLabel(status.backup?.status)}</strong></div>
      </div>
      <div className={styles.resetRecoveryActions}>
        <Button type="button" icon={FiRefreshCw} loading={statusBusy} onClick={onCheck}>Periksa status</Button>
        {status.outcome === "not_committed" ? <Button type="button" variant="primary" icon={FiDatabase} onClick={onReloadPreview}>Buat preview baru</Button> : null}
      </div>
    </Card>
  );
};

const ResetStatusFailure = ({ resource, status, onCheck }) => ((resource.status === "error" || resource.refreshError) && !resetStatusPresentation(status) ? (
  <div className="notice notice--danger" role="alert"><FiAlertTriangle aria-hidden="true" /><span><strong>Status reset belum dapat diverifikasi.</strong> Reset tetap diblokir sampai status operasi dipastikan aman.</span><Button type="button" icon={FiRefreshCw} loading={resource.isRefreshing} onClick={onCheck}>Periksa status</Button></div>
) : null);

export { ResetConfirmationModal, ResetRecoveryPanel, ResetStatusFailure, ResetTestingFlow };
