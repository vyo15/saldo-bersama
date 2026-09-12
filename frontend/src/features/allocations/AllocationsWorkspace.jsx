import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { currentMonthBoundsInJakarta, currentMonthInJakarta } from "../../domain/dates.js";
import { filterByOwnership, hasSameAssignee } from "../../domain/ownership.js";
import { allocationClass } from "./allocationStyles.js";
import AllocationNoticesLayer from "./AllocationNoticesLayer.jsx";
import { scrollWindowToWithMotionPreference } from "../../shared/motion.js";
const AllocationOverlayLayer = lazy(() => import("./AllocationOverlayLayer.jsx"));
const AllocationOverviewLayer = lazy(() => import("./AllocationOverviewLayer.jsx"));
const AllocationPlanningDetail = lazy(() => import("./AllocationPlanningDetail.jsx"));
const loadAllocationActionRunners = () => import("./allocationActionRunners.js");

const defaultCreateForm = () => {
  const { start, end } = currentMonthBoundsInJakarta();
  return { name: "", source_account_id: "", assignee_user_id: "", period_type: "monthly", period_start: start, period_end: end, rollover_policy: "unallocated", overspend_policy: "confirm" };
};

const useAllocationCreateMove = ({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup, notify, setMessage, onCreated, onMoved }) => {
  const refreshAfterMutation = async () => { invalidate(["accounts.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([resource.reload(), refreshOverview()]); };
  const createEnvelope = (event) => {
    event.preventDefault(); setMessage(null);
    return createMutation.run(async () => {
      const { runCreateAllocation } = await loadAllocationActionRunners();
      await runCreateAllocation({ createForm, resetForm: defaultCreateForm, setCreateForm, onCreated, notify, refreshAfterMutation });
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  const submitMove = (event) => {
    event.preventDefault(); setMessage(null);
    return moveMutation.run(async () => {
      const { runMoveAllocation } = await loadAllocationActionRunners();
      await runMoveAllocation({ move, lookup, setMove, onMoved, notify, refreshAfterMutation });
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { refreshAfterMutation, createEnvelope, submitMove };
};

const useAllocationAdjustment = ({ adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, adjustMutation, refreshAfterMutation, notify, setMessage, onReleased }) => {
  const applyAdjustment = async ({ target, direction, amount, reason = "" }) => {
    const { runAllocationAdjustment } = await loadAllocationActionRunners();
    return runAllocationAdjustment({ target, direction, rawAmount: amount, reason, setAdjustTarget, setAdjustForm, onReleased, notify, refreshAfterMutation });
  };
  const submitAdjustment = (event) => {
    event.preventDefault();
    setMessage(null);
    if (!adjustTarget) return Promise.resolve(false);
    return adjustMutation.run(() => applyAdjustment({ target: adjustTarget, direction: adjustForm.direction, amount: adjustForm.amount, reason: adjustForm.reason }))
      .catch((error) => { setMessage({ type: "danger", text: error.message }); return false; });
  };
  const fundAvailable = ({ target, amount, reason }) => {
    setMessage(null);
    return adjustMutation.run(() => applyAdjustment({ target, direction: "fund", amount, reason }))
      .catch((error) => { setMessage({ type: "danger", text: error.message }); return false; });
  };
  return { submitAdjustment, fundAvailable };
};

const useAllocationLifecycle = ({ closeTarget, closeReuseNeeds, setCloseTarget, setCloseReuseNeeds, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation, notify, onReleased }) => {
  const closeEnvelope = async () => {
    if (!closeTarget) return;
    setCloseState({ status: "submitting", error: null });
    try {
      const { runCloseAllocation } = await loadAllocationActionRunners();
      await runCloseAllocation({ closeTarget, closeReuseNeeds, setCloseTarget, setCloseReuseNeeds, setCloseState, onReleased, notify, refreshAfterMutation });
    } catch (error) { setCloseState({ status: "error", error }); }
  };
  const openRuleLifecycle = async (item) => {
    setArchiveState({ status: "submitting", error: null });
    try {
      const { runPreviewAllocationLifecycle } = await loadAllocationActionRunners();
      await runPreviewAllocationLifecycle({ item, setArchiveTarget, setArchiveState, notify });
    } catch (error) { setArchiveState({ status: "error", error }); }
  };
  const applyRuleLifecycle = async (reason, confirmation) => {
    if (!archiveTarget) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      const { runApplyAllocationLifecycle } = await loadAllocationActionRunners();
      await runApplyAllocationLifecycle({ archiveTarget, reason, confirmation, setArchiveTarget, setArchiveState, notify, refreshAfterMutation });
    } catch (error) { setArchiveState({ status: "error", error }); }
  };
  const reverseMovement = async (reason) => {
    if (!reverseTarget) return;
    setReverseState({ status: "submitting", error: null });
    try {
      const { runReverseAllocationMovement } = await loadAllocationActionRunners();
      await runReverseAllocationMovement({ reverseTarget, reason, setReverseTarget, setReverseState, notify, refreshAfterMutation });
    } catch (error) { setReverseState({ status: "error", error }); }
  };
  return { closeEnvelope, openRuleLifecycle, applyRuleLifecycle, reverseMovement };
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

const nextAllocationPeriodKey = (item) => {
  const end = new Date(`${item?.period_end || ""}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return "";
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 7);
};

const allocationClosePlanning = (target, budgets) => {
  if (!target) return { needsCount: 0, canReuseNeeds: false };
  const needsCount = linkedBudgetsForEnvelope(budgets, target).length;
  return {
    needsCount,
    canReuseNeeds: needsCount > 0 && target.period_start?.slice(0, 7) !== nextAllocationPeriodKey(target),
  };
};

const canAdjustAllocation = (item) => Boolean(item?.can_adjust);

const isAllocationAdministrator = (user) => user?.role === "owner";
const allocationUsersStatus = (administratorMode, usersResource) => administratorMode ? usersResource.status : "ready";
const allocationDetailData = (item, budgets, recurringItems) => {
  if (!item) return { linkedBudgets: [], relatedRecurring: [], canManage: false };
  return {
    linkedBudgets: linkedBudgetsForEnvelope(budgets, item),
    relatedRecurring: relatedRecurringForEnvelope(recurringItems, budgets, item),
    canManage: Boolean(item.can_manage_needs),
  };
};
const hasAllocationSecondaryContent = (detailItem, view, actionTarget) => !detailItem && Boolean(view.historicalItems.length || view.recentMovements.length || actionTarget);
const activeAllocationAccounts = (bootstrap, overview) => {
  const balanceLookup = new Map((overview?.accountBalances || []).map((item) => [item.account_id, item]));
  return (bootstrap?.accounts || []).filter((item) => item.status === "active")
    .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) }))
    .filter((item) => item.can_transact !== false && item.account_type !== "investment");
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

const useAllocationViewData = ({ resource, budgetResource, recurringResource, bootstrap, overview, usersResource, allocationFilter, move, administratorMode, allocationActor }) => {
  const accounts = activeAllocationAccounts(bootstrap, overview);
  const activeUsers = activeAllocationUsers(usersResource, allocationActor, administratorMode);
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const budgets = useMemo(() => budgetResource.data?.items || [], [budgetResource.data?.items]);
  const recurringItems = useMemo(() => recurringResource.data?.items || [], [recurringResource.data?.items]);
  const expenseCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const unlinkedBudgets = useMemo(() => budgets.filter((budget) => !budget.envelope_rule_id), [budgets]);
  const historicalItems = useMemo(() => items.filter((item) => item.status !== "active"), [items]);
  const filteredActiveItems = useMemo(() => filterActiveAllocations(activeItems, allocationFilter, allocationActor), [activeItems, allocationActor, allocationFilter]);
  const movableItems = useMemo(() => activeItems.filter((item) => item.can_move && item.source_account_id), [activeItems]);
  const lookup = useMemo(() => Object.fromEntries(activeItems.map((item) => [item.envelope_period_id, item])), [activeItems]);
  const selectedSourceEnvelope = lookup[move.fromEnvelopePeriodId] || null;
  return {
    accounts, activeUsers, items, activeItems, budgets, recurringItems, expenseCategories, unlinkedBudgets, historicalItems,
    filteredActiveItems, movableItems, lookup, selectedSourceEnvelope, recentMovements: resource.data?.recentMovements || [],
    destinations: allocationMoveDestinations({ movableItems, selectedSourceEnvelope, sourceId: move.fromEnvelopePeriodId, administratorMode }),
    hasUnboundAllocation: activeItems.some((item) => !item.source_account_id),
  };
};

const loadAllocationAttentionNavigation = () => import("./allocationAttentionNavigation.js");

const useAllocationAttentionNavigation = ({ resourceStatus, budgetStatus, attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, activeItems, budgets, consumeAttention, setDetailRuleId, setLegacyBudgetAttention, openFunding }) => {
  useEffect(() => {
    if (resourceStatus !== "ready" || budgetStatus === "loading") return undefined;
    if (!attentionEnvelopeId && !attentionBudgetId && attentionAction !== "fund") return undefined;
    let disposed = false;
    let cleanup;
    const completeAttention = () => consumeAttention();
    void loadAllocationAttentionNavigation().then(({ runAllocationAttentionNavigation }) => {
      if (disposed) return;
      cleanup = runAllocationAttentionNavigation({
        attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, activeItems, budgets,
        consumeAttention: completeAttention, setDetailRuleId, setLegacyBudgetAttention, openFunding,
      });
    }).catch(() => {
      if (!disposed) completeAttention();
    });
    return () => { disposed = true; cleanup?.(); };
  }, [activeItems, attentionAction, attentionBudgetId, attentionEnvelopeId, attentionSuggestedAmount, budgetStatus, budgets, consumeAttention, openFunding, resourceStatus, setDetailRuleId, setLegacyBudgetAttention]);
};

const AllocationMainContent = ({ detailItem, detailProps, overviewProps }) => {
  if (detailItem) return <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat detail Alokasi Dana…" />}><AllocationPlanningDetail item={detailItem} {...detailProps} /></Suspense>;
  return <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat Alokasi Dana…" />}><AllocationOverviewLayer {...overviewProps} /></Suspense>;
};

const AllocationResourceState = ({ resource, children }) => {
  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat Alokasi Dana…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return children;
};

const AllocationHeading = ({ embedded }) => embedded
  ? <div className={allocationClass("allocation-embedded-header")}><div><h2>Alokasi Dana</h2><p>Pisahkan uang berdasarkan tujuan, lalu atur kebutuhan di dalamnya.</p></div></div>
  : <PageHeader title="Alokasi Dana" description="Pisahkan uang berdasarkan tujuan, lalu atur kebutuhan di dalamnya." help="Alokasi Dana mengelompokkan uang berdasarkan tujuan. Kebutuhan memakai kategori dan nominal rencana agar transaksi serta laporan tetap konsisten." />;


const allocationDetailCanAdjust = (detailItem) => detailItem ? canAdjustAllocation(detailItem) : false;

const allocationActorFor = (bootstrap, user) => bootstrap?.user || user;

const allocationAttentionData = (attention) => ({
  action: String(attention?.attentionAction || ""),
  envelopeId: String(attention?.attentionEnvelopeId || ""),
  budgetId: String(attention?.attentionBudgetId || ""),
  suggestedAmount: Number(attention?.attentionSuggestedAmount || 0),
});

const allocationFundingInitialState = (fundingIntent) => ({
  sourceAccountId: fundingIntent?.sourceAccountId || "",
  envelopePeriodId: fundingIntent?.envelopePeriodId || "",
  suggestedAmount: fundingIntent?.suggestedAmount || 0,
});

const allocationHasActiveGoal = (overview) => (overview?.goals || []).some((goal) => goal.status === "active");

const allocationDetailCanMove = ({ detailItem, movableItems, administratorMode }) => {
  if (!detailItem?.can_move) return false;
  return allocationMoveDestinations({
    movableItems,
    selectedSourceEnvelope: detailItem,
    sourceId: detailItem.envelope_period_id,
    administratorMode,
  }).length > 0;
};

const ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS = ["create-allocation", "add-need", "choose-need-allocation"];
const loadAllocationDashboardWorkflow = () => import("./allocationDashboardWorkflow.js");

const useAllocationDashboardCreateWorkflow = ({ canCreate, location, navigate, notify, resourceStatus, activeItems, setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId }) => {
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    if (resourceStatus !== "ready" || !ALLOCATION_DASHBOARD_WORKFLOW_ACTIONS.includes(workflowAction)) return undefined;
    let disposed = false;
    void loadAllocationDashboardWorkflow().then(({ runAllocationDashboardWorkflow }) => {
      if (disposed) return;
      runAllocationDashboardWorkflow({
        workflowAction, envelopeRuleId: String(location.state?.envelopeRuleId || ""), canCreate, activeItems,
        setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId, notify,
      });
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
    }).catch(() => {
      if (disposed) return;
      notify({ message: "Aksi Alokasi Dana belum dapat dimuat. Coba lagi.", tone: "warning", dedupeKey: "allocation:workflow-load-failed" });
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
    });
    return () => { disposed = true; };
  }, [activeItems, canCreate, location, navigate, notify, resourceStatus, setAllocationFilter, setCreateOpen, setDetailAction, setDetailRuleId, setLegacyBudgetAttention, setMessage]);
};

const AllocationsWorkspace = ({ embedded = false }) => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const period = currentMonthInJakarta();
  const resource = useApiResource("envelopes.list", { period });
  const budgetResource = useApiResource("budgets.list", { period });
  const recurringResource = useApiResource("recurring.list", { period });
  const { refreshOverview, invalidate, bootstrap, overview } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const administratorMode = isAllocationAdministrator(user);
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
  const [detailAction, setDetailAction] = useState("");
  const [legacyBudgetAttention, setLegacyBudgetAttention] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeReuseNeeds, setCloseReuseNeeds] = useState(false);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const [releasedFunds, setReleasedFunds] = useState(null);
  const [fundingIntent, setFundingIntent] = useState(null);
  const [fundingError, setFundingError] = useState(null);
  const allocationActor = allocationActorFor(bootstrap, user);
  const view = useAllocationViewData({ resource, budgetResource, recurringResource, bootstrap, overview, usersResource, allocationFilter, move, administratorMode, allocationActor });
  const canCreate = view.accounts.length > 0;
  const detailItem = view.activeItems.find((item) => item.envelope_rule_id === detailRuleId) || null;
  const createMove = useAllocationCreateMove({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup: view.lookup, notify, setMessage, onCreated: (created) => {
    setCreateOpen(false);
    const createdRuleId = String(created?.rule?.envelope_rule_id || "");
    if (createdRuleId) { setDetailRuleId(createdRuleId); setDetailAction("add-need"); }
  }, onMoved: () => setMoveOpen(false) });
  const adjustment = useAllocationAdjustment({ adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, adjustMutation, refreshAfterMutation: createMove.refreshAfterMutation, notify, setMessage, onReleased: setReleasedFunds });
  const lifecycle = useAllocationLifecycle({ closeTarget, closeReuseNeeds, setCloseTarget, setCloseReuseNeeds, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation: createMove.refreshAfterMutation, notify, onReleased: setReleasedFunds });
  const attentionData = allocationAttentionData(attention);
  const { action: attentionAction, envelopeId: attentionEnvelopeId, budgetId: attentionBudgetId, suggestedAmount: attentionSuggestedAmount } = attentionData;
  const refreshBudgetPlanning = async () => { invalidate(["budgets.list", "recurring.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([budgetResource.reload(), recurringResource.reload(), resource.reload(), refreshOverview()]); };
  const detail = allocationDetailData(detailItem, view.budgets, view.recurringItems);
  const closePlanning = allocationClosePlanning(closeTarget, view.budgets);
  const usersStatus = allocationUsersStatus(administratorMode, usersResource);
  const showSecondaryLayer = hasAllocationSecondaryContent(detailItem, view, actionTarget);
  const fundingInitialState = allocationFundingInitialState(fundingIntent);
  const detailCanMove = allocationDetailCanMove({ detailItem, movableItems: view.movableItems, administratorMode });
  const hasActiveGoal = allocationHasActiveGoal(overview);

  const openFunding = useCallback(({ sourceAccountId = "", envelopePeriodId = "", suggestedAmount = 0 } = {}) => { setFundingError(null); setFundingIntent({ sourceAccountId, envelopePeriodId, suggestedAmount: Number(suggestedAmount || 0) }); }, []);
  useAllocationAttentionNavigation({ resourceStatus: resource.status, budgetStatus: budgetResource.status, attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, activeItems: view.activeItems, budgets: view.budgets, consumeAttention, setDetailRuleId, setLegacyBudgetAttention, openFunding });
  useEffect(() => { if (detailRuleId && resource.status === "ready" && !detailItem) setDetailRuleId(""); }, [detailItem, detailRuleId, resource.status]);
  useAllocationDashboardCreateWorkflow({ canCreate, location, navigate, notify, resourceStatus: resource.status, activeItems: view.activeItems, setMessage, setCreateOpen, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId });
  useEffect(() => {
    if (resource.status !== "ready" || location.state?.workflowAction !== "fund") return;
    openFunding({ sourceAccountId: String(location.state.sourceAccountId || ""), suggestedAmount: Number(location.state.suggestedAmount || 0) });
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate, openFunding, resource.status]);


  const closeCreate = () => { if (!createMutation.busy) setCreateOpen(false); };
  const closeMove = () => { if (!moveMutation.busy) setMoveOpen(false); };
  const closeAdjust = () => { if (!adjustMutation.busy) setAdjustTarget(null); };
  const closeFunding = () => { if (!adjustMutation.busy) { setFundingIntent(null); setFundingError(null); } };
  const submitFunding = async ({ target, amount, reason }) => { const ok = await adjustment.fundAvailable({ target, amount, reason }); if (ok) closeFunding(); else setFundingError(new Error("Dana belum berhasil ditambahkan. Periksa pesan lalu coba lagi.")); };
  const openAdjust = (item, direction = "fund", suggestedAmount = "") => { setMessage(null); setAdjustForm({ direction, amount: suggestedAmount ? String(suggestedAmount) : "", reason: suggestedAmount ? "Menyesuaikan dana dengan total Kebutuhan" : "" }); setAdjustTarget(item); };
  const openMoveForItem = (item) => {
    setMessage(null);
    setMove({ fromEnvelopePeriodId: item.envelope_period_id, toEnvelopePeriodId: "", amount: "", reason: "" });
    setMoveOpen(true);
  };
  const startClosePeriod = (item) => { setActionTarget(null); setCloseReuseNeeds(false); setCloseTarget(item); setCloseState({ status: "idle", error: null }); };
  const startLifecycle = (item) => { setActionTarget(null); lifecycle.openRuleLifecycle(item); };
  const openReminder = (item) => setReminderTarget({ entityType: "envelope_period", entityId: item.envelope_period_id, name: item.name, suggestedDate: item.period_end });
  const openBudgetReminder = (budget) => setReminderTarget({ entityType: "budget", entityId: budget.budget_id, name: budget.name || "Kebutuhan" });
  const openDetail = (item, action = "") => { setLegacyBudgetAttention(false); setDetailAction(action); setDetailRuleId(item.envelope_rule_id); window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 })); };
  const closeDetail = () => { setDetailRuleId(""); setDetailAction(""); window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 })); };
  const modalProps = { closeTarget, setCloseTarget, closeState, closeReuseNeeds, setCloseReuseNeeds, closeNeedsCount: closePlanning.needsCount, closeCanReuseNeeds: closePlanning.canReuseNeeds, archiveTarget, setArchiveTarget, archiveState, reverseTarget, setReverseTarget, reverseState, ...lifecycle };

  return <AllocationResourceState resource={resource}><div className={allocationClass("page-stack allocations-page")}>
    <AllocationNoticesLayer resource={resource} budgetResource={budgetResource} recurringResource={recurringResource} administratorMode={administratorMode} usersResource={usersResource} attentionEnvelopeId={attentionEnvelopeId} legacyBudgetAttention={legacyBudgetAttention} unlinkedBudgets={view.unlinkedBudgets} hasUnboundAllocation={view.hasUnboundAllocation} releasedFunds={releasedFunds} hasActiveGoal={hasActiveGoal} onDismissReleasedFunds={() => setReleasedFunds(null)} />
    <AllocationHeading embedded={embedded} />
    <AllocationMainContent detailItem={detailItem} detailProps={{ ...detail, budgets: view.budgets, canLifecycle: administratorMode, period, notify, refreshBudgetPlanning, expenseCategories: view.expenseCategories, accounts: view.accounts, users: view.activeUsers, usersStatus, initialAction: detailAction, onInitialActionConsumed: () => setDetailAction(""), onBack: closeDetail, onBudgetReminder: openBudgetReminder, onAllocationReminder: openReminder, onOpenAllocationActions: setActionTarget, canAdjustAllocation: allocationDetailCanAdjust(detailItem), onAdjustAllocation: (item, amount) => openAdjust(item, "fund", amount), canMoveAllocation: detailCanMove, onMoveAllocation: openMoveForItem }} overviewProps={{ activeItems: view.activeItems, filteredActiveItems: view.filteredActiveItems, allocationFilter, setAllocationFilter, onAddNeed: (item) => openDetail(item, "add-need"), attentionEnvelopeId, budgets: view.budgets, recurringItems: view.recurringItems, onOpenDetail: openDetail, canCreate, openCreate: () => { setMessage(null); setCreateOpen(true); }, linkedBudgetsForItem: linkedBudgetsForEnvelope, relatedRecurringForItem: relatedRecurringForEnvelope }} />
    {(showSecondaryLayer || fundingIntent || reminderTarget || createOpen || moveOpen || adjustTarget || closeTarget || archiveTarget || reverseTarget) ? <Suspense fallback={<LazyActionFallback surface="modal" title="Alokasi Dana" label="Menyiapkan aksi Alokasi Dana..." />}><AllocationOverlayLayer dialogsOpen={Boolean(createOpen || moveOpen || adjustTarget || closeTarget || archiveTarget || reverseTarget)} dialogProps={{ createOpen, closeCreate, createForm, setCreateForm, accounts: view.accounts, activeUsers: view.activeUsers, usersStatus, createEnvelope: createMove.createEnvelope, createMutation, message, moveOpen, closeMove, move, setMove, movableItems: view.movableItems, destinations: view.destinations, submitMove: createMove.submitMove, moveMutation, adjustTarget, closeAdjust, adjustForm, setAdjustForm, submitAdjustment: adjustment.submitAdjustment, adjustMutation, modalProps }} showSecondaryLayer={showSecondaryLayer} secondaryProps={{ historicalItems: view.historicalItems, recentMovements: view.recentMovements, actionTarget, onCloseAction: () => setActionTarget(null), onClosePeriod: startClosePeriod, onLifecycle: startLifecycle, setReverseTarget, setReverseState }} fundingIntent={fundingIntent} fundingProps={{ accounts: view.accounts, items: view.activeItems.filter((item) => canAdjustAllocation(item) && item.source_account_id), initialSourceAccountId: fundingInitialState.sourceAccountId, initialEnvelopePeriodId: fundingInitialState.envelopePeriodId, suggestedAmount: fundingInitialState.suggestedAmount, busy: adjustMutation.busy, error: fundingError, onClose: closeFunding, onSubmit: submitFunding }} reminderTarget={reminderTarget} onCloseReminder={() => setReminderTarget(null)} /></Suspense> : null}
  </div></AllocationResourceState>;
};

export default AllocationsWorkspace;
