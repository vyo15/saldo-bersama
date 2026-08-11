import { useState } from "react";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import BarChart from "../../components/charts/BarChart.jsx";
import LineChart from "../../components/charts/LineChart.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { currentMonthInJakarta } from "../../domain/dates.js";

const ReportHeader = ({ period, trendMonths, setPeriod, setTrendMonths }) => (
  <PageHeader
    title="Laporan"
    actions={<div className="report-period-controls"><label className="field field--compact"><span>Periode</span><input type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} /></label><label className="field field--compact"><span>Rentang tren</span><select value={trendMonths} onChange={(event) => setTrendMonths(Number(event.target.value))}><option value="3">3 bulan</option><option value="6">6 bulan</option><option value="12">12 bulan</option></select></label></div>}
  />
);

const OverviewMetrics = ({ overview }) => (
  <section className="metric-grid report-metric-grid">
    <Card className="metric-card"><span>Arus kas bersih</span><Money value={overview?.cashFlow?.net || 0} tone={(overview?.cashFlow?.net || 0) >= 0 ? "positive" : "negative"} /></Card>
    <Card className="metric-card"><span>Total saldo</span><Money value={overview?.totalBalance || 0} /></Card>
    <Card className="metric-card"><span>Kewajiban tersisa</span><Money value={overview?.reservedBills || 0} /></Card>
    <Card className="metric-card"><span>Saldo aman akun ini</span><Money value={overview?.safeToSpend || 0} /></Card>
  </section>
);

const ReportAlerts = ({ alerts = [] }) => alerts.length ? <Card className="panel report-alert-panel"><div className="panel__header"><h2>Perlu perhatian</h2></div><ul className="financial-alert-list">{alerts.slice(0, 8).map((alert) => <li key={alert.id} data-severity={alert.severity}><strong>{alert.title}</strong><span>{alert.message}</span></li>)}</ul></Card> : null;

const TrendPanels = ({ trend, balanceComparison, cashFlowTrend, balanceTrend }) => <>
  <Card className="panel"><div className="panel__header"><h2>Saldo awal vs akhir</h2></div><LineChart data={balanceComparison} /></Card>
  <Card className="panel"><div className="panel__header"><h2>Arus kas {trend.months} bulan</h2></div>{cashFlowTrend.length ? <LineChart data={cashFlowTrend} label="Tren arus kas bersih" /> : <EmptyState title="Belum ada tren" />}</Card>
  <Card className="panel"><div className="panel__header"><h2>Tren total saldo</h2></div>{balanceTrend.length ? <LineChart data={balanceTrend} label="Tren total saldo" /> : <EmptyState title="Belum ada tren saldo" />}</Card>
</>;

const BreakdownPanels = ({ categoryExpenses, accountExpenses, natureExpenses, creatorExpenses }) => <>
  <Card className="panel"><div className="panel__header"><h2>Pengeluaran per kategori</h2></div><BarChart data={categoryExpenses} /></Card>
  <Card className="panel"><div className="panel__header"><h2>Pengeluaran per rekening</h2></div>{accountExpenses.length ? <BarChart data={accountExpenses} label="Pengeluaran per rekening" /> : <EmptyState title="Belum ada pengeluaran" />}</Card>
  <Card className="panel"><div className="panel__header"><h2>Jenis pengeluaran</h2></div>{natureExpenses.length ? <BarChart data={natureExpenses} label="Pengeluaran berdasarkan sifat kategori" /> : <EmptyState title="Belum ada klasifikasi" />}</Card>
  <Card className="panel"><div className="panel__header"><div><h2>Aktivitas pencatatan</h2><p className="panel__description">Menunjukkan pencatat, bukan penanggung biaya.</p></div></div>{creatorExpenses.length ? <BarChart data={creatorExpenses} label="Pengeluaran berdasarkan pencatat" /> : <EmptyState title="Belum ada aktivitas" />}</Card>
</>;

const BudgetDesktopTable = ({ budgets }) => <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Anggaran</th><th className="align-right">Rencana</th><th className="align-right">Aktual</th><th className="align-right">Sisa</th></tr></thead><tbody>{budgets.map((item) => <tr key={item.budget_id}><td>{item.name || item.category_id}</td><td className="align-right"><Money value={item.amount} /></td><td className="align-right"><Money value={item.used_amount} /></td><td className="align-right"><Money value={item.amount - item.used_amount} tone={item.amount - item.used_amount < 0 ? "negative" : "default"} /></td></tr>)}</tbody></table></div>;

const BudgetMobileList = ({ budgets }) => <div className="mobile-data-list budget-mobile-list" aria-label="Kinerja anggaran">{budgets.map((item) => {
  const remaining = Number(item.amount || 0) - Number(item.used_amount || 0);
  const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount || 0)) * 100) : 0;
  return <article className="mobile-data-card budget-mobile-card" key={item.budget_id}><div className="budget-mobile-card__header"><div><strong>{item.name || item.category_id}</strong><small>{percentage}% terpakai</small></div></div><ProgressBar value={Number(item.used_amount || 0)} max={Number(item.amount || 0)} label={`Pemakaian anggaran ${item.name || item.category_id}`} /><dl className="budget-mobile-card__metrics"><div><dt>Rencana</dt><dd><Money value={item.amount} /></dd></div><div><dt>Aktual</dt><dd><Money value={item.used_amount} /></dd></div><div><dt>Sisa</dt><dd><Money value={remaining} tone={remaining < 0 ? "negative" : "default"} /></dd></div></dl></article>;
})}</div>;

const BudgetPerformance = ({ budgets }) => <Card className="panel panel--wide budget-performance-panel">
  <div className="panel__header"><h2>Anggaran vs aktual</h2><Link className="button button--secondary" to="/anggaran">Kelola anggaran</Link></div>
  {budgets.length ? <><BudgetDesktopTable budgets={budgets} /><BudgetMobileList budgets={budgets} /></> : <EmptyState title="Belum ada anggaran" />}
</Card>;

const ReportsContent = ({ data, period, trendMonths, setPeriod, setTrendMonths, refreshError, reload }) => {
  const { overview, budgets = [], categoryExpenses = [], accountExpenses = [], creatorExpenses = [], natureExpenses = [], trend = { months: trendMonths, items: [] } } = data || {};
  const cashFlowTrend = trend.items.map((item) => ({ label: item.label, value: item.net }));
  const balanceTrend = trend.items.map((item) => ({ label: item.label, value: item.totalBalance }));
  const balanceComparison = [{ label: "Awal periode", value: overview?.openingBalance || 0 }, { label: overview?.isHistoricalPeriod ? "Akhir periode" : "Saat ini", value: overview?.totalBalance || 0 }];
  return <div className="page-stack reports-page"><RefreshWarning error={refreshError} onRetry={reload} /><ReportHeader period={period} trendMonths={trendMonths} setPeriod={setPeriod} setTrendMonths={setTrendMonths} /><OverviewMetrics overview={overview} /><ReportAlerts alerts={overview?.alerts} /><section className="two-column-grid report-chart-grid"><TrendPanels trend={trend} balanceComparison={balanceComparison} cashFlowTrend={cashFlowTrend} balanceTrend={balanceTrend} /><BreakdownPanels categoryExpenses={categoryExpenses} accountExpenses={accountExpenses} natureExpenses={natureExpenses} creatorExpenses={creatorExpenses} /><BudgetPerformance budgets={budgets} /></section></div>;
};

const ReportsPage = () => {
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [trendMonths, setTrendMonths] = useState(6);
  const resource = useApiResource("reports.monthly", { period, trend_months: trendMonths });
  if (resource.status === "loading") return <LoadingScreen label="Menyusun laporan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <ReportsContent data={resource.data} period={period} trendMonths={trendMonths} setPeriod={setPeriod} setTrendMonths={setTrendMonths} refreshError={resource.refreshError} reload={resource.reload} />;
};

export default ReportsPage;
