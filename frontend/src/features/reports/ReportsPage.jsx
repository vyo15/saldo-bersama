import { useState } from "react";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import BarChart from "../../components/charts/BarChart.jsx";
import LineChart from "../../components/charts/LineChart.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiClient } from "../../services/api/client.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createIdempotencyKey } from "../../domain/security.js";

const ReportsPage = () => {
  const period = new Date().toISOString().slice(0, 7);
  const resource = useApiResource("reports.monthly", { period });
  const { bootstrap, refresh } = useFinance();
  const { user } = useAuth();
  const [budgetForm, setBudgetForm] = useState({ category_id: "", amount: "", warning_threshold: 80 });
  const [message, setMessage] = useState(null);

  const saveBudget = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("budgets.upsert", { ...budgetForm, period_key: period, amount: assertPositiveRupiah(budgetForm.amount) }, { idempotencyKey: createIdempotencyKey() });
      setBudgetForm({ category_id: "", amount: "", warning_threshold: 80 });
      setMessage({ type: "success", text: "Budget periode berhasil disimpan." });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Menyusun laporan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const { overview, budgets = [], categoryExpenses = [] } = resource.data || {};
  const trend = [
    { label: "Awal", value: overview?.totalBalance - (overview?.cashFlow?.net || 0) },
    { label: "Saat ini", value: overview?.totalBalance || 0 },
  ];
  return (
    <div className="page-stack">
      <PageHeader title="Laporan" description="Data aktual dan prediksi selalu dibedakan. Transfer internal tidak masuk arus kas." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="metric-grid">
        <Card className="metric-card"><span>Arus kas bersih</span><Money value={overview?.cashFlow?.net || 0} tone={(overview?.cashFlow?.net || 0) >= 0 ? "positive" : "negative"} /></Card>
        <Card className="metric-card"><span>Total saldo</span><Money value={overview?.totalBalance || 0} /></Card>
        <Card className="metric-card"><span>Kewajiban tersisa</span><Money value={overview?.reservedBills || 0} /></Card>
        <Card className="metric-card"><span>Saldo aman</span><Money value={overview?.safeToSpend || 0} /></Card>
      </section>
      <section className="two-column-grid">
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Pertumbuhan keuangan</p><h2>Perubahan total saldo</h2></div></div><LineChart data={trend} /></Card>
        <Card className="panel"><div className="panel__header"><div><p className="eyebrow">Ke mana uang pergi</p><h2>Pengeluaran per kategori</h2></div></div><BarChart data={categoryExpenses} /></Card>
        <Card className="panel panel--wide"><div className="panel__header"><div><p className="eyebrow">Budget vs aktual</p><h2>Kinerja budget periode ini</h2></div></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Budget</th><th className="align-right">Rencana</th><th className="align-right">Aktual</th><th className="align-right">Sisa</th></tr></thead><tbody>{budgets.map((item) => <tr key={item.budget_id}><td>{item.name || item.category_id}</td><td className="align-right"><Money value={item.amount} /></td><td className="align-right"><Money value={item.used_amount} /></td><td className="align-right"><Money value={item.amount - item.used_amount} /></td></tr>)}</tbody></table></div></Card>
      </section>
      {user?.role === "owner" ? (
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Budget periode</p><h2>Tetapkan batas kategori</h2></div></div>
          <form className="form-grid" onSubmit={saveBudget}>
            <label className="field"><span>Kategori pengeluaran</span><select required value={budgetForm.category_id} onChange={(event) => setBudgetForm((current) => ({ ...current, category_id: event.target.value }))}><option value="">Pilih kategori</option>{(bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense").map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
            <MoneyInput id="budget-amount" label="Nominal budget" value={budgetForm.amount} onChange={(value) => setBudgetForm((current) => ({ ...current, amount: value }))} />
            <label className="field"><span>Ambang peringatan (%)</span><input type="number" min="50" max="100" value={budgetForm.warning_threshold} onChange={(event) => setBudgetForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>
            <div className="form-actions"><Button variant="primary" icon={FiPlus} type="submit">Simpan budget</Button></div>
          </form>
        </Card>
      ) : null}
    </div>
  );
};

export default ReportsPage;
