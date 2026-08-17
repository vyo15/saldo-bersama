import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FiPlus, FiSliders } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { archiveBudget as requestArchiveBudget, deleteUnusedBudget as requestDeleteUnusedBudget, previewBudgetLifecycle, upsertBudget } from "./budgets.api.js";
import { budgetPeriodMeta, budgetTotals, budgetVisualState } from "./budgetPresentation.js";
import BudgetHeroCard from "./components/BudgetHeroCard.jsx";
import BudgetInsightCard from "./components/BudgetInsightCard.jsx";
import budgetCalendarArtwork from "../../assets/budget-illustrations/budget-calendar.webp";
import styles from "./BudgetsPage.module.css";

const BudgetDialogLayer = lazy(() => import("./BudgetDialogLayer.jsx"));

const EMPTY_BUDGET_ITEMS = Object.freeze([]);
const emptyForm = () => ({ category_id: "", amount: "", warning_threshold: 80, scope: "shared", owner_user_id: "" });

const budgetOwnershipUpdates = (value) => value === "shared"
  ? { scope: "shared", owner_user_id: "" }
  : { scope: "personal", owner_user_id: String(value).replace(/^user:/, "") };
const budgetMatchesForm = (item, form) => item.category_id === form.category_id
  && item.scope === form.scope
  && String(item.owner_user_id || "") === String(form.owner_user_id || "");

const BudgetTabs = ({ activeFilter, setActiveFilter, totalCount, attentionCount }) => (
  <div className={styles.segmented} role="group" aria-label="Filter anggaran">
    <button type="button" className={`${styles.segment}${activeFilter === "all" ? ` ${styles.segmentActive}` : ""}`} onClick={() => setActiveFilter("all")} aria-pressed={activeFilter === "all"}>Aktif <span>{totalCount}</span></button>
    <button type="button" className={`${styles.segment}${activeFilter === "attention" ? ` ${styles.segmentActive}` : ""}`} onClick={() => setActiveFilter("attention")} aria-pressed={activeFilter === "attention"}>Perlu perhatian <span>{attentionCount}</span></button>
  </div>
);

const useBudgetFormController = ({ items, period, notify, refresh }) => {
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", error: null });
  const existingBudget = items.find((item) => budgetMatchesForm(item, form)) || null;

  const resetSaveState = () => setSaveState({ status: "idle", error: null });
  const selectCategory = (categoryId) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, category_id: categoryId };
      const current = items.find((item) => budgetMatchesForm(item, nextForm)) || null;
      return current ? { category_id: current.category_id, amount: String(current.amount || ""), warning_threshold: Number(current.warning_threshold || 80), scope: current.scope, owner_user_id: current.owner_user_id || "" } : { ...nextForm, amount: "", warning_threshold: 80 };
    });
  };
  const selectOwnership = (value) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, ...budgetOwnershipUpdates(value) };
      const current = items.find((item) => budgetMatchesForm(item, nextForm)) || null;
      return current ? { category_id: current.category_id, amount: String(current.amount || ""), warning_threshold: Number(current.warning_threshold || 80), scope: current.scope, owner_user_id: current.owner_user_id || "" } : { ...nextForm, amount: "", warning_threshold: 80 };
    });
  };
  const openBudgetForm = () => { setForm(emptyForm()); setMessage(null); resetSaveState(); setFormOpen(true); };
  const closeBudgetForm = () => {
    if (saveState.status === "submitting") return;
    setFormOpen(false);
    setForm(emptyForm());
    resetSaveState();
  };
  const editBudget = (item) => {
    setForm({ category_id: item.category_id, amount: String(item.amount || ""), warning_threshold: Number(item.warning_threshold || 80), scope: item.scope || "shared", owner_user_id: item.owner_user_id || "" });
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const saveBudget = async (event) => {
    event.preventDefault();
    setSaveState({ status: "submitting", error: null });
    setMessage(null);
    try {
      await upsertBudget({ ...form, period_key: period, amount: assertPositiveRupiah(form.amount), owner_user_id: form.scope === "personal" ? form.owner_user_id : null, row_version: existingBudget?.row_version }, { rowVersion: existingBudget?.row_version });
      setForm(emptyForm());
      setFormOpen(false);
      resetSaveState();
      notify({ message: existingBudget ? "Anggaran berhasil diperbarui." : "Anggaran berhasil dibuat.", tone: "success", dedupeKey: existingBudget ? "budgets:update" : "budgets:create" });
      await refresh();
    } catch (error) { setSaveState({ status: "error", error }); }
  };
  return { form, setForm, formOpen, setFormOpen, message, setMessage, saveState, existingBudget, selectCategory, selectOwnership, openBudgetForm, closeBudgetForm, editBudget, saveBudget };
};

const useBudgetLifecycleController = ({ notify, refresh, setForm, setFormOpen }) => {
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const openBudgetLifecycle = async (budget) => {
    setArchiveState({ status: "submitting", error: null });
    try {
      const preview = await previewBudgetLifecycle({ budget_id: budget.budget_id, row_version: budget.row_version }, { force: true });
      setArchiveTarget({ budget, preview });
      setArchiveState({ status: "idle", error: null });
    } catch (error) {
      setArchiveState({ status: "idle", error: null });
      notify({ message: error.message || "Status anggaran gagal diperiksa.", tone: "danger", dedupeKey: "budgets:lifecycle-preview-error" });
    }
  };
  const applyBudgetLifecycle = async (reason) => {
    if (!archiveTarget) return;
    const { budget, preview } = archiveTarget;
    setArchiveState({ status: "submitting", error: null });
    try {
      if (preview.canDeleteUnused) {
        await requestDeleteUnusedBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Anggaran yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "budgets:delete-unused" });
      } else {
        await requestArchiveBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Anggaran berhasil diarsipkan. Transaksi dan laporan historis tetap tersimpan.", tone: "success", dedupeKey: "budgets:archive" });
      }
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      setForm((current) => budgetMatchesForm(budget, current) ? emptyForm() : current);
      setFormOpen(false);
      await refresh();
    } catch (error) { setArchiveState({ status: "error", error }); }
  };
  return { archiveTarget, archiveState, setArchiveTarget, openBudgetLifecycle, applyBudgetLifecycle };
};

const BudgetListSection = ({ activeFilter, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, periodMeta, canManage, editBudget, openBudgetLifecycle, openBudgetForm, attentionBudgetId }) => {
  const title = activeFilter === "attention" ? "Perlu perhatian" : "Anggaran aktif";
  const emptyTitle = activeFilter === "attention" ? "Tidak ada anggaran yang perlu perhatian" : "Belum ada anggaran";
  const emptyAction = canManage && activeFilter === "all" ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah anggaran</Button> : undefined;
  return <section className={styles.listSection} aria-labelledby="budget-list-title">
    <div className={styles.listHeading}>
      <h2 id="budget-list-title">{title}</h2>
      {visibleItems.length > 1 ? <button type="button" className={styles.sortButton} onClick={() => setCriticalFirst((current) => !current)} aria-pressed={criticalFirst}><FiSliders aria-hidden="true" />{criticalFirst ? "Paling kritis" : "Urutan awal"}</button> : null}
    </div>
    {visibleItems.length ? <div className={styles.cardGrid}>{visibleItems.map(({ item }) => <BudgetInsightCard key={item.budget_id} item={item} attention={item.budget_id === attentionBudgetId} category={categoryLookup[item.category_id]} periodMeta={periodMeta} canManage={canManage} editBudget={editBudget} openBudgetLifecycle={openBudgetLifecycle} />)}</div> : <EmptyState title={emptyTitle} action={emptyAction} />}
  </section>;
};

const BudgetLoadedView = ({ period, setPeriod, currentPeriod, periodMeta, activeFilter, setActiveFilter, items, attentionCount, message, canManage, user, totals, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, formController, lifecycleController, categories, users, usersStatus, attentionBudgetId }) => <div className={`page-stack budgets-page ${styles.page}`}>
  <header className={styles.pageHeader}>
    <div className={styles.pageHeading}><h1>Anggaran</h1><span>{periodMeta.label}</span></div>
    {canManage && (items.length > 0 || activeFilter !== "all") ? <button type="button" className={styles.addButton} onClick={formController.openBudgetForm} aria-label="Tambah anggaran" title="Tambah anggaran"><FiPlus aria-hidden="true" /></button> : null}
  </header>
  <div className={styles.controlsRow}>
    <label className={styles.periodControl}><span className="sr-only">Periode</span><input type="month" max={currentPeriod} value={period} onChange={(event) => { setPeriod(event.target.value); setActiveFilter("all"); formController.setForm(emptyForm()); formController.setFormOpen(false); formController.setMessage(null); }} /></label>
    <span className={styles.daysBadge}>{periodMeta.isCurrent ? `${periodMeta.daysLeft} hari tersisa` : "Periode selesai"}</span>
  </div>
  <BudgetTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} totalCount={items.length} attentionCount={attentionCount} />
  {attentionBudgetId ? <div className="notice notice--info attention-guidance" role="status"><strong>Periksa anggaran yang disorot.</strong><span>Lihat pemakaian dan transaksi terkait. Ubah batas anggaran hanya jika rencana keuangan memang berubah, bukan sekadar untuk menghilangkan peringatan.</span></div> : null}
  {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
  {!canManage ? <div className={`notice notice--info ${styles.readOnlyNote}`} role="status">{user?.role !== "owner" ? "Member dapat memantau anggaran. Pembuatan dan perubahan anggaran hanya dapat dilakukan Administrator." : "Periode historis ditampilkan hanya-baca. Kelola anggaran pada periode aktif."}</div> : null}
  <BudgetHeroCard totals={totals} periodMeta={periodMeta} />
  <BudgetListSection activeFilter={activeFilter} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} periodMeta={periodMeta} canManage={canManage} editBudget={formController.editBudget} openBudgetLifecycle={lifecycleController.openBudgetLifecycle} openBudgetForm={formController.openBudgetForm} attentionBudgetId={attentionBudgetId} />
  <aside className={styles.tipCard}><span className={styles.tipIcon} aria-hidden="true">%</span><p><strong>Ritme anggaran</strong> membandingkan pemakaian dengan posisi hari ini dalam periode.</p><img className={styles.tipArtwork} src={budgetCalendarArtwork} alt="" aria-hidden="true" loading="lazy" decoding="async" /></aside>
  {formController.formOpen || lifecycleController.archiveTarget ? <Suspense fallback={null}><BudgetDialogLayer canManage={canManage} categories={categories} users={users} usersStatus={usersStatus} formController={formController} lifecycleController={lifecycleController} /></Suspense> : null}
</div>;

const BudgetsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const attentionHandled = useRef(false);
  const currentPeriod = currentMonthInJakarta();
  const today = todayInJakarta();
  const [period, setPeriod] = useState(currentPeriod);
  const [activeFilter, setActiveFilter] = useState("all");
  const [criticalFirst, setCriticalFirst] = useState(true);
  const resource = useApiResource("budgets.list", { period });
  const { bootstrap, invalidate, refreshOverview } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const administratorMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: administratorMode });
  const activeUsers = usersResource.data?.items?.filter((item) => item.status === "active") || [];
  const items = resource.data?.items ?? EMPTY_BUDGET_ITEMS;
  const categories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  const canManage = administratorMode && period === currentPeriod;
  const totals = budgetTotals(items);
  const periodMeta = useMemo(() => budgetPeriodMeta(period, today), [period, today]);
  const presentationItems = useMemo(() => items.map((item) => ({ item, state: budgetVisualState(item, periodMeta) })), [items, periodMeta]);
  const attentionCount = presentationItems.filter(({ state }) => state.attention).length;
  const attentionBudgetId = String(attention?.attentionBudgetId || "");
  const visibleItems = useMemo(() => {
    const filtered = activeFilter === "attention" ? presentationItems.filter(({ state }) => state.attention) : [...presentationItems];
    if (!criticalFirst) return filtered;
    const rank = { danger: 4, warning: 3, pace: 2, safe: 1 };
    return filtered.sort((a, b) => (rank[b.state.key] || 0) - (rank[a.state.key] || 0) || b.state.usedPercent - a.state.usedPercent);
  }, [activeFilter, criticalFirst, presentationItems]);
  const refresh = async () => {
    invalidate(["budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
    await Promise.allSettled([resource.reload(), refreshOverview()]);
  };
  const formController = useBudgetFormController({ items, period, notify, refresh });
  const lifecycleController = useBudgetLifecycleController({ notify, refresh, setForm: formController.setForm, setFormOpen: formController.setFormOpen });
  useEffect(() => {
    if (attentionHandled.current || !attentionBudgetId || resource.status !== "ready") return undefined;
    attentionHandled.current = true;
    const target = presentationItems.find(({ item }) => item.budget_id === attentionBudgetId);
    consumeAttention();
    if (!target) return undefined;
    setActiveFilter(target.state.attention ? "attention" : "all");
    const frame = window.requestAnimationFrame(() => document.querySelector(`[data-budget-id="${CSS.escape(attentionBudgetId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [attentionBudgetId, consumeAttention, presentationItems, resource.status]);

  if (resource.status === "loading") return <LoadingScreen label="Memuat anggaran..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <>
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    {administratorMode ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
    <BudgetLoadedView period={period} setPeriod={setPeriod} currentPeriod={currentPeriod} periodMeta={periodMeta} activeFilter={activeFilter} setActiveFilter={setActiveFilter} items={items} attentionCount={attentionCount} message={formController.message} canManage={canManage} user={user} totals={totals} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} formController={formController} lifecycleController={lifecycleController} categories={categories} users={activeUsers} usersStatus={usersResource.status} attentionBudgetId={attentionBudgetId} />
  </>;
};

export default BudgetsPage;
