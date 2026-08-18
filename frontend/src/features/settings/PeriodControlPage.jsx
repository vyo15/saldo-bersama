import { useState } from "react";
import { FiCheckCircle, FiLock, FiUnlock } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, previousMonthInJakarta } from "../../domain/dates.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { invalidationActionsFor } from "../../services/api/invalidation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { reopenPeriod as requestReopenPeriod, runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const PeriodPanels = ({ resource, form, setForm, previewPeriodClose, runIntegrity, integrityBusy, closeState, setReopenTarget, setReopenState }) => <>
  <div className="two-column-grid">
    <Card className="panel"><div className="panel__header"><div><h2>Periksa integritas</h2></div><FiCheckCircle aria-hidden="true" /></div><Button variant="primary" onClick={runIntegrity} loading={integrityBusy} disabled={integrityBusy}>Periksa integritas</Button></Card>
    <Card className="panel"><div className="panel__header"><div><h2>Tutup periode</h2></div><FiLock aria-hidden="true" /></div><form className="form-grid" onSubmit={previewPeriodClose}><label className="field"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={form.period_key} onChange={(event) => setForm((current) => ({ ...current, period_key: event.target.value }))} /></label><label className="field form-grid__full"><span>Catatan penutupan</span><input required maxLength="200" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></label><div className="form-grid__full form-actions"><Button variant="primary" type="submit" loading={closeState.status === "submitting"} disabled={closeState.status === "submitting"}>Validasi dan tutup periode</Button></div></form></Card>
  </div>
  <Card className="panel"><div className="panel__header"><div><h2>Riwayat periode</h2></div><FiUnlock aria-hidden="true" /></div><div className="compact-list compact-list--stacked">{(resource.data?.items || []).map((period) => <div key={period.closure_id}><span><strong>{period.period_key}</strong><small>{period.status === "closed" ? "Tertutup" : period.status} · {period.reason || "Tanpa catatan"}</small></span>{period.status === "closed" ? <button type="button" className="icon-button" onClick={() => { setReopenTarget(period); setReopenState({ status: "idle", error: null }); }} aria-label={`Buka kembali periode ${period.period_key}`}><FiUnlock aria-hidden="true" /></button> : null}</div>)}</div></Card>
</>;

const PeriodModals = ({ closePreview, closeState, setClosePreview, closePeriod, reopenTarget, reopenState, setReopenTarget, reopenPeriod }) => <>
  <ConfirmationModal open={Boolean(closePreview)} title="Tutup periode setelah validasi?" description={closePreview ? `Periode ${closePreview.periodKey} akan dikunci. Transaksi hanya dapat diubah setelah pemilik membuka kembali periode secara berurutan.` : ""} confirmLabel="Tutup periode" expectedConfirmation={closePreview?.confirmation || ""} acknowledgementLabel="Saya sudah memeriksa jumlah transaksi, pemasukan, pengeluaran, dan memahami periode akan terkunci." countdownSeconds={5} busy={closeState.status === "submitting"} error={closeState.error} onCancel={() => closeState.status !== "submitting" && setClosePreview(null)} onConfirm={closePeriod}>
    {closePreview ? <div className="compact-list compact-list--stacked"><div><span><strong>Transaksi aktif</strong></span><strong>{closePreview.activeTransactionCount}</strong></div><div><span><strong>Transaksi dibatalkan</strong></span><strong>{closePreview.cancelledTransactionCount}</strong></div><div><span><strong>Total pemasukan</strong></span><strong>Rp{closePreview.incomeTotal.toLocaleString("id-ID")}</strong></div><div><span><strong>Total pengeluaran</strong></span><strong>Rp{closePreview.expenseTotal.toLocaleString("id-ID")}</strong></div></div> : null}
  </ConfirmationModal>
  <ConfirmationModal open={Boolean(reopenTarget)} title="Buka kembali periode?" description={reopenTarget ? `Periode ${reopenTarget.period_key} akan menerima perubahan lagi. Snapshot lama tetap berada di audit.` : ""} confirmLabel="Buka periode" reasonLabel="Alasan membuka kembali" requireReason tone="primary" busy={reopenState.status === "submitting"} error={reopenState.error} onCancel={() => reopenState.status !== "submitting" && setReopenTarget(null)} onConfirm={reopenPeriod} />
</>;

const PeriodControlPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { refreshAll, invalidate } = useFinance();
  const resource = useApiResource("periods.list", {}, { enabled: ownerMode });
  const [form, setForm] = useState({ period_key: previousMonthInJakarta(), reason: "Review dan rekonsiliasi selesai" });
  const [result, setResult] = useState(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [closePreview, setClosePreview] = useState(null);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopenState, setReopenState] = useState({ status: "idle", error: null });

  const runIntegrity = async () => {
    if (integrityBusy) return;
    setIntegrityBusy(true);
    setResult({ status: "loading", text: "Menjalankan integrity check..." });
    try {
      const data = await runSettingsAction("integrity.run", {}, {});
      setResult({ status: data.ok ? "success" : "warning", text: data.ok ? "Integrity check lulus." : `Integrity check menemukan ${data.issues?.length || 0} masalah.` });
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setIntegrityBusy(false);
    }
  };

  const previewPeriodClose = async (event) => {
    event.preventDefault();
    setCloseState({ status: "submitting", error: null });
    setResult({ status: "loading", text: "Memvalidasi periode..." });
    try {
      const preview = await runSettingsAction("periods.previewClose", { period_key: form.period_key }, { force: true });
      if (!preview.canClose) {
        setResult({ status: "warning", text: `Periode belum dapat ditutup. Ditemukan ${preview.issues.length} masalah yang harus diselesaikan.` });
        setCloseState({ status: "idle", error: null });
        return;
      }
      setClosePreview(preview);
      setResult(null);
      setCloseState({ status: "idle", error: null });
    } catch (error) {
      setCloseState({ status: "error", error });
      setResult({ status: "danger", text: error.message });
    }
  };

  const closePeriod = async (_reason, confirmationState = {}) => {
    if (!closePreview) return;
    setCloseState({ status: "submitting", error: null });
    try {
      await runSettingsAction("periods.close", { ...form, confirmation: confirmationState.confirmation }, {});
      setResult({ status: "success", text: `Periode ${form.period_key} berhasil ditutup setelah validasi ulang.` });
      setClosePreview(null);
      setCloseState({ status: "idle", error: null });
      invalidate(invalidationActionsFor("period"));
      await Promise.allSettled([refreshAll(), resource.reload()]);
    } catch (error) {
      setCloseState({ status: "error", error });
    }
  };

  const reopenPeriod = async (reason) => {
    if (!reopenTarget) return;
    setReopenState({ status: "submitting", error: null });
    try {
      await requestReopenPeriod({ closure_id: reopenTarget.closure_id, row_version: reopenTarget.row_version, reason }, { rowVersion: reopenTarget.row_version });
      const key = reopenTarget.period_key;
      setReopenTarget(null);
      setReopenState({ status: "idle", error: null });
      setResult({ status: "success", text: `Periode ${key} berhasil dibuka kembali dan tercatat di audit.` });
      invalidate(invalidationActionsFor("period"));
      await Promise.allSettled([refreshAll(), resource.reload()]);
    } catch (error) {
      setReopenState({ status: "error", error });
    }
  };

  return <OwnerSettingsGuard><section className={styles.pageContent} aria-labelledby="period-settings-title">
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <div className={styles.pageHeading}><h2 id="period-settings-title">Periode dan integritas</h2></div>
    <SettingsNotice result={result} />
    <PeriodPanels resource={resource} form={form} setForm={setForm} previewPeriodClose={previewPeriodClose} runIntegrity={runIntegrity} integrityBusy={integrityBusy} closeState={closeState} setReopenTarget={setReopenTarget} setReopenState={setReopenState} />
    <PeriodModals closePreview={closePreview} closeState={closeState} setClosePreview={setClosePreview} closePeriod={closePeriod} reopenTarget={reopenTarget} reopenState={reopenState} setReopenTarget={setReopenTarget} reopenPeriod={reopenPeriod} />
  </section></OwnerSettingsGuard>;
};

export default PeriodControlPage;
