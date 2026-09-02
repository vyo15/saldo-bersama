import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertCircle,
  FiArrowUpRight,
  FiBarChart2,
  FiInfo,
} from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { formatCompactRupiah } from "../../../domain/money.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { useMediaQuery } from "../../../hooks/useMediaQuery.js";
import {
  accountTransactionDirection,
  formatTransactionDate,
  TRANSACTION_LABELS,
  transactionCategoryIcon,
} from "../../../shared/presentation/transaction.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { loadAccountExpenseTrend } from "../accounts.api.js";
import styles from "./MobileAccountActivity.module.css";

const MOBILE_QUERY = "(max-width: 820px)";
const HISTORY_LIMIT = 6;
const TREND_OPTIONS = Object.freeze([1, 3, 6, 12]);

const useMobileAccountActivityEnabled = () => useMediaQuery(MOBILE_QUERY, { fallback: true });

const shortPeriodLabel = (period) => {
  const value = String(period || "");
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("id-ID", {
    ...(day ? { day: "numeric" } : {}),
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || 1))));
};

const longPeriodLabel = (period) => {
  const value = String(period || "");
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("id-ID", {
    ...(day ? { day: "numeric" } : {}),
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || 1))));
};

const buildChartGeometry = (items) => {
  const width = 320;
  const height = 132;
  const left = 8;
  const right = 312;
  const top = 12;
  const bottom = 116;
  const values = items.map((item) => Number(item.value || 0));
  const maximum = Math.max(1, ...values);
  const points = items.map((item, index) => {
    const x = items.length <= 1 ? width / 2 : left + ((right - left) * index) / (items.length - 1);
    const ratio = Number(item.value || 0) / maximum;
    return { x, y: bottom - ratio * (bottom - top) };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length ? `${left},${bottom} ${line} ${right},${bottom}` : "";
  return { width, height, points, line, area, bottom };
};

const useAccountHistory = ({ activeTab, bootstrap, historyPeriod, mobileEnabled, selectedAccountId }) => {
  const historyResource = useApiResource("transactions.list", {
    period: historyPeriod,
    limit: HISTORY_LIMIT,
    offset: 0,
    query: "",
    transaction_type: "all",
    allocation: "all",
    account_id: selectedAccountId || "all",
    category_id: "all",
    created_by: "all",
  }, { enabled: mobileEnabled && activeTab === "history" && Boolean(selectedAccountId) });
  const categoryLookup = useMemo(() => Object.fromEntries(
    (bootstrap?.categories || []).map((category) => [category.category_id, category]),
  ), [bootstrap?.categories]);
  const accountLookup = useMemo(() => Object.fromEntries(
    (bootstrap?.accounts || []).map((account) => [account.account_id, accountDisplayLabel(account)]),
  ), [bootstrap?.accounts]);
  return { accountLookup, categoryLookup, historyResource };
};

const useAccountTrend = ({ activeTab, currentPeriod, mobileEnabled, selectedAccountId, trendMonths, trendReloadKey }) => {
  const [trendState, setTrendState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!mobileEnabled || activeTab !== "chart" || !selectedAccountId) return undefined;
    const controller = new AbortController();
    setTrendState({ status: "loading", data: null, error: null });
    loadAccountExpenseTrend({ accountId: selectedAccountId, endPeriod: currentPeriod, months: trendMonths }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setTrendState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== "AbortError") setTrendState({ status: "error", data: null, error });
      });
    return () => controller.abort();
  }, [activeTab, currentPeriod, mobileEnabled, selectedAccountId, trendMonths, trendReloadKey]);

  return trendState;
};

const MobileActivityTabs = ({ activeTab, chartTabRef, handleTabKeyDown, historyTabRef, setActiveTab }) => (
  <div className={styles.mobileActivityTabs} role="tablist" aria-label="Informasi rekening">
    <button ref={historyTabRef} id="mobile-account-history-tab" type="button" role="tab" aria-controls="mobile-account-history-panel" aria-selected={activeTab === "history"} tabIndex={activeTab === "history" ? 0 : -1} className={activeTab === "history" ? styles.mobileActivityTabActive : ""} onClick={() => setActiveTab("history")} onKeyDown={handleTabKeyDown}>
      <FiActivity className={styles.mobileActivityTabIcon} aria-hidden="true" /><span>Riwayat</span>
    </button>
    <button ref={chartTabRef} id="mobile-account-chart-tab" type="button" role="tab" aria-controls="mobile-account-chart-panel" aria-selected={activeTab === "chart"} tabIndex={activeTab === "chart" ? 0 : -1} className={activeTab === "chart" ? styles.mobileActivityTabActive : ""} onClick={() => setActiveTab("chart")} onKeyDown={handleTabKeyDown}>
      <FiBarChart2 className={styles.mobileActivityTabIcon} aria-hidden="true" /><span>Grafik</span>
    </button>
  </div>
);

const MobileTransactionItem = ({ accountLookup, categoryLookup, item, selectedAccountId }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const direction = accountTransactionDirection(item, selectedAccountId);
  const inactive = Boolean(item.status && item.status !== "active");
  let counterparty = category?.name || TRANSACTION_LABELS[item.transaction_type] || "Transaksi";
  if (item.transaction_type === "transfer") {
    counterparty = item.source_account_id === selectedAccountId
      ? `Ke ${accountLookup[item.destination_account_id] || "rekening tujuan"}`
      : `Dari ${accountLookup[item.source_account_id] || "rekening asal"}`;
  }
  const title = item.description || item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Transaksi";
  return (
    <article className={styles.mobileTransactionItem}>
      <span className={styles.mobileTransactionIcon} data-tone={inactive ? "neutral" : direction.tone}><Icon aria-hidden="true" /></span>
      <span className={styles.mobileTransactionCopy}><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {counterparty}</small></span>
      <span className={styles.mobileTransactionMeta}>
        <strong data-tone={inactive ? "neutral" : direction.tone}>
          {inactive || !direction.prefix ? null : <span aria-hidden="true">{direction.prefix} </span>}
          <Money value={item.amount || 0} tone={inactive ? "default" : direction.tone} />
        </strong>
        {inactive ? <StatusBadge status={item.status} /> : null}
      </span>
    </article>
  );
};

const MobileHistoryBody = ({ accountLookup, categoryLookup, historyItems, historyResource, selectedAccount }) => {
  if (["loading", "refreshing"].includes(historyResource.status) && !historyItems.length) {
    return <div className={styles.mobileActivityState}><FiActivity aria-hidden="true" /><span>Memuat riwayat transaksi...</span></div>;
  }
  if (historyResource.status === "error") {
    return <div className={styles.mobileActivityState} role="alert"><FiAlertCircle aria-hidden="true" /><span>Riwayat belum dapat dimuat.</span><button type="button" onClick={historyResource.reload}>Coba lagi</button></div>;
  }
  if (!historyItems.length) {
    return <div className={styles.mobileActivityState}><FiActivity aria-hidden="true" /><strong>Belum ada transaksi</strong><span>Pilih periode lain atau tambahkan transaksi baru.</span></div>;
  }
  return (
    <div className={styles.mobileTransactionList} aria-label={`Transaksi ${selectedAccount.name}`}>
      {historyItems.map((item) => <MobileTransactionItem key={item.transaction_id} item={item} selectedAccountId={selectedAccount.account_id} accountLookup={accountLookup} categoryLookup={categoryLookup} />)}
    </div>
  );
};

const MobileHistoryPanel = ({ accountLookup, categoryLookup, currentPeriod, historyPeriod, historyResource, onViewTransactions, selectedAccount, setHistoryPeriod }) => {
  const historyItems = historyResource.data?.items || [];
  const historyTotal = Number(historyResource.data?.total || 0);
  return (
    <div id="mobile-account-history-panel" className={styles.mobileActivityPanel} role="tabpanel" aria-labelledby="mobile-account-history-tab">
      <div className={styles.mobileActivityHeading}><div><small>AKTIVITAS {longPeriodLabel(historyPeriod).toUpperCase()}</small><strong>{historyResource.status === "ready" ? `${historyTotal} transaksi` : "Riwayat rekening"}</strong></div><button type="button" onClick={() => onViewTransactions(selectedAccount, historyPeriod)}>Lihat semua</button></div>
      <label className={styles.mobileHistoryPeriod}><span>Periode riwayat</span><span className={styles.mobileHistoryPeriodControl}><input type="month" max={currentPeriod} value={historyPeriod} onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setHistoryPeriod(event.target.value); }} aria-label="Periode riwayat transaksi rekening" /></span></label>
      {historyResource.refreshError ? <div className={styles.mobileActivityNotice} role="status">Data lama tetap ditampilkan. Penyegaran gagal.<button type="button" onClick={historyResource.reload}>Coba lagi</button></div> : null}
      <MobileHistoryBody historyItems={historyItems} historyResource={historyResource} selectedAccount={selectedAccount} accountLookup={accountLookup} categoryLookup={categoryLookup} />
    </div>
  );
};

const MobileChartReady = ({ currentPeriod, onViewTransactions, selectedAccount, trendItems, trendMonths }) => {
  const totalExpense = trendItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const averageExpense = trendItems.length ? Math.round(totalExpense / trendItems.length) : 0;
  const highestExpense = trendItems.reduce((highest, item) => Number(item.value || 0) > Number(highest?.value || 0) ? item : highest, null);
  const chart = buildChartGeometry(trendItems);
  const lastPoint = chart.points.at(-1) || null;
  return (
    <>
      <figure className={styles.mobileExpenseChart} aria-label={`Grafik pengeluaran ${selectedAccount.name} selama ${trendMonths === 1 ? "1 bulan per hari" : `${trendMonths} bulan`}`}>
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} aria-hidden="true"><line x1="8" y1="38" x2="312" y2="38" /><line x1="8" y1="77" x2="312" y2="77" /><line x1="8" y1={chart.bottom} x2="312" y2={chart.bottom} />{chart.area ? <polygon points={chart.area} className={styles.mobileExpenseArea} /> : null}{chart.line ? <polyline points={chart.line} className={styles.mobileExpenseLine} /> : null}{lastPoint ? <circle cx={lastPoint.x} cy={lastPoint.y} r="4.5" className={styles.mobileExpensePoint} /> : null}</svg>
        <div className={styles.mobileChartLabels} style={{ "--chart-label-count": trendItems.length || 1 }} aria-hidden="true">{trendItems.map((item, index) => { const show = trendItems.length < 12 || index % 2 === 0 || index === trendItems.length - 1; return <span key={item.period}>{show ? shortPeriodLabel(item.period) : ""}</span>; })}</div>
        <figcaption className="sr-only">{trendItems.map((item) => `${longPeriodLabel(item.period)} ${formatCompactRupiah(item.value)}`).join(", ")}</figcaption>
      </figure>
      <div className={styles.mobileChartStats}><div><small>{trendMonths === 1 ? "Rata-rata / hari" : "Rata-rata / bulan"}</small><strong>{formatCompactRupiah(averageExpense)}</strong></div><div><small>{trendMonths === 1 ? "Hari tertinggi" : "Bulan tertinggi"}</small><strong>{highestExpense ? `${shortPeriodLabel(highestExpense.period)} · ${formatCompactRupiah(highestExpense.value)}` : "Rp 0"}</strong></div></div>
      <div className={styles.mobileChartNote}><FiInfo aria-hidden="true" /><span>Transfer antar rekening tidak dihitung sebagai pengeluaran. Hanya transaksi expense aktif dari rekening ini yang masuk grafik.</span></div>
      <button type="button" className={styles.mobileChartAction} onClick={() => onViewTransactions(selectedAccount, currentPeriod)}><span>Lihat transaksi bulan berjalan</span><FiArrowUpRight aria-hidden="true" /></button>
    </>
  );
};

const MobileChartBody = ({ currentPeriod, onViewTransactions, selectedAccount, setTrendReloadKey, trendItems, trendMonths, trendState }) => {
  if (trendState.status === "loading") return <div className={styles.mobileChartState}><FiActivity aria-hidden="true" /><span>Menghitung pengeluaran lengkap...</span></div>;
  if (trendState.status === "error") return <div className={styles.mobileChartState} role="alert"><FiAlertCircle aria-hidden="true" /><span>Grafik pengeluaran belum dapat dimuat.</span><button type="button" onClick={() => setTrendReloadKey((value) => value + 1)}>Muat ulang</button></div>;
  if (trendState.status !== "ready") return null;
  return <MobileChartReady currentPeriod={currentPeriod} onViewTransactions={onViewTransactions} selectedAccount={selectedAccount} trendItems={trendItems} trendMonths={trendMonths} />;
};

const MobileChartPanel = ({ currentPeriod, onViewTransactions, selectedAccount, setTrendMonths, setTrendReloadKey, trendMonths, trendState }) => {
  const trendItems = trendState.data?.items || [];
  const totalExpense = trendItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return (
    <div id="mobile-account-chart-panel" className={styles.mobileActivityPanel} role="tabpanel" aria-labelledby="mobile-account-chart-tab">
      <div className={styles.mobileChartHeading}><div><small>PENGELUARAN REKENING</small><strong>{trendState.status === "ready" ? <Money value={totalExpense} /> : "Memuat..."}</strong><span>{trendMonths === 1 ? `Harian · ${longPeriodLabel(currentPeriod)}` : `${trendMonths} bulan hingga ${longPeriodLabel(currentPeriod)}`}</span></div><FiBarChart2 aria-hidden="true" /></div>
      <div className={styles.mobileTrendControls} aria-label="Rentang grafik">{TREND_OPTIONS.map((months) => <button key={months} type="button" className={trendMonths === months ? styles.mobileTrendControlActive : ""} aria-pressed={trendMonths === months} onClick={() => setTrendMonths(months)}>{months} bln</button>)}</div>
      <MobileChartBody currentPeriod={currentPeriod} onViewTransactions={onViewTransactions} selectedAccount={selectedAccount} setTrendReloadKey={setTrendReloadKey} trendItems={trendItems} trendMonths={trendMonths} trendState={trendState} />
    </div>
  );
};

const MobileAccountActivity = ({ selectedAccount, bootstrap, onViewTransactions }) => {
  const mobileEnabled = useMobileAccountActivityEnabled();
  const currentPeriod = currentMonthInJakarta();
  const [activeTab, setActiveTab] = useState("history");
  const [historyPeriod, setHistoryPeriod] = useState(currentPeriod);
  const [trendMonths, setTrendMonths] = useState(6);
  const [trendReloadKey, setTrendReloadKey] = useState(0);
  const historyTabRef = useRef(null);
  const chartTabRef = useRef(null);
  const selectedAccountId = selectedAccount?.account_id || "";
  const history = useAccountHistory({ activeTab, bootstrap, historyPeriod, mobileEnabled, selectedAccountId });
  const trendState = useAccountTrend({ activeTab, currentPeriod, mobileEnabled, selectedAccountId, trendMonths, trendReloadKey });

  const activateTab = (nextTab) => {
    setActiveTab(nextTab);
    const targetRef = nextTab === "history" ? historyTabRef : chartTabRef;
    requestAnimationFrame(() => targetRef.current?.focus());
  };
  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") activateTab("history");
    else if (event.key === "End") activateTab("chart");
    else activateTab(activeTab === "history" ? "chart" : "history");
  };

  if (!selectedAccount) return null;
  return (
    <section className={styles.mobileAccountActivity} aria-label={`Aktivitas rekening ${selectedAccount.name}`}>
      <MobileActivityTabs activeTab={activeTab} chartTabRef={chartTabRef} handleTabKeyDown={handleTabKeyDown} historyTabRef={historyTabRef} setActiveTab={setActiveTab} />
      {activeTab === "history"
        ? <MobileHistoryPanel accountLookup={history.accountLookup} categoryLookup={history.categoryLookup} currentPeriod={currentPeriod} historyPeriod={historyPeriod} historyResource={history.historyResource} onViewTransactions={onViewTransactions} selectedAccount={selectedAccount} setHistoryPeriod={setHistoryPeriod} />
        : <MobileChartPanel currentPeriod={currentPeriod} onViewTransactions={onViewTransactions} selectedAccount={selectedAccount} setTrendMonths={setTrendMonths} setTrendReloadKey={setTrendReloadKey} trendMonths={trendMonths} trendState={trendState} />}
    </section>
  );
};

export default MobileAccountActivity;
