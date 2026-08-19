import { useMemo, useState } from "react";
import {
  FiArrowDownRight,
  FiArrowUpRight,
  FiCalendar,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiDollarSign,
  FiLayers,
  FiShield,
  FiTrendingUp,
} from "react-icons/fi";
import { Link } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import PageInfoButton from "../../components/common/PageInfoButton.jsx";
import BarChart from "../../components/charts/BarChart.jsx";
import LineChart from "../../components/charts/LineChart.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { formatCompactRupiah, formatRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { categoryIcon } from "../../shared/presentation/transaction.js";
import FinancialAlertList from "../dashboard/components/FinancialAlertList.jsx";
import styles from "./ReportsPage.module.css";

const MOBILE_REPORT_QUERY = "(max-width: 820px)";
const TREND_OPTIONS = [3, 6, 12];

const ReportHeader = ({ period, trendMonths, setPeriod, setTrendMonths }) => (
  <PageHeader
    title="Laporan"
    help="Laporan merangkum transaksi sesuai periode. Transfer antar rekening tidak dihitung sebagai pemasukan atau pengeluaran total."
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

const ReportAlerts = ({ alerts = [] }) => alerts.length ? <Card className="panel report-alert-panel"><div className="panel__header"><div><h2>Perlu perhatian</h2><p className="panel__description">{alerts.length} item aktif. Buka tindakan terkait untuk menyelesaikannya tanpa mengubah data langsung dari laporan.</p></div></div><FinancialAlertList alerts={alerts} variant="report" /></Card> : null;

const PrimaryTrendPanels = ({ trend, balanceComparison, cashFlowTrend }) => <>
  <Card className="panel"><div className="panel__header"><h2>Saldo awal vs akhir</h2></div><LineChart data={balanceComparison} /></Card>
  <Card className="panel"><div className="panel__header"><h2>Arus kas {trend.months} bulan</h2></div>{cashFlowTrend.length ? <LineChart data={cashFlowTrend} label="Tren arus kas bersih" /> : <EmptyState title="Belum ada tren" />}</Card>
</>;

const useMobileReportLayout = () => useMediaQuery(MOBILE_REPORT_QUERY);

const ReportDetails = ({ balanceTrend, categoryExpenses, accountExpenses, natureExpenses, creatorExpenses, costShareExpenses, budgets }) => {
  const compact = useMobileReportLayout();
  const content = <div className="report-details__content"><Card className="panel"><div className="panel__header"><h2>Tren total saldo</h2></div>{balanceTrend.length ? <LineChart data={balanceTrend} label="Tren total saldo" /> : <EmptyState title="Belum ada tren saldo" />}</Card><BreakdownPanels categoryExpenses={categoryExpenses} accountExpenses={accountExpenses} natureExpenses={natureExpenses} creatorExpenses={creatorExpenses} costShareExpenses={costShareExpenses} /><BudgetPerformance budgets={budgets} /></div>;
  if (!compact) return <div className="report-details report-details--desktop">{content}</div>;
  return <details className="report-details"><summary className="report-details__summary"><span><strong>Rincian laporan</strong><small>Tren saldo, kategori, rekening, jenis, pencatat, dan anggaran</small></span><FiChevronDown aria-hidden="true" /></summary>{content}</details>;
};

const BreakdownPanels = ({ categoryExpenses, accountExpenses, natureExpenses, creatorExpenses, costShareExpenses }) => <>
  <Card className="panel"><div className="panel__header"><h2>Pengeluaran per kategori</h2></div><BarChart data={categoryExpenses} /></Card>
  <Card className="panel"><div className="panel__header"><h2>Pengeluaran per rekening</h2></div>{accountExpenses.length ? <BarChart data={accountExpenses} label="Pengeluaran per rekening" /> : <EmptyState title="Belum ada pengeluaran" />}</Card>
  <Card className="panel"><div className="panel__header"><h2>Jenis pengeluaran</h2></div>{natureExpenses.length ? <BarChart data={natureExpenses} label="Pengeluaran berdasarkan sifat kategori" /> : <EmptyState title="Belum ada klasifikasi" />}</Card>
  <Card className="panel"><div className="panel__header"><div><h2>Aktivitas pencatatan</h2><p className="panel__description">Menunjukkan pencatat, bukan penanggung biaya.</p></div></div>{creatorExpenses.length ? <BarChart data={creatorExpenses} label="Pengeluaran berdasarkan pencatat" /> : <EmptyState title="Belum ada aktivitas" />}</Card>
  <Card className="panel"><div className="panel__header"><div><h2>Pembagian beban biaya</h2><p className="panel__description">Hanya transaksi Bersama yang pembagiannya ditentukan. Ini bukan laporan siapa yang benar-benar membayar.</p></div></div>{costShareExpenses.length ? <BarChart data={costShareExpenses} label="Pembagian beban biaya bersama" /> : <EmptyState title="Belum ada pembagian beban" />}</Card>
</>;

const BudgetDesktopTable = ({ budgets }) => <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Kebutuhan</th><th className="align-right">Rencana</th><th className="align-right">Aktual</th><th className="align-right">Sisa</th></tr></thead><tbody>{budgets.map((item) => <tr key={item.budget_id}><td>{item.name || item.category_id}</td><td className="align-right"><Money value={item.amount} /></td><td className="align-right"><Money value={item.used_amount} /></td><td className="align-right"><Money value={item.amount - item.used_amount} tone={item.amount - item.used_amount < 0 ? "negative" : "default"} /></td></tr>)}</tbody></table></div>;

const BudgetMobileList = ({ budgets }) => <div className="mobile-data-list budget-mobile-list" aria-label="Kinerja anggaran">{budgets.map((item) => {
  const remaining = Number(item.amount || 0) - Number(item.used_amount || 0);
  const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount || 0)) * 100) : 0;
  return <article className="mobile-data-card budget-mobile-card" key={item.budget_id}><div className="budget-mobile-card__header"><div><strong>{item.name || item.category_id}</strong><small>{percentage}% terpakai</small></div></div><ProgressBar value={Number(item.used_amount || 0)} max={Number(item.amount || 0)} label={`Pemakaian anggaran ${item.name || item.category_id}`} /><dl className="budget-mobile-card__metrics"><div><dt>Rencana</dt><dd><Money value={item.amount} /></dd></div><div><dt>Aktual</dt><dd><Money value={item.used_amount} /></dd></div><div><dt>Sisa</dt><dd><Money value={remaining} tone={remaining < 0 ? "negative" : "default"} /></dd></div></dl></article>;
})}</div>;

const BudgetPerformance = ({ budgets }) => <Card className="panel panel--wide budget-performance-panel">
  <div className="panel__header"><h2>Kebutuhan vs aktual</h2><Link className="button button--secondary" to="/anggaran">Lihat anggaran</Link></div>
  {budgets.length ? <><BudgetDesktopTable budgets={budgets} /><BudgetMobileList budgets={budgets} /></> : <EmptyState title="Belum ada kebutuhan" />}
</Card>;

const shiftMonth = (period, delta) => {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const longMonthLabel = (period) => {
  const [year, month] = String(period).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
};

const percentChange = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return null;
  return Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 100);
};

const signedPercent = (value) => value === null ? "Belum ada pembanding" : `${value > 0 ? "+" : ""}${value}%`;

const MobileTrendChart = ({ items = [], period }) => {
  const maxExpense = Math.max(1, ...items.map((item) => Number(item.expense || 0)));
  return <div className={styles.trendChart} role="img" aria-label={`Tren pengeluaran ${items.map((item) => `${item.label} ${formatRupiah(item.expense)}`).join(", ")}`}>
    {items.map((item) => {
      const value = Number(item.expense || 0);
      const height = Math.max(7, Math.round((value / maxExpense) * 100));
      const active = item.periodKey === period;
      return <div className={styles.trendColumn} key={item.periodKey} aria-hidden="true">
        <div className={styles.trendPlot}><span className={styles.trendValue}>{formatCompactRupiah(value)}</span><i className={`${styles.trendBar}${active ? ` ${styles.trendBarActive}` : ""}`} style={{ "--report-bar-height": `${height}%` }} /></div>
        <span className={`${styles.trendLabel}${active ? ` ${styles.trendLabelActive}` : ""}`}>{item.label}</span>
      </div>;
    })}
  </div>;
};

const MobileMetricCard = ({ icon: Icon, label, value, tone = "default" }) => <article className={styles.metricCard}>
  <span className={styles.metricIcon}><Icon aria-hidden="true" /></span>
  <Money value={value} tone={tone} />
  <span>{label}</span>
</article>;

const MobileCategoryList = ({ items = [], categoryLookup, limit }) => {
  const visibleItems = typeof limit === "number" ? items.slice(0, limit) : items;
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  if (!visibleItems.length) return <EmptyState variant="inline" title="Belum ada pengeluaran" description="Kategori pengeluaran akan muncul setelah transaksi tercatat." />;
  return <div className={styles.categoryList}>{visibleItems.map((item) => {
    const category = categoryLookup[item.category_id];
    const Icon = categoryIcon(category?.icon, "expense");
    const amount = Number(item.amount || 0);
    const percentage = total > 0 ? Math.round((amount / total) * 100) : 0;
    return <article className={styles.categoryRow} key={item.category_id || item.name}>
      <span className={styles.categoryIcon}><Icon aria-hidden="true" /></span>
      <div className={styles.categoryMain}>
        <div className={styles.categoryMeta}><strong>{item.name || "Tanpa kategori"}</strong><Money value={amount} /></div>
        <div className={styles.categoryTrack} aria-hidden="true"><i style={{ width: `${Math.max(2, percentage)}%` }} /></div>
      </div>
      <span className={styles.categoryPercent}>{percentage}%</span>
    </article>;
  })}</div>;
};

const MobileBudgetList = ({ budgets = [] }) => {
  if (!budgets.length) return <EmptyState variant="inline" title="Belum ada kebutuhan" description="Batas aktif akan dibandingkan dengan realisasi pengeluaran di sini." />;
  return <div className={styles.budgetList}>{budgets.map((item) => {
    const planned = Number(item.amount || 0);
    const used = Number(item.used_amount || 0);
    const percentage = planned > 0 ? Math.round((used / planned) * 100) : 0;
    return <article className={styles.budgetRow} key={item.budget_id}>
      <div className={styles.budgetMeta}><strong>{item.name || item.category_id}</strong><span>{percentage}% terpakai</span></div>
      <ProgressBar value={used} max={planned} label={`Pemakaian anggaran ${item.name || item.category_id}`} />
      <div className={styles.budgetAmounts}><span>Aktual <Money value={used} /></span><span>Sisa <Money value={planned - used} tone={planned - used < 0 ? "negative" : "default"} /></span></div>
    </article>;
  })}</div>;
};

const MobileBreakdownDetails = ({ accountExpenses, natureExpenses, creatorExpenses, costShareExpenses }) => <details className={styles.detailsCard}>
  <summary><span><strong>Rincian lainnya</strong><small>Rekening, jenis pengeluaran, dan aktivitas pencatatan</small></span><FiChevronDown aria-hidden="true" /></summary>
  <div className={styles.detailsContent}>
    <section><h3>Pengeluaran per rekening</h3>{accountExpenses.length ? <BarChart data={accountExpenses} label="Pengeluaran per rekening" /> : <EmptyState variant="inline" title="Belum ada pengeluaran" />}</section>
    <section><h3>Jenis pengeluaran</h3>{natureExpenses.length ? <BarChart data={natureExpenses} label="Pengeluaran berdasarkan sifat kategori" /> : <EmptyState variant="inline" title="Belum ada klasifikasi" />}</section>
    <section><h3>Aktivitas pencatatan</h3><p>Menunjukkan pencatat, bukan penanggung biaya.</p>{creatorExpenses.length ? <BarChart data={creatorExpenses} label="Pengeluaran berdasarkan pencatat" /> : <EmptyState variant="inline" title="Belum ada aktivitas" />}</section>
    <section><h3>Pembagian beban biaya</h3><p>Hanya transaksi Bersama yang pembagiannya ditentukan. Bukan bukti siapa yang membayar.</p>{costShareExpenses.length ? <BarChart data={costShareExpenses} label="Pembagian beban biaya bersama" /> : <EmptyState variant="inline" title="Belum ada pembagian beban" />}</section>
  </div>
</details>;

const MobileComparison = ({ current, previous }) => {
  if (!previous) return <section className={styles.comparisonCard}><div className={styles.sectionHeading}><div><span>Perbandingan</span><h2>Belum ada bulan pembanding</h2></div></div><p className={styles.emptyCopy}>Pilih periode yang memiliki data bulan sebelumnya untuk melihat perubahan.</p></section>;
  const expenseChange = percentChange(current?.expense, previous.expense);
  const balanceChange = percentChange(current?.totalBalance, previous.totalBalance);
  const netChange = percentChange(current?.net, previous.net);
  const rows = [
    { label: "Pengeluaran", current: current?.expense, previous: previous.expense, change: expenseChange, goodWhenDown: true },
    { label: "Total saldo", current: current?.totalBalance, previous: previous.totalBalance, change: balanceChange },
    { label: "Arus kas bersih", current: current?.net, previous: previous.net, change: netChange },
  ];
  return <section className={styles.comparisonCard}>
    <div className={styles.sectionHeading}><div><span>Bandingkan</span><h2>{current?.label || "Periode ini"} vs {previous.label}</h2></div></div>
    <div className={styles.comparisonRows}>{rows.map((row) => {
      const improving = row.change !== null && (row.goodWhenDown ? row.change <= 0 : row.change >= 0);
      const TrendIcon = row.change !== null && row.change < 0 ? FiArrowDownRight : FiArrowUpRight;
      return <article className={styles.comparisonRow} key={row.label}>
        <div><span>{row.label}</span><strong>{formatCompactRupiah(row.current)}</strong></div>
        <div className={`${styles.comparisonDelta}${row.change === null ? "" : improving ? ` ${styles.comparisonDeltaPositive}` : ` ${styles.comparisonDeltaWarning}`}`}><TrendIcon aria-hidden="true" /><span>{signedPercent(row.change)}</span></div>
        <small>Sebelumnya {formatCompactRupiah(row.previous)}</small>
      </article>;
    })}</div>
  </section>;
};

const mobileReportModel = (data, period, trendMonths) => {
  const { overview, budgets = [], categoryExpenses = [], accountExpenses = [], creatorExpenses = [], natureExpenses = [], costShareExpenses = [], trend = { months: trendMonths, items: [] } } = data || {};
  const trendItems = trend.items || [];
  const matchedIndex = trendItems.findIndex((item) => item.periodKey === period);
  const currentIndex = matchedIndex >= 0 ? matchedIndex : trendItems.length - 1;
  const currentTrend = currentIndex >= 0 ? trendItems[currentIndex] : null;
  const previousTrend = currentIndex > 0 ? trendItems[currentIndex - 1] : null;
  return {
    overview,
    budgets,
    categoryExpenses,
    accountExpenses,
    creatorExpenses,
    natureExpenses,
    costShareExpenses,
    trendItems,
    currentTrend,
    previousTrend,
    expenseChange: previousTrend ? percentChange(currentTrend?.expense, previousTrend.expense) : null,
    totalExpense: Number(overview?.cashFlow?.expense || 0),
  };
};

const MobileReportControls = ({ mode, setMode, period, setPeriod, trendMonths, setTrendMonths, historical }) => {
  const canMoveForward = period < currentMonthInJakarta();
  return <>
    <header className={styles.mobileHeader}>
      <div className={styles.mobileTitle}><p>Analitik keuangan</p><div className={styles.mobileTitleRow}><h1>Laporan</h1><PageInfoButton title="Tentang Laporan">Laporan merangkum transaksi sesuai periode. Transfer antar rekening tidak dihitung sebagai pemasukan atau pengeluaran total.</PageInfoButton></div></div>
      <label className={styles.calendarControl} aria-label="Pilih periode laporan"><FiCalendar aria-hidden="true" /><input type="month" max={currentMonthInJakarta()} value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
    </header>
    <div className={styles.segmentedControl} role="group" aria-label="Tampilan laporan">
      <button type="button" className={mode === "summary" ? styles.segmentActive : ""} onClick={() => setMode("summary")} aria-pressed={mode === "summary"}>Ringkasan</button>
      <button type="button" className={mode === "category" ? styles.segmentActive : ""} onClick={() => setMode("category")} aria-pressed={mode === "category"}>Per kategori</button>
    </div>
    <section className={styles.periodCard} aria-label="Periode laporan">
      <button className={styles.periodArrow} type="button" onClick={() => setPeriod(shiftMonth(period, -1))} aria-label="Bulan sebelumnya"><FiChevronLeft aria-hidden="true" /></button>
      <div><strong>{longMonthLabel(period)}</strong><span>{historical ? "Periode historis" : "Periode berjalan"}</span></div>
      <button className={styles.periodArrow} type="button" onClick={() => setPeriod(shiftMonth(period, 1))} disabled={!canMoveForward} aria-label="Bulan berikutnya"><FiChevronRight aria-hidden="true" /></button>
    </section>
    <div className={styles.rangeChips} role="group" aria-label="Rentang tren">
      {TREND_OPTIONS.map((months) => <button type="button" key={months} className={trendMonths === months ? styles.rangeActive : ""} onClick={() => setTrendMonths(months)} aria-pressed={trendMonths === months}>{months} bulan</button>)}
    </div>
  </>;
};

const MobileSummaryHero = ({ model, period }) => {
  const { trendItems, previousTrend, expenseChange, totalExpense } = model;
  const comparisonLabel = expenseChange === null
    ? "Belum ada pembanding"
    : `${expenseChange <= 0 ? "↓" : "↑"} ${Math.abs(expenseChange)}% vs ${previousTrend?.label || "bulan lalu"}`;
  const improvementClass = expenseChange !== null && expenseChange <= 0 ? ` ${styles.heroChangePositive}` : "";
  return <section className={styles.heroCard}>
    <div className={styles.heroTop}>
      <div><span>Pengeluaran periode ini</span><Money value={totalExpense} /></div>
      <span className={`${styles.heroChange}${improvementClass}`}>{comparisonLabel}</span>
    </div>
    {trendItems.length ? <MobileTrendChart items={trendItems} period={period} /> : <EmptyState variant="inline" title="Belum ada tren" />}
  </section>;
};

const MobileSummaryAlerts = ({ alerts = [] }) => {
  if (!alerts.length) return null;
  return <section className={styles.alertCard}><div className={styles.sectionHeading}><div><span>Kontrol</span><h2>Perlu perhatian</h2></div><strong>{alerts.length}</strong></div><FinancialAlertList alerts={alerts} variant="report" /></section>;
};

const MobileSummaryView = ({ model, period, categoryLookup, setMode }) => {
  const { overview, categoryExpenses, currentTrend, previousTrend } = model;
  const net = Number(overview?.cashFlow?.net || 0);
  return <>
    <MobileSummaryHero model={model} period={period} />
    <section className={styles.metricsGrid} aria-label="Ringkasan keuangan">
      <MobileMetricCard icon={FiTrendingUp} label="Arus kas bersih" value={net} tone={net >= 0 ? "positive" : "negative"} />
      <MobileMetricCard icon={FiDollarSign} label="Total saldo" value={overview?.totalBalance || 0} />
      <MobileMetricCard icon={FiShield} label="Aman digunakan" value={overview?.safeToSpend || 0} />
    </section>
    <MobileComparison current={currentTrend} previous={previousTrend} />
    <section className={styles.contentCard}>
      <div className={styles.sectionHeading}><div><span>Distribusi</span><h2>Pengeluaran terbesar</h2></div>{categoryExpenses.length > 4 ? <button type="button" onClick={() => setMode("category")}>Lihat semua</button> : null}</div>
      <MobileCategoryList items={categoryExpenses} categoryLookup={categoryLookup} limit={4} />
    </section>
    <MobileSummaryAlerts alerts={overview?.alerts} />
  </>;
};

const MobileCategoryView = ({ model, categoryLookup }) => <>
  <section className={styles.contentCard}>
    <div className={styles.sectionHeading}><div><span>Total {formatCompactRupiah(model.totalExpense)}</span><h2>Pengeluaran per kategori</h2></div><FiLayers aria-hidden="true" /></div>
    <MobileCategoryList items={model.categoryExpenses} categoryLookup={categoryLookup} />
  </section>
  <section className={styles.contentCard}>
    <div className={styles.sectionHeading}><div><span>Rencana bulan ini</span><h2>Kebutuhan vs aktual</h2></div><Link to="/anggaran">Lihat anggaran</Link></div>
    <MobileBudgetList budgets={model.budgets} />
  </section>
  <MobileBreakdownDetails accountExpenses={model.accountExpenses} natureExpenses={model.natureExpenses} creatorExpenses={model.creatorExpenses} costShareExpenses={model.costShareExpenses} />
</>;

const MobileReportsView = ({ data, period, trendMonths, setPeriod, setTrendMonths, refreshError, reload, categoryLookup }) => {
  const [mode, setMode] = useState("summary");
  const model = mobileReportModel(data, period, trendMonths);
  return <div className={styles.mobilePage}>
    <RefreshWarning error={refreshError} onRetry={reload} />
    <MobileReportControls mode={mode} setMode={setMode} period={period} setPeriod={setPeriod} trendMonths={trendMonths} setTrendMonths={setTrendMonths} historical={model.overview?.isHistoricalPeriod} />
    {mode === "summary"
      ? <MobileSummaryView model={model} period={period} categoryLookup={categoryLookup} setMode={setMode} />
      : <MobileCategoryView model={model} categoryLookup={categoryLookup} />}
    <p className={styles.dataNote}><FiCreditCard aria-hidden="true" /> Laporan hanya membaca ledger yang dapat Anda lihat. Tidak ada data yang diubah dari halaman ini.</p>
  </div>;
};

const DesktopReportsContent = ({ data, period, trendMonths, setPeriod, setTrendMonths, refreshError, reload }) => {
  const { overview, budgets = [], categoryExpenses = [], accountExpenses = [], creatorExpenses = [], natureExpenses = [], costShareExpenses = [], trend = { months: trendMonths, items: [] } } = data || {};
  const cashFlowTrend = trend.items.map((item) => ({ label: item.label, value: item.net }));
  const balanceTrend = trend.items.map((item) => ({ label: item.label, value: item.totalBalance }));
  const balanceComparison = [{ label: "Awal periode", value: overview?.openingBalance || 0 }, { label: overview?.isHistoricalPeriod ? "Akhir periode" : "Saat ini", value: overview?.totalBalance || 0 }];
  return <div className="page-stack reports-page"><RefreshWarning error={refreshError} onRetry={reload} /><ReportHeader period={period} trendMonths={trendMonths} setPeriod={setPeriod} setTrendMonths={setTrendMonths} /><OverviewMetrics overview={overview} /><ReportAlerts alerts={overview?.alerts} /><section className="two-column-grid report-chart-grid"><PrimaryTrendPanels trend={trend} balanceComparison={balanceComparison} cashFlowTrend={cashFlowTrend} /><ReportDetails balanceTrend={balanceTrend} categoryExpenses={categoryExpenses} accountExpenses={accountExpenses} natureExpenses={natureExpenses} creatorExpenses={creatorExpenses} costShareExpenses={costShareExpenses} budgets={budgets} /></section></div>;
};

const ReportsContent = (props) => {
  const mobile = useMobileReportLayout();
  const { bootstrap } = useFinance();
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  return mobile ? <MobileReportsView {...props} categoryLookup={categoryLookup} /> : <DesktopReportsContent {...props} />;
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
