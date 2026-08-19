import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FiSliders } from "react-icons/fi";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageInfoButton from "../../components/common/PageInfoButton.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { budgetPeriodMeta, budgetTotals, budgetVisualState } from "./budgetPresentation.js";
import BudgetHeroCard from "./components/BudgetHeroCard.jsx";
import BudgetInsightCard from "./components/BudgetInsightCard.jsx";
import budgetCalendarArtwork from "../../assets/budget-illustrations/budget-calendar.webp";
import styles from "./BudgetsPage.module.css";

const EMPTY_BUDGET_ITEMS = Object.freeze([]);

const BudgetTabs = ({ activeFilter, setActiveFilter, totalCount, attentionCount }) => <div className={styles.segmented} role="group" aria-label="Filter kebutuhan anggaran">
  <button type="button" className={`${styles.segment}${activeFilter === "all" ? ` ${styles.segmentActive}` : ""}`} aria-pressed={activeFilter === "all"} onClick={() => setActiveFilter("all")}>Semua <span>{totalCount}</span></button>
  <button type="button" className={`${styles.segment}${activeFilter === "attention" ? ` ${styles.segmentActive}` : ""}`} aria-pressed={activeFilter === "attention"} onClick={() => setActiveFilter("attention")}>Perlu perhatian <span>{attentionCount}</span></button>
</div>;

const BudgetListSection = ({ activeFilter, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, periodMeta }) => {
  const title = activeFilter === "attention" ? "Perlu perhatian" : "Kebutuhan aktif";
  const emptyTitle = activeFilter === "attention" ? "Tidak ada kebutuhan yang perlu perhatian" : "Belum ada kebutuhan";
  const emptyDescription = activeFilter === "attention"
    ? "Semua kebutuhan pada periode ini masih dalam kondisi aman."
    : "Buat kebutuhan dari detail Alokasi Dana agar anggarannya muncul di ringkasan ini.";

  return <section className={styles.listSection} aria-labelledby="budget-list-title">
    <div className={styles.listHeading}>
      <h2 id="budget-list-title">{title}</h2>
      {visibleItems.length > 1 ? <button type="button" className={styles.sortButton} onClick={() => setCriticalFirst((current) => !current)} aria-pressed={criticalFirst}><FiSliders aria-hidden="true" />{criticalFirst ? "Paling kritis" : "Urutan awal"}</button> : null}
    </div>
    {visibleItems.length ? <div className={styles.cardGrid}>{visibleItems.map(({ item }) => <BudgetInsightCard key={item.budget_id} item={item} category={categoryLookup[item.category_id]} periodMeta={periodMeta} />)}</div> : <EmptyState title={emptyTitle} description={emptyDescription} />}
  </section>;
};

const BudgetLoadedView = ({ period, setPeriod, currentPeriod, periodMeta, activeFilter, setActiveFilter, items, attentionCount, totals, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, unlinkedCount }) => <div className={`page-stack budgets-page ${styles.page}`}>
  <header className={styles.pageHeader}>
    <div className={styles.pageHeading}>
      <div className={styles.pageTitleRow}><h1>Anggaran</h1><PageInfoButton title="Tentang Anggaran">Anggaran adalah ringkasan seluruh Kebutuhan dari Alokasi Dana. Pembuatan dan perubahan Kebutuhan tetap dilakukan dari detail Alokasi Dana agar tidak ada fungsi ganda.</PageInfoButton></div>
      <span>{periodMeta.label}</span>
    </div>
  </header>
  <div className={styles.controlsRow}>
    <label className={styles.periodControl}><span className="sr-only">Periode</span><input type="month" max={currentPeriod} value={period} onChange={(event) => { setPeriod(event.target.value); setActiveFilter("all"); }} /></label>
    <span className={styles.daysBadge}>{periodMeta.isCurrent ? `${periodMeta.daysLeft} hari tersisa` : "Periode selesai"}</span>
  </div>
  <BudgetTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} totalCount={items.length} attentionCount={attentionCount} />
  <CompactNotice tone="info" className={styles.readOnlyNote} role="status">
    <span>Halaman ini hanya merangkum anggaran. <Link to="/perencanaan/kantong">Kelola Kebutuhan di Alokasi Dana</Link>.</span>
  </CompactNotice>
  {unlinkedCount ? <CompactNotice tone="warning" className={styles.readOnlyNote} role="status" title={`${unlinkedCount} kebutuhan lama belum terhubung ke Alokasi Dana.`}>Data tetap dihitung. Hubungkan dari detail Alokasi Dana agar sumber dana dan laporan tetap mudah ditelusuri.</CompactNotice> : null}
  <BudgetHeroCard totals={totals} periodMeta={periodMeta} />
  <BudgetListSection activeFilter={activeFilter} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} periodMeta={periodMeta} />
  <aside className={styles.tipCard}><span className={styles.tipIcon} aria-hidden="true">%</span><p><strong>Ritme pengeluaran</strong> membandingkan pemakaian setiap kebutuhan dengan posisi hari ini dalam periode.</p><img className={styles.tipArtwork} src={budgetCalendarArtwork} alt="" aria-hidden="true" loading="lazy" decoding="async" /></aside>
</div>;

const BudgetsPage = () => {
  const currentPeriod = currentMonthInJakarta();
  const today = todayInJakarta();
  const [period, setPeriod] = useState(currentPeriod);
  const [activeFilter, setActiveFilter] = useState("all");
  const [criticalFirst, setCriticalFirst] = useState(true);
  const resource = useApiResource("budgets.list", { period });
  const { bootstrap } = useFinance();
  const items = resource.data?.items ?? EMPTY_BUDGET_ITEMS;
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  const totals = budgetTotals(items);
  const periodMeta = useMemo(() => budgetPeriodMeta(period, today), [period, today]);
  const presentationItems = useMemo(() => items.map((item) => ({ item, state: budgetVisualState(item, periodMeta) })), [items, periodMeta]);
  const attentionCount = presentationItems.filter(({ state }) => state.attention).length;
  const unlinkedCount = items.filter((item) => !item.envelope_rule_id).length;
  const visibleItems = useMemo(() => {
    const filtered = activeFilter === "attention" ? presentationItems.filter(({ state }) => state.attention) : [...presentationItems];
    if (!criticalFirst) return filtered;
    const rank = { danger: 4, warning: 3, pace: 2, safe: 1 };
    return filtered.sort((a, b) => (rank[b.state.key] || 0) - (rank[a.state.key] || 0) || b.state.usedPercent - a.state.usedPercent);
  }, [activeFilter, criticalFirst, presentationItems]);

  if (resource.status === "loading") return <LoadingScreen label="Memuat ringkasan anggaran..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  return <>
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <BudgetLoadedView period={period} setPeriod={setPeriod} currentPeriod={currentPeriod} periodMeta={periodMeta} activeFilter={activeFilter} setActiveFilter={setActiveFilter} items={items} attentionCount={attentionCount} totals={totals} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} unlinkedCount={unlinkedCount} />
  </>;
};

export default BudgetsPage;
