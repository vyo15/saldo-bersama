import { useState } from "react";
import { FiArchive, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import BarChart from "../../components/charts/BarChart.jsx";
import LineChart from "../../components/charts/LineChart.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { archiveBudget as requestArchiveBudget, upsertBudget } from "./reports.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { currentMonthInJakarta } from "../../domain/dates.js";

const ReportsPage = () => {
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const resource = useApiResource("reports.monthly", { period });
  const { bootstrap, invalidate } = useFinance();
  const { user } = useAuth();
  const [budgetForm, setBudgetForm] = useState({ category_id: "", amount: "", warning_threshold: 80 });
  const [message, setMessage] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });

  const saveBudget = async (event) => {
    event.preventDefault();
    const existingBudget = (resource.data?.budgets || []).find((item) => item.category_id === budgetForm.category_id && item.scope === "shared") || null;
    try {
      await upsertBudget({
        ...budgetForm,
        period_key: period,
        amount: assertPositiveRupiah(budgetForm.amount),
        row_version: existingBudget?.row_version,
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: existingBudget?.row_version });
      setBudgetForm({ category_id: "", amount: "", warning_threshold: 80 });
      setMessage({ type: "success", text: "Budget periode berhasil disimpan." });
      invalidate(["reports.monthly"]);
      await resource.reload();
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const archiveBudget = async () => {
    if (!archiveTarget) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      await requestArchiveBudget({
        budget_id: archiveTarget.budget_id,
        row_version: archiveTarget.row_version,
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: archiveTarget.row_version });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Budget berhasil diarsipkan. Transaksi dan laporan historis tidak dihapus." });
      invalidate(["reports.monthly", "budgets.list", "app.initialState"]);
      await resource.reload();
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };

  if (resource.status === "loading") return <LoadingScreen label="Menyusun laporan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const { overview, budgets = [], categoryExpenses = [] } = resource.data || {};
  const balanceComparison = [
    { label: "Awal periode", value: overview?.openingBalance || 0 },
    { label: overview?.isHistoricalPeriod ? "Akhir periode" : "Saat ini", value: overview?.totalBalance || 0 },
  ];
  const canManageBudgets = user?.role === "owner" && !overview?.isHistoricalPeriod;

  return (
    <div className="page-stack reports-page">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Laporan" description="Data aktual dan prediksi selalu dibedakan. Transfer internal tidak masuk arus kas." actions={<label className="field field--compact"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} /></label>} />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="metric-grid report-metric-grid">
        <Card className="metric-card"><span>Arus kas bersih</span><Money value={overview?.cashFlow?.net || 0} tone={(overview?.cashFlow?.net || 0) >= 0 ? "positive" : "negative"} /></Card>
        <Card className="metric-card"><span>Total saldo</span><Money value={overview?.totalBalance || 0} /></Card>
        <Card className="metric-card"><span>Kewajiban tersisa</span><Money value={overview?.reservedBills || 0} /></Card>
        <Card className="metric-card"><span>Saldo aman</span><Money value={overview?.safeToSpend || 0} /></Card>
      </section>
      <section className="two-column-grid report-chart-grid">
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Perbandingan saldo</p><h2>Saldo awal dan akhir periode</h2></div></div><LineChart data={balanceComparison} /></Card>
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Ke mana uang pergi</p><h2>Pengeluaran per kategori</h2></div></div><BarChart data={categoryExpenses} /></Card>
        <Card className="panel panel--wide budget-performance-panel">
          <div className="panel__header"><div><p className="eyebrow">Budget vs aktual</p><h2>Kinerja budget periode ini</h2></div></div>
          {budgets.length ? (
            <>
              <div className="data-table-wrap desktop-data-table">
                <table className="data-table"><thead><tr><th>Budget</th><th className="align-right">Rencana</th><th className="align-right">Aktual</th><th className="align-right">Sisa</th>{canManageBudgets ? <th aria-label="Aksi" /> : null}</tr></thead><tbody>{budgets.map((item) => <tr key={item.budget_id}><td>{item.name || item.category_id}</td><td className="align-right"><Money value={item.amount} /></td><td className="align-right"><Money value={item.used_amount} /></td><td className="align-right"><Money value={item.amount - item.used_amount} tone={item.amount - item.used_amount < 0 ? "negative" : "default"} /></td>{canManageBudgets ? <td className="align-right"><button type="button" className="icon-button icon-button--danger" onClick={() => { setArchiveTarget(item); setArchiveState({ status: "idle", error: null }); }} aria-label={`Arsipkan budget ${item.name || item.category_id}`}><FiArchive aria-hidden="true" /></button></td> : null}</tr>)}</tbody></table>
              </div>
              <div className="mobile-data-list budget-mobile-list" aria-label="Kinerja budget">
                {budgets.map((item) => {
                  const remaining = Number(item.amount || 0) - Number(item.used_amount || 0);
                  const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount || 0)) * 100) : 0;
                  return (
                    <article className="mobile-data-card budget-mobile-card" key={item.budget_id}>
                      <div className="budget-mobile-card__header">
                        <div><strong>{item.name || item.category_id}</strong><small>{percentage}% terpakai</small></div>
                        {canManageBudgets ? <button type="button" className="icon-button icon-button--danger" onClick={() => { setArchiveTarget(item); setArchiveState({ status: "idle", error: null }); }} aria-label={`Arsipkan budget ${item.name || item.category_id}`}><FiArchive aria-hidden="true" /></button> : null}
                      </div>
                      <ProgressBar value={Number(item.used_amount || 0)} max={Number(item.amount || 0)} label={`Pemakaian budget ${item.name || item.category_id}`} />
                      <dl className="budget-mobile-card__metrics">
                        <div><dt>Rencana</dt><dd><Money value={item.amount} /></dd></div>
                        <div><dt>Aktual</dt><dd><Money value={item.used_amount} /></dd></div>
                        <div><dt>Sisa</dt><dd><Money value={remaining} tone={remaining < 0 ? "negative" : "default"} /></dd></div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </>
          ) : <EmptyState title="Belum ada budget" description="Tetapkan batas kategori agar rencana dan pengeluaran aktual dapat dibandingkan." />}
        </Card>
      </section>
      {canManageBudgets ? (
        <Card className="panel budget-form-panel">
          <div className="panel__header"><div><p className="eyebrow">Budget periode</p><h2>Tetapkan batas kategori</h2></div></div>
          <form className="form-grid" onSubmit={saveBudget}>
            <label className="field"><span>Kategori pengeluaran</span><select required value={budgetForm.category_id} onChange={(event) => setBudgetForm((current) => ({ ...current, category_id: event.target.value }))}><option value="">Pilih kategori</option>{(bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense").map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
            <MoneyInput id="budget-amount" label="Nominal budget" value={budgetForm.amount} onChange={(value) => setBudgetForm((current) => ({ ...current, amount: value }))} />
            <label className="field"><span>Ambang peringatan (%)</span><input type="number" min="50" max="100" value={budgetForm.warning_threshold} onChange={(event) => setBudgetForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>
            <div className="form-actions"><Button variant="primary" icon={FiPlus} type="submit">Simpan budget</Button></div>
          </form>
        </Card>
      ) : null}

      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title="Arsipkan budget?"
        description={archiveTarget ? `${archiveTarget.name || archiveTarget.category_id} tidak lagi menjadi batas aktif periode ini.` : ""}
        confirmLabel="Arsipkan budget"
        busy={archiveState.status === "submitting"}
        error={archiveState.error}
        onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveBudget}
      />
    </div>
  );
};

export default ReportsPage;
