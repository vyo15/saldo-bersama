import { useMemo, useState } from "react";
import { FiPlus, FiSliders } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { archiveBudget as requestArchiveBudget, deleteUnusedBudget as requestDeleteUnusedBudget, previewBudgetLifecycle, upsertBudget } from "./budgets.api.js";
import { budgetPeriodMeta, budgetTotals, budgetVisualState } from "./budgetPresentation.js";
import BudgetHeroCard from "./components/BudgetHeroCard.jsx";
import BudgetInsightCard from "./components/BudgetInsightCard.jsx";
import styles from "./BudgetsPage.module.css";

const EMPTY_BUDGET_ITEMS = Object.freeze([]);
const emptyForm = () => ({ category_id: "", amount: "", warning_threshold: 80 });

const BudgetModal = ({ open, close, existingBudget, saveState, saveBudget, form, setForm, categories, selectCategory }) => <Modal open={open} onClose={close} title={existingBudget ? "Edit anggaran" : "Tambah anggaran"} footer={<><Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{existingBudget ? "Simpan perubahan" : "Simpan anggaran"}</Button></>}><form id="budget-form" className="form-grid" onSubmit={saveBudget}><label className="field"><span>Kategori pengeluaran *</span><select required value={form.category_id} onChange={(event) => selectCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label><MoneyInput id="budget-amount" label="Nominal anggaran" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required /><label className="field"><span>Ambang peringatan (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>{saveState.status === "error" ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Anggaran belum dapat disimpan."}</div> : null}</form></Modal>;

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus anggaran yang belum dipakai?" : "Arsipkan anggaran?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum menjadi histori perencanaan dan dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah terkait transaksi atau histori periode. Anggaran hanya dapat diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan anggaran"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Transaksi periode {archiveTarget.preview.dependencies.transactions} · penutupan periode {archiveTarget.preview.dependencies.period_closures}.</div> : null}</ConfirmationModal>;

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
  const existingBudget = items.find((item) => item.category_id === form.category_id && item.scope === "shared") || null;

  const resetSaveState = () => setSaveState({ status: "idle", error: null });
  const selectCategory = (categoryId) => {
    const current = items.find((item) => item.category_id === categoryId && item.scope === "shared") || null;
    setMessage(null);
    resetSaveState();
    setForm(current ? { category_id: current.category_id, amount: String(current.amount || ""), warning_threshold: Number(current.warning_threshold || 80) } : { ...emptyForm(), category_id: categoryId });
  };
  const openBudgetForm = () => { setForm(emptyForm()); setMessage(null); resetSaveState(); setFormOpen(true); };
  const closeBudgetForm = () => {
    if (saveState.status === "submitting") return;
    setFormOpen(false);
    setForm(emptyForm());
    resetSaveState();
  };
  const editBudget = (item) => {
    setForm({ category_id: item.category_id, amount: String(item.amount || ""), warning_threshold: Number(item.warning_threshold || 80) });
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const saveBudget = async (event) => {
    event.preventDefault();
    setSaveState({ status: "submitting", error: null });
    setMessage(null);
    try {
      await upsertBudget({ ...form, period_key: period, amount: assertPositiveRupiah(form.amount), scope: "shared", row_version: existingBudget?.row_version }, { rowVersion: existingBudget?.row_version });
      setForm(emptyForm());
      setFormOpen(false);
      resetSaveState();
      notify({ message: existingBudget ? "Anggaran berhasil diperbarui." : "Anggaran berhasil dibuat.", tone: "success", dedupeKey: existingBudget ? "budgets:update" : "budgets:create" });
      await refresh();
    } catch (error) { setSaveState({ status: "error", error }); }
  };
  return { form, setForm, formOpen, setFormOpen, message, setMessage, saveState, existingBudget, selectCategory, openBudgetForm, closeBudgetForm, editBudget, saveBudget };
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
      setForm((current) => current.category_id === budget.category_id ? emptyForm() : current);
      setFormOpen(false);
      await refresh();
    } catch (error) { setArchiveState({ status: "error", error }); }
  };
  return { archiveTarget, archiveState, setArchiveTarget, openBudgetLifecycle, applyBudgetLifecycle };
};

const BudgetListSection = ({ activeFilter, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, periodMeta, canManage, editBudget, openBudgetLifecycle, openBudgetForm }) => {
  const title = activeFilter === "attention" ? "Perlu perhatian" : "Anggaran aktif";
  const emptyTitle = activeFilter === "attention" ? "Tidak ada anggaran yang perlu perhatian" : "Belum ada anggaran";
  const emptyAction = canManage && activeFilter === "all" ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah anggaran</Button> : undefined;
  return <section className={styles.listSection} aria-labelledby="budget-list-title">
    <div className={styles.listHeading}>
      <h2 id="budget-list-title">{title}</h2>
      {visibleItems.length > 1 ? <button type="button" className={styles.sortButton} onClick={() => setCriticalFirst((current) => !current)} aria-pressed={criticalFirst}><FiSliders aria-hidden="true" />{criticalFirst ? "Paling kritis" : "Urutan awal"}</button> : null}
    </div>
    {visibleItems.length ? <div className={styles.cardGrid}>{visibleItems.map(({ item }) => <BudgetInsightCard key={item.budget_id} item={item} category={categoryLookup[item.category_id]} periodMeta={periodMeta} canManage={canManage} editBudget={editBudget} openBudgetLifecycle={openBudgetLifecycle} />)}</div> : <EmptyState title={emptyTitle} action={emptyAction} />}
  </section>;
};

const BudgetLoadedView = ({ period, setPeriod, currentPeriod, periodMeta, activeFilter, setActiveFilter, items, attentionCount, message, canManage, user, totals, visibleItems, criticalFirst, setCriticalFirst, categoryLookup, formController, lifecycleController, categories }) => <div className={`page-stack budgets-page ${styles.page}`}>
  <header className={styles.pageHeader}>
    <div className={styles.pageHeading}><h1>Anggaran</h1><span>{periodMeta.label}</span></div>
    {canManage ? <button type="button" className={styles.addButton} onClick={formController.openBudgetForm} aria-label="Tambah anggaran" title="Tambah anggaran"><FiPlus aria-hidden="true" /></button> : null}
  </header>
  <div className={styles.controlsRow}>
    <label className={styles.periodControl}><span className="sr-only">Periode</span><input type="month" max={currentPeriod} value={period} onChange={(event) => { setPeriod(event.target.value); setActiveFilter("all"); formController.setForm(emptyForm()); formController.setFormOpen(false); formController.setMessage(null); }} /></label>
    <span className={styles.daysBadge}>{periodMeta.isCurrent ? `${periodMeta.daysLeft} hari tersisa` : "Periode selesai"}</span>
  </div>
  <BudgetTabs activeFilter={activeFilter} setActiveFilter={setActiveFilter} totalCount={items.length} attentionCount={attentionCount} />
  {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
  {!canManage ? <div className={`notice notice--info ${styles.readOnlyNote}`} role="status">{user?.role !== "owner" ? "Anggota dapat memantau anggaran. Pembuatan dan perubahan anggaran hanya dapat dilakukan owner." : "Periode historis ditampilkan hanya-baca. Kelola anggaran pada periode aktif."}</div> : null}
  <BudgetHeroCard totals={totals} periodMeta={periodMeta} />
  <BudgetListSection activeFilter={activeFilter} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} periodMeta={periodMeta} canManage={canManage} editBudget={formController.editBudget} openBudgetLifecycle={lifecycleController.openBudgetLifecycle} openBudgetForm={formController.openBudgetForm} />
  <aside className={styles.tipCard}><span className={styles.tipIcon} aria-hidden="true">%</span><p><strong>Ritme anggaran</strong> membandingkan pemakaian dengan posisi hari ini dalam periode.</p></aside>
  <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} selectCategory={formController.selectCategory} />
  <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} />
</div>;

const BudgetsPage = () => {
  const currentPeriod = currentMonthInJakarta();
  const today = todayInJakarta();
  const [period, setPeriod] = useState(currentPeriod);
  const [activeFilter, setActiveFilter] = useState("all");
  const [criticalFirst, setCriticalFirst] = useState(true);
  const resource = useApiResource("budgets.list", { period });
  const { bootstrap, invalidate, refreshOverview } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const items = resource.data?.items ?? EMPTY_BUDGET_ITEMS;
  const categories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const categoryLookup = useMemo(() => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])), [bootstrap?.categories]);
  const canManage = user?.role === "owner" && period === currentPeriod;
  const totals = budgetTotals(items);
  const periodMeta = useMemo(() => budgetPeriodMeta(period, today), [period, today]);
  const presentationItems = useMemo(() => items.map((item) => ({ item, state: budgetVisualState(item, periodMeta) })), [items, periodMeta]);
  const attentionCount = presentationItems.filter(({ state }) => state.attention).length;
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

  if (resource.status === "loading") return <LoadingScreen label="Memuat anggaran..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <>
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <BudgetLoadedView period={period} setPeriod={setPeriod} currentPeriod={currentPeriod} periodMeta={periodMeta} activeFilter={activeFilter} setActiveFilter={setActiveFilter} items={items} attentionCount={attentionCount} message={formController.message} canManage={canManage} user={user} totals={totals} visibleItems={visibleItems} criticalFirst={criticalFirst} setCriticalFirst={setCriticalFirst} categoryLookup={categoryLookup} formController={formController} lifecycleController={lifecycleController} categories={categories} />
  </>;
};

export default BudgetsPage;
