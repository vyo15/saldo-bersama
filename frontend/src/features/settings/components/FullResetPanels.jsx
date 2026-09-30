import { FiAlertTriangle, FiCheckCircle, FiDatabase, FiRefreshCw, FiShield } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import MaintenanceRecoveryPanel from "../MaintenanceRecoveryPanel.jsx";
import { RESET_DOMAIN_LABELS, RESET_MASTER_LABELS, RESET_OPERATIONAL_LABELS } from "../resetSummaryLabels.js";
import { formatMaintenanceCount as formatCount } from "../settingsPresentation.js";
import styles from "./SettingsResetPanels.module.css";

const count = (value) => Math.max(0, Number(value || 0));
const nonZeroEntries = (labels, summary) => labels.filter(([key]) => count(summary?.[key]) > 0);

const FullResetFlowSteps = ({ activeStep }) => (
  <ol className={styles.resetFlowSteps} aria-label="Tahapan reset semua data">
    {["Preview", "Keamanan", "Konfirmasi"].map((label, index) => {
      const step = index + 1;
      return <li key={label} className={step === activeStep ? styles.isActive : step < activeStep ? styles.isComplete : ""} aria-current={step === activeStep ? "step" : undefined}>
        <span>{step < activeStep ? <FiCheckCircle aria-hidden="true" /> : step}</span><small>{label}</small>
      </li>;
    })}
  </ol>
);

const FullResetDetailRows = ({ labels, summary }) => {
  const entries = nonZeroEntries(labels, summary);
  if (!entries.length) return null;
  return <div className={styles.resetDetailRows}>{entries.map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatCount(summary?.[key])}</strong></div>)}</div>;
};

const FullResetImpactPreview = ({ preview }) => {
  const totalRows = count(preview.summary?.totalRows);
  const masterRows = count(preview.summary?.masterRows);
  const domainRows = count(preview.summary?.domainRows);
  const operationalRows = count(preview.summary?.operationalRows);
  const preserved = [
    ["Pengguna", preview.preserved?.users], ["Audit log", preview.preserved?.audit], ["Riwayat backup", preview.preserved?.backups],
    ["Pemeriksaan integritas", preview.preserved?.integrityRuns], ["Data pemulihan", preview.preserved?.idempotencyKeys],
  ].filter(([, value]) => count(value) > 0);

  return (
    <section className={`${styles.resetImpactCard} ${styles.fullResetImpact}`} aria-labelledby="full-reset-impact-title">
      <div className={styles.resetImpactHeader}>
        <div><strong id="full-reset-impact-title">Dampak reset penuh</strong><small>Hanya kelompok data yang berisi yang ditampilkan.</small></div>
        <span>{formatCount(totalRows)} data</span>
      </div>
      <div className={styles.resetImpactSummary}>
        <div><span>Data aplikasi</span><strong>{totalRows > 0 ? `${formatCount(totalRows)} baris` : "Tidak ada"}</strong></div>
        {masterRows > 0 ? <div><span>Master finansial</span><strong>{formatCount(masterRows)} baris</strong></div> : null}
      </div>
      <div className={styles.resetImpactSafeList}>
        <span><FiCheckCircle aria-hidden="true" />Pengguna, audit, dan backup tetap disimpan.</span>
        <span><FiCheckCircle aria-hidden="true" />Struktur database dan data pemulihan tetap tersedia.</span>
      </div>
      {domainRows > 0 || masterRows > 0 || operationalRows > 0 || preserved.length ? <details className={styles.resetImpactDetails}>
        <summary>Lihat rincian data</summary>
        <div className={styles.resetImpactDetailContent}>
          {domainRows > 0 ? <div><strong>Finansial & perencanaan</strong><FullResetDetailRows labels={RESET_DOMAIN_LABELS} summary={preview.summary} /></div> : null}
          {masterRows > 0 ? <div><strong>Master aplikasi</strong><FullResetDetailRows labels={RESET_MASTER_LABELS} summary={preview.summary} /></div> : null}
          {operationalRows > 0 ? <div><strong>Data operasional</strong><FullResetDetailRows labels={RESET_OPERATIONAL_LABELS} summary={preview.summary} /></div> : null}
          {preserved.length ? <div><strong>Tetap disimpan</strong><div className={styles.resetDetailRows}>{preserved.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatCount(value)}</strong></div>)}</div></div> : null}
        </div>
      </details> : null}
    </section>
  );
};

const FullResetSafetySummary = ({ driveReadiness, driveReady, statusBlocked }) => (
  <section className={`${styles.resetSafetySummary} ${!driveReady || statusBlocked ? styles.hasWarning : ""}`} aria-labelledby="full-reset-safety-title">
    <div className={styles.resetSafetyTitle}><FiShield aria-hidden="true" /><strong id="full-reset-safety-title">Keamanan sebelum reset</strong></div>
    <div className={styles.resetSafetyRows}>
      <div><span>Backup Google Drive</span><strong>{driveReady ? "Siap" : driveReadiness.label}</strong></div>
      <div><span>Status reset lain</span><strong>{statusBlocked ? "Perlu diperiksa" : "Tidak ada"}</strong></div>
      <div><span>Preview</span><strong>Valid</strong></div>
    </div>
    {!driveReady ? <p>Backup keamanan belum siap. <Link to="/pengaturan/integrasi">Periksa Integrasi Google</Link>.</p> : null}
  </section>
);

const FullResetFlow = ({ preview, statusBlocked, driveReadiness, driveReady, canOpenReset, apply, setResult }) => {
  const currentPreview = preview.preview;
  const clearPreview = () => { preview.setPreview(null); setResult(null); apply.setApplyError(null); };
  return (
    <div className={styles.resetTestingFlow}>
      <FullResetFlowSteps activeStep={currentPreview ? 2 : 1} />
      {!currentPreview ? <div className={styles.resetFlowPanel}>
        <div className={styles.fullResetIntro}><FiDatabase aria-hidden="true" /><span><strong>Reset ke kondisi awal</strong><small>Rekening, kategori, transaksi, perencanaan, dan data operasional akan masuk preview sebelum dihapus.</small></span></div>
        <Button variant="primary" icon={FiRefreshCw} loading={preview.previewBusy} disabled={statusBlocked} onClick={preview.loadPreview}>Lihat dampak</Button>
      </div> : <>
        <FullResetImpactPreview preview={currentPreview} />
        <FullResetSafetySummary driveReadiness={driveReadiness} driveReady={driveReady} statusBlocked={statusBlocked} />
        <div className={styles.resetFlowActions}>
          <Button type="button" disabled={preview.previewBusy} onClick={clearPreview}>Buat ulang preview</Button>
          <Button variant="danger" disabled={!canOpenReset} onClick={() => { apply.setApplyError(null); apply.setConfirmationOpen(true); }}>Lanjutkan</Button>
        </div>
      </>}
    </div>
  );
};

const FullResetConfirmation = ({ preview, open, busy, error, onCancel, onConfirm, acknowledgementItems }) => (
  <ConfirmationModal
    open={open}
    title="Konfirmasi reset semua data"
    description="Data pada preview akan dihapus setelah safety backup. Pengguna, audit, backup, dan struktur database tetap disimpan."
    confirmLabel="Reset semua data"
    reasonLabel="Alasan full reset"
    reasonPlaceholder="Contoh: Mengembalikan aplikasi ke kondisi awal"
    requireReason
    expectedConfirmation={preview?.confirmationPhrase || "RESET SEMUA DATA SALDO BERSAMA"}
    acknowledgementItems={acknowledgementItems}
    countdownSeconds={15}
    busy={busy}
    error={error}
    tone="danger"
    onCancel={onCancel}
    onConfirm={onConfirm}
  >
    {preview ? <div className={styles.resetConfirmationSummary}><FullResetFlowSteps activeStep={3} /><FullResetImpactPreview preview={preview} /></div> : null}
  </ConfirmationModal>
);

const FullResetStatusPanels = ({ status, statusResource, recovery }) => (
  <>
    <MaintenanceRecoveryPanel maintenanceMode={Boolean(status?.maintenanceMode)} busy={recovery.recoveryBusy} onRecover={recovery.recoverMaintenance} description="Reset penuh sebelumnya meninggalkan mode pemulihan aktif. Pemeriksaan konsistensi data wajib lulus sebelum perubahan data dibuka kembali." />
    {(statusResource.status === "error" || statusResource.refreshError) && !["processing", "not_committed"].includes(status?.outcome) ? (
      <div className="notice notice--danger" role="alert"><FiAlertTriangle aria-hidden="true" /><span><strong>Status full reset belum dapat diverifikasi.</strong> Operasi tetap diblokir sampai status server dapat dibaca.</span><Button type="button" icon={FiRefreshCw} loading={statusResource.isRefreshing} onClick={recovery.checkStatus}>Periksa status</Button></div>
    ) : null}
    {["processing", "not_committed"].includes(status?.outcome) ? (
      <Card className={`${styles.resetRecoveryCard} ${styles.resetRecoveryCard_warning}`}>
        <div className={styles.resetRecoveryHeader}><span className={styles.resetRecoveryIcon}><FiAlertTriangle aria-hidden="true" /></span><div><h2>{status.outcome === "processing" ? "Full reset masih diproses" : "Hasil full reset belum pasti"}</h2><p>Jangan kirim reset baru sebelum status operasi sebelumnya dipastikan.</p></div></div>
        <div className={styles.resetRecoveryActions}><Button type="button" icon={FiRefreshCw} onClick={recovery.checkStatus}>Periksa status</Button></div>
      </Card>
    ) : null}
  </>
);

export { FullResetConfirmation, FullResetFlow, FullResetStatusPanels };
