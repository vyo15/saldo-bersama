import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { adjustEnvelopeAllocation as requestAdjustEnvelopeAllocation, archiveEnvelopeRule as requestArchiveEnvelopeRule, closeEnvelope as requestCloseEnvelope, createEnvelope as requestCreateEnvelope, deleteUnusedEnvelopeRule as requestDeleteUnusedEnvelopeRule, moveEnvelope as requestMoveEnvelope, previewEnvelopeRuleLifecycle, reverseEnvelopeMovement as requestReverseEnvelopeMovement } from "./allocations.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { currentMonthBoundsInJakarta, currentMonthInJakarta } from "../../domain/dates.js";
import { canUseAssignedItem, filterByAssigneeAccess, filterByOwnership, hasSameAssignee, ownershipKey } from "../../domain/ownership.js";
const AllocationDialogLayer = lazy(() => import("./AllocationDialogLayer.jsx"));
const AllocationOverviewLayer = lazy(() => import("./AllocationOverviewLayer.jsx"));
const AllocationNoticesLayer = lazy(() => import("./AllocationNoticesLayer.jsx"));
const AllocationPlanningDetail = lazy(() => import("./AllocationPlanningDetail.jsx"));
const AllocationSecondaryLayer = lazy(() => import("./AllocationSecondaryLayer.jsx"));
const ManualReminderModal = lazy(() => import("../reminders/ManualReminderModal.jsx"));

const defaultCreateForm = () => {
  const { start, end } = currentMonthBoundsInJakarta();
  return { name: "", default_amount: "", source_account_id: "", assignee_user_id: "", period_type: "monthly", period_start: start, period_end: end, rollover_policy: "unallocated", overspend_policy: "confirm" };
};

const useAllocationCreateMove = ({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup, notify, setMessage, onCreated, onMoved }) => {
  const refreshAfterMutation = async () => { invalidate(["accounts.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([resource.reload(), refreshOverview()]); };
  const createEnvelope = (event) => {
    event.preventDefault(); setMessage(null);
    return createMutation.run(async () => {
      const amount = assertPositiveRupiah(createForm.default_amount);
      if (!createForm.source_account_id) throw new Error("Rekening sumber wajib dipilih.");
      await requestCreateEnvelope({ ...createForm, default_amount: amount, allocated_amount: amount }, {});
      setCreateForm(defaultCreateForm());
      onCreated?.();
      notify({ message: "Kantong dan periode aktif berhasil dibuat." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  const submitMove = (event) => {
    event.preventDefault(); setMessage(null);
    return moveMutation.run(async () => {
      const amount = assertPositiveRupiah(move.amount);
      const from = lookup[move.fromEnvelopePeriodId]; const to = lookup[move.toEnvelopePeriodId];
      if (!from || !to) throw new Error("Kantong sumber dan tujuan wajib dipilih.");
      if (from.envelope_period_id === to.envelope_period_id) throw new Error("Kantong sumber dan tujuan harus berbeda.");
      if (amount > Number(from.remaining_amount || 0)) throw new Error("Nominal melebihi sisa kantong sumber.");
      await requestMoveEnvelope({ ...move, amount, from_row_version: from.row_version, to_row_version: to.row_version }, {});
      setMove({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
      onMoved?.();
      notify({ message: "Dana antar Kantong berhasil dipindahkan tanpa mengubah total saldo." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { refreshAfterMutation, createEnvelope, submitMove };
};

const useAllocationAdjustment = ({ adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, adjustMutation, refreshAfterMutation, notify, setMessage, onReleased }) => {
  const submitAdjustment = (event) => {
    event.preventDefault();
    setMessage(null);
    if (!adjustTarget) return Promise.resolve();
    return adjustMutation.run(async () => {
      const amount = assertPositiveRupiah(adjustForm.amount);
      await requestAdjustEnvelopeAllocation({
        envelope_period_id: adjustTarget.envelope_period_id,
        direction: adjustForm.direction,
        amount,
        reason: adjustForm.reason,
        row_version: adjustTarget.row_version,
      }, { rowVersion: adjustTarget.row_version });
      const funded = adjustForm.direction === "fund";
      setAdjustTarget(null);
      setAdjustForm({ direction: "fund", amount: "", reason: "" });
      if (!funded) onReleased?.(amount);
      notify({ message: funded ? "Dana tersedia berhasil ditambahkan ke Kantong." : "Dana Kantong berhasil dikembalikan menjadi dana tersedia." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { submitAdjustment };
};

const useAllocationLifecycle = ({ closeTarget, setCloseTarget, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation, notify, onReleased }) => {
  const closeEnvelope = async () => {
    if (!closeTarget) return; setCloseState({ status: "submitting", error: null });
    try { const result = await requestCloseEnvelope({ envelope_period_id: closeTarget.envelope_period_id, row_version: closeTarget.row_version }, { rowVersion: closeTarget.row_version }); const releasedAmount = result?.rollover ? 0 : Math.max(0, Number(closeTarget.remaining_amount || 0)); setCloseTarget(null); setCloseState({ status: "idle", error: null }); const rolloverAmount = Number(result?.rollover?.amount || 0); if (releasedAmount > 0) onReleased?.(releasedAmount); notify({ message: rolloverAmount > 0 ? `Periode berhasil ditutup. Sisa Rp ${rolloverAmount.toLocaleString("id-ID")} dibawa ke periode berikutnya.` : "Periode kantong berhasil ditutup. Sisa dana Kantong kembali menjadi dana belum dialokasikan." }); await refreshAfterMutation(); } catch (error) { setCloseState({ status: "error", error }); }
  };
  const openRuleLifecycle = async (item) => { setArchiveState({ status: "submitting", error: null }); try { const preview = await previewEnvelopeRuleLifecycle({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version }, { force: true }); setArchiveTarget({ item, preview }); setArchiveState({ status: "idle", error: null }); } catch (error) { setArchiveState({ status: "idle", error: null }); notify({ message: error.message || "Status kantong gagal diperiksa.", tone: "danger", dedupeKey: "envelopes:lifecycle-preview-error" }); } };
  const applyRuleLifecycle = async (reason, confirmation) => { if (!archiveTarget) return; const { item, preview } = archiveTarget; setArchiveState({ status: "submitting", error: null }); try { if (preview.canDeleteUnused) { await requestDeleteUnusedEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: item.rule_row_version }); notify({ message: "Kantong yang belum pernah digunakan berhasil dihapus permanen." }); } else { await requestArchiveEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason }, { rowVersion: item.rule_row_version }); notify({ message: "Aturan kantong diarsipkan. Riwayat periode dan mutasi tetap tersimpan." }); } setArchiveTarget(null); setArchiveState({ status: "idle", error: null }); await refreshAfterMutation(); } catch (error) { setArchiveState({ status: "error", error }); } };
  const reverseMovement = async (reason) => { if (!reverseTarget) return; setReverseState({ status: "submitting", error: null }); try { await requestReverseEnvelopeMovement({ movement_id: reverseTarget.movement_id, row_version: reverseTarget.row_version, from_row_version: reverseTarget.from_row_version, to_row_version: reverseTarget.to_row_version, reason }, { rowVersion: reverseTarget.row_version }); setReverseTarget(null); setReverseState({ status: "idle", error: null }); notify({ message: "Pemindahan dana antar Kantong berhasil dibatalkan tanpa menghapus riwayat audit." }); await refreshAfterMutation(); } catch (error) { setReverseState({ status: "error", error }); } };
  return { closeEnvelope, openRuleLifecycle, applyRuleLifecycle, reverseMovement };
};

const canSetAllocationReminder = (item, actor) => {
  if (!canUseAssignedItem(item, actor)) return false;
  if (actor?.role === "owner") return true;
  const ownerKey = ownershipKey(item);
  return ownerKey === "shared:" || ownerKey === `personal:${actor?.user_id || ""}`;
};

const sameOwnership = (left, right) => String(left?.scope || "") === String(right?.scope || "")
  && String(left?.owner_user_id || "") === String(right?.owner_user_id || "");

const linkedBudgetsForEnvelope = (budgets, item) => (budgets || []).filter((budget) => budget.envelope_rule_id === item.envelope_rule_id);

const relatedRecurringForEnvelope = (recurringItems, budgets, item) => {
  const categoryIds = new Set(linkedBudgetsForEnvelope(budgets, item).map((budget) => budget.category_id));
  return (recurringItems || []).filter((entry) => entry.kind === "expense"
    && entry.default_account_id === item.source_account_id
    && categoryIds.has(entry.category_id)
    && sameOwnership(entry, item));
};

const canAdjustAllocation = (item, actor) => actor?.role === "owner" || (item?.scope === "shared" && canUseAssignedItem(item, actor));

const isAllocationAdministrator = (user) => user?.role === "owner";
const canCreateSharedPlanning = (user) => Boolean(user?.role === "owner" || user?.role === "member");
const canManagePlanningItem = (item, user) => Boolean(user?.role === "owner" || (user?.role === "member" && item?.scope === "shared"));
const allocationUsersStatus = (administratorMode, usersResource) => administratorMode ? usersResource.status : "ready";
const allocationDetailData = (item, budgets, recurringItems, user) => {
  if (!item) return { linkedBudgets: [], relatedRecurring: [], canManage: false };
  return {
    linkedBudgets: linkedBudgetsForEnvelope(budgets, item),
    relatedRecurring: relatedRecurringForEnvelope(recurringItems, budgets, item),
    canManage: canManagePlanningItem(item, user),
  };
};
const hasAllocationSecondaryContent = (detailItem, view, actionTarget) => !detailItem && Boolean(view.historicalItems.length || view.recentMovements.length || actionTarget);
const activeAllocationAccounts = (bootstrap, overview, user) => {
  const balanceLookup = new Map((overview?.accountBalances || []).map((item) => [item.account_id, item]));
  return (bootstrap?.accounts || []).filter((item) => item.status === "active")
    .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) }))
    .filter((item) => user?.role === "owner" || item.owner_scope === "shared");
};
const activeAllocationUsers = (resource, actor, administratorMode) => administratorMode
  ? (resource.data?.items || []).filter((item) => item.status === "active")
  : actor?.user_id ? [actor] : [];

const filterActiveAllocations = (items, allocationFilter, actor) => items.filter((item) => {
  if (allocationFilter === "shared") return !item.assignee_user_id;
  if (allocationFilter === "mine") return Boolean(actor?.user_id) && item.assignee_user_id === actor.user_id;
  if (allocationFilter === "unused") return Number(item.used_amount || 0) + Number(item.reserved_amount || 0) === 0;
  return true;
});

const sameSourceAccount = (left, right) => Boolean(left?.source_account_id) && left.source_account_id === right?.source_account_id;

const allocationMoveDestinations = ({ movableItems, selectedSourceEnvelope, sourceId, administratorMode }) => filterByOwnership(movableItems, selectedSourceEnvelope)
  .filter((item) => item.envelope_period_id !== sourceId)
  .filter((item) => sameSourceAccount(item, selectedSourceEnvelope))
  .filter((item) => administratorMode || hasSameAssignee(item, selectedSourceEnvelope));

const hasAllocationMovePair = (movableItems, administratorMode) => movableItems.some((source) => filterByOwnership(movableItems, source)
  .some((target) => target.envelope_period_id !== source.envelope_period_id && sameSourceAccount(source, target) && (administratorMode || hasSameAssignee(source, target))));

const AllocationDialogs = ({ createOpen, moveOpen, adjustTarget, closeTarget, archiveTarget, reverseTarget, dialogProps }) => {
  if (!createOpen && !moveOpen && !adjustTarget && !closeTarget && !archiveTarget && !reverseTarget) return null;
  return <Suspense fallback={null}><AllocationDialogLayer {...dialogProps} /></Suspense>;
};

const useAllocationViewData = ({ resource, budgetResource, recurringResource, bootstrap, overview, usersResource, allocationFilter, move, administratorMode, allocationActor }) => {
  const accounts = activeAllocationAccounts(bootstrap, overview, allocationActor);
  const activeUsers = activeAllocationUsers(usersResource, allocationActor, administratorMode);
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const budgets = useMemo(() => budgetResource.data?.items || [], [budgetResource.data?.items]);
  const recurringItems = useMemo(() => recurringResource.data?.items || [], [recurringResource.data?.items]);
  const expenseCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const unlinkedBudgets = useMemo(() => budgets.filter((budget) => !budget.envelope_rule_id), [budgets]);
  const historicalItems = useMemo(() => items.filter((item) => item.status !== "active"), [items]);
  const filteredActiveItems = useMemo(() => filterActiveAllocations(activeItems, allocationFilter, allocationActor), [activeItems, allocationActor, allocationFilter]);
  const movableItems = useMemo(() => filterByAssigneeAccess(activeItems, allocationActor).filter((item) => Boolean(item.source_account_id)), [activeItems, allocationActor]);
  const lookup = useMemo(() => Object.fromEntries(activeItems.map((item) => [item.envelope_period_id, item])), [activeItems]);
  const selectedSourceEnvelope = lookup[move.fromEnvelopePeriodId] || null;
  return {
    accounts, activeUsers, items, activeItems, budgets, recurringItems, expenseCategories, unlinkedBudgets, historicalItems,
    filteredActiveItems, movableItems, lookup, selectedSourceEnvelope, recentMovements: resource.data?.recentMovements || [],
    destinations: allocationMoveDestinations({ movableItems, selectedSourceEnvelope, sourceId: move.fromEnvelopePeriodId, administratorMode }),
    canMove: hasAllocationMovePair(movableItems, administratorMode),
    hasUnboundAllocation: activeItems.some((item) => !item.source_account_id),
  };
};

const useAllocationAttentionNavigation = ({ attentionHandled, resourceStatus, budgetStatus, attentionEnvelopeId, attentionBudgetId, activeItems, budgets, consumeAttention, setDetailRuleId, setLegacyBudgetAttention }) => {
  useEffect(() => {
    if (attentionHandled.current || resourceStatus !== "ready" || budgetStatus === "loading") return undefined;
    if (!attentionEnvelopeId && !attentionBudgetId) return undefined;
    attentionHandled.current = true;
    const targetEnvelope = attentionEnvelopeId ? activeItems.find((item) => item.envelope_period_id === attentionEnvelopeId) : null;
    const targetBudget = !targetEnvelope && attentionBudgetId ? budgets.find((item) => item.budget_id === attentionBudgetId) : null;
    if (targetEnvelope) setDetailRuleId(targetEnvelope.envelope_rule_id);
    if (targetBudget?.envelope_rule_id) setDetailRuleId(targetBudget.envelope_rule_id);
    if (targetBudget && !targetBudget.envelope_rule_id) setLegacyBudgetAttention(true);
    consumeAttention();
    if (!targetBudget?.budget_id) return undefined;
    const frame = window.requestAnimationFrame(() => document.querySelector(`[data-budget-id="${CSS.escape(targetBudget.budget_id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeItems, attentionBudgetId, attentionEnvelopeId, attentionHandled, budgetStatus, budgets, consumeAttention, resourceStatus, setDetailRuleId, setLegacyBudgetAttention]);
};

const AllocationMainContent = ({ detailItem, detailProps, overviewProps }) => {
  if (detailItem) return <Suspense fallback={<div className="notice notice--info" role="status">Memuat detail Kantong...</div>}><AllocationPlanningDetail item={detailItem} {...detailProps} /></Suspense>;
  return <Suspense fallback={<div className="notice notice--info" role="status">Memuat Kantong Dana...</div>}><AllocationOverviewLayer {...overviewProps} /></Suspense>;
};

const AllocationsPage = ({ embedded = false, onOpenRecurring = () => {} }) => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const attentionHandled = useRef(false);
  const period = currentMonthInJakarta();
  const resource = useApiResource("envelopes.list", { period });
  const budgetResource = useApiResource("budgets.list", { period });
  const recurringResource = useApiResource("recurring.list", { period });
  const { refreshOverview, invalidate, bootstrap, overview } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const administratorMode = isAllocationAdministrator(user);
  const canCreate = canCreateSharedPlanning(user);
  const usersResource = useApiResource("users.list", {}, { enabled: administratorMode });
  const createMutation = useGuardedMutation();
  const moveMutation = useGuardedMutation();
  const adjustMutation = useGuardedMutation();
  const [move, setMove] = useState({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ direction: "fund", amount: "", reason: "" });
  const [message, setMessage] = useState(null);
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [detailRuleId, setDetailRuleId] = useState("");
  const [legacyBudgetAttention, setLegacyBudgetAttention] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const [releasedFunds, setReleasedFunds] = useState(0);
  const allocationActor = bootstrap?.user || user;
  const view = useAllocationViewData({ resource, budgetResource, recurringResource, bootstrap, overview, usersResource, allocationFilter, move, administratorMode, allocationActor });
  const detailItem = view.activeItems.find((item) => item.envelope_rule_id === detailRuleId) || null;
  const createMove = useAllocationCreateMove({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup: view.lookup, notify, setMessage, onCreated: () => setCreateOpen(false), onMoved: () => setMoveOpen(false) });
  const adjustment = useAllocationAdjustment({ adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, adjustMutation, refreshAfterMutation: createMove.refreshAfterMutation, notify, setMessage, onReleased: setReleasedFunds });
  const lifecycle = useAllocationLifecycle({ closeTarget, setCloseTarget, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation: createMove.refreshAfterMutation, notify, onReleased: setReleasedFunds });
  const attentionEnvelopeId = String(attention?.attentionEnvelopeId || "");
  const attentionBudgetId = String(attention?.attentionBudgetId || "");
  const refreshBudgetPlanning = async () => { invalidate(["budgets.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([budgetResource.reload(), resource.reload(), refreshOverview()]); };
  const detail = allocationDetailData(detailItem, view.budgets, view.recurringItems, user);
  const usersStatus = allocationUsersStatus(administratorMode, usersResource);
  const showSecondaryLayer = hasAllocationSecondaryContent(detailItem, view, actionTarget);

  useAllocationAttentionNavigation({ attentionHandled, resourceStatus: resource.status, budgetStatus: budgetResource.status, attentionEnvelopeId, attentionBudgetId, activeItems: view.activeItems, budgets: view.budgets, consumeAttention, setDetailRuleId, setLegacyBudgetAttention });
  useEffect(() => { if (detailRuleId && resource.status === "ready" && !detailItem) setDetailRuleId(""); }, [detailItem, detailRuleId, resource.status]);

  if (resource.status === "loading") return <LoadingScreen label="Memuat Kantong Dana..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const closeCreate = () => { if (!createMutation.busy) setCreateOpen(false); };
  const closeMove = () => { if (!moveMutation.busy) setMoveOpen(false); };
  const closeAdjust = () => { if (!adjustMutation.busy) setAdjustTarget(null); };
  const openAdjust = (item, direction = "fund") => { setMessage(null); setAdjustForm({ direction, amount: "", reason: "" }); setAdjustTarget(item); };
  const startClosePeriod = (item) => { setActionTarget(null); setCloseTarget(item); setCloseState({ status: "idle", error: null }); };
  const startLifecycle = (item) => { setActionTarget(null); lifecycle.openRuleLifecycle(item); };
  const openReminder = (item) => setReminderTarget({ entityType: "envelope_period", entityId: item.envelope_period_id, name: item.name, suggestedDate: item.period_end });
  const openBudgetReminder = (budget) => setReminderTarget({ entityType: "budget", entityId: budget.budget_id, name: budget.name || "Batas pengeluaran" });
  const openDetail = (item) => { setLegacyBudgetAttention(false); setDetailRuleId(item.envelope_rule_id); window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" })); };
  const closeDetail = () => { setDetailRuleId(""); window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" })); };
  const reloadPlanning = () => Promise.allSettled([resource.reload(), budgetResource.reload(), recurringResource.reload()]);
  const modalProps = { closeTarget, setCloseTarget, closeState, archiveTarget, setArchiveTarget, archiveState, reverseTarget, setReverseTarget, reverseState, ...lifecycle };

  return <div className="page-stack allocations-page">
    <Suspense fallback={null}><AllocationNoticesLayer resource={resource} budgetResource={budgetResource} recurringResource={recurringResource} administratorMode={administratorMode} usersResource={usersResource} attentionEnvelopeId={attentionEnvelopeId} legacyBudgetAttention={legacyBudgetAttention} unlinkedBudgets={view.unlinkedBudgets} hasUnboundAllocation={view.hasUnboundAllocation} releasedFunds={releasedFunds} hasActiveGoal={(overview?.goals || []).some((goal) => goal.status === "active")} onDismissReleasedFunds={() => setReleasedFunds(0)} /></Suspense>
    {embedded ? <div className="allocation-embedded-header"><div><h2>Kantong Dana</h2><p>Pisahkan dana berdasarkan tujuan. Kategori hanya dipakai saat membuat batas pengeluaran di dalam Kantong.</p></div></div> : <PageHeader title="Kantong Dana" description="Pisahkan dana berdasarkan tujuan, lalu atur batas dan jadwal yang terkait." help="Kantong Dana tidak memakai kategori dan tidak mengubah saldo rekening. Batas pengeluaran di dalam Kantong memakai kategori untuk mengukur transaksi aktual." />}
    <AllocationMainContent detailItem={detailItem} detailProps={{ ...detail, budgets: view.budgets, canLifecycle: administratorMode, sharedOnly: user?.role === "member", period, notify, refreshBudgetPlanning, expenseCategories: view.expenseCategories, users: view.activeUsers, usersStatus, onBack: closeDetail, onBudgetReminder: openBudgetReminder, onOpenRecurring }} overviewProps={{ activeItems: view.activeItems, filteredActiveItems: view.filteredActiveItems, allocationFilter, setAllocationFilter, setActionTarget, onReminder: openReminder, onAdjust: openAdjust, actor: allocationActor, attentionEnvelopeId, budgets: view.budgets, recurringItems: view.recurringItems, onOpenDetail: openDetail, canCreate, administratorMode, canMove: view.canMove, openCreate: () => { setMessage(null); setCreateOpen(true); }, openMove: () => { setMessage(null); setMoveOpen(true); }, reload: reloadPlanning, canAdjustItem: canAdjustAllocation, canRemindItem: canSetAllocationReminder, linkedBudgetsForItem: linkedBudgetsForEnvelope, relatedRecurringForItem: relatedRecurringForEnvelope }} />
    {showSecondaryLayer ? <Suspense fallback={null}><AllocationSecondaryLayer historicalItems={view.historicalItems} recentMovements={view.recentMovements} actionTarget={actionTarget} onCloseAction={() => setActionTarget(null)} onClosePeriod={startClosePeriod} onLifecycle={startLifecycle} setReverseTarget={setReverseTarget} setReverseState={setReverseState} /></Suspense> : null}
    {reminderTarget ? <Suspense fallback={null}><ManualReminderModal target={reminderTarget} onClose={() => setReminderTarget(null)} /></Suspense> : null}
    <AllocationDialogs createOpen={createOpen} moveOpen={moveOpen} adjustTarget={adjustTarget} closeTarget={closeTarget} archiveTarget={archiveTarget} reverseTarget={reverseTarget} dialogProps={{ createOpen, closeCreate, createForm, setCreateForm, accounts: view.accounts, activeUsers: view.activeUsers, usersStatus: administratorMode ? usersResource.status : "ready", createEnvelope: createMove.createEnvelope, createMutation, message, moveOpen, closeMove, move, setMove, movableItems: view.movableItems, destinations: view.destinations, submitMove: createMove.submitMove, moveMutation, adjustTarget, closeAdjust, adjustForm, setAdjustForm, submitAdjustment: adjustment.submitAdjustment, adjustMutation, modalProps }} />
  </div>;
};

export default AllocationsPage;
