import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
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
import { createAllocationNeedDraft } from "./allocationNeedDraft.js";
import { fundingAccountsForItems } from "./allocationFundingModel.js";
import { useAllocationCommitmentPlanNavigation, useAllocationDashboardCreateWorkflow, useAllocationFundingNavigation } from "./allocationWorkflowNavigation.js";
import AllocationNoticesLayer from "./AllocationNoticesLayer.jsx";
import { scrollWindowToWithMotionPreference } from "../../shared/motion.js";
import { buildPlanningRelationshipResolver, planningBudgetsForAllocation } from "../../shared/workflows/planningRelationships.js";
import { useAllocationDetailRoute, useAllocationWorkspaceUiState } from "./allocationWorkspaceUiState.js";
const AllocationOverlayLayer = lazy(() => import("./AllocationOverlayLayer.jsx"));
const AllocationOverviewLayer = lazy(() => import("./AllocationOverviewLayer.jsx"));
const AllocationPlanningDetail = lazy(() => import("./AllocationPlanningDetail.jsx"));
const loadAllocationActionRunners = () => import("./allocationActionRunners.js");

const defaultCreateForm = (sourceAccount = null) => {
  const { start, end } = currentMonthBoundsInJakarta();
  return {
    name: "",
    decoration_key: "auto",
    source_account_id: sourceAccount?.account_id || "",
    assignee_user_id: sourceAccount?.owner_scope === "personal" ? sourceAccount.owner_user_id || "" : "",
    period_type: "monthly",
    period_start: start,
    period_end: end,
    rollover_policy: "unallocated",
    overspend_policy: "confirm",
  };
};

const defaultCreateNeeds = () => [createAllocationNeedDraft()];

const useAllocationCreateMove = ({ resource, commitmentResource, refreshOverview, invalidate, createMutation, moveMutation, createForm, createNeeds, setCreateForm, resetCreateNeeds, move, setMove, lookup, notify, setMessage, onCreated, onMoved, period }) => {
  const refreshAfterMutation = async () => { invalidate(["accounts.list", "envelopes.list", "commitments.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([resource.reload(), commitmentResource?.reload?.(), refreshOverview()]); };
  const createEnvelope = (event) => {
    event.preventDefault(); setMessage(null);
    return createMutation.run(async () => {
      const { runCreateAllocation } = await loadAllocationActionRunners();
      await runCreateAllocation({ createForm, createNeeds, resetForm: defaultCreateForm, resetNeeds: resetCreateNeeds, setCreateForm, onCreated, notify, refreshAfterMutation, period });
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
      .then(() => ({ ok: true, error: null }))
      .catch((error) => { setMessage({ type: "danger", text: error.message }); return { ok: false, error }; });
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

const linkedBudgetsForEnvelope = (budgets, item) => planningBudgetsForAllocation(budgets, item);

const relatedRecurringForEnvelope = (recurringItems, budgets, item) => {
  const resolver = buildPlanningRelationshipResolver({ allocations: [item], budgets });
  return (recurringItems || []).filter((entry) => entry.kind === "expense" && resolver.allocationForItem(entry)?.envelope_rule_id === item.envelope_rule_id);
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

const sameSourceAccount = (left, right) => Boolean(left?.source_account_id) && left.source_account_id === right?.source_account_id;

const allocationMoveDestinations = ({ movableItems, selectedSourceEnvelope, sourceId, administratorMode }) => filterByOwnership(movableItems, selectedSourceEnvelope)
  .filter((item) => item.envelope_period_id !== sourceId)
  .filter((item) => sameSourceAccount(item, selectedSourceEnvelope))
  .filter((item) => administratorMode || hasSameAssignee(item, selectedSourceEnvelope));

const useAllocationViewData = ({ resource, budgetResource, recurringResource, commitmentResource, bootstrap, overview, usersResource, move, administratorMode, allocationActor }) => {
  const accounts = activeAllocationAccounts(bootstrap, overview);
  const activeUsers = activeAllocationUsers(usersResource, allocationActor, administratorMode);
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const budgets = useMemo(() => budgetResource.data?.items || [], [budgetResource.data?.items]);
  const recurringItems = useMemo(() => recurringResource.data?.items || [], [recurringResource.data?.items]);
  const commitments = useMemo(() => commitmentResource.data?.items || [], [commitmentResource.data?.items]);
  const expenseCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const unlinkedBudgets = useMemo(() => budgets.filter((budget) => !budget.envelope_rule_id), [budgets]);
  const historicalItems = useMemo(() => items.filter((item) => item.status !== "active"), [items]);
  const movableItems = useMemo(() => activeItems.filter((item) => item.can_move && item.source_account_id), [activeItems]);
  const lookup = useMemo(() => Object.fromEntries(activeItems.map((item) => [item.envelope_period_id, item])), [activeItems]);
  const selectedSourceEnvelope = lookup[move.fromEnvelopePeriodId] || null;
  return {
    accounts, activeUsers, items, activeItems, budgets, recurringItems, commitments, expenseCategories, unlinkedBudgets, historicalItems,
    movableItems, lookup, selectedSourceEnvelope, recentMovements: resource.data?.recentMovements || [],
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

const AllocationResourceState = ({ resources, children }) => {
  const pending = resources.some((resource) => resource.status === "loading");
  const failed = resources.find((resource) => resource.status === "error") || null;
  if (pending) return <NativePageSkeleton kind="planning" label="Memuat Atur Dana…" />;
  if (failed) return <ErrorState error={failed.error} onRetry={() => Promise.allSettled(resources.map((resource) => resource.reload()))} />;
  return children;
};

const AllocationHeading = ({ embedded }) => embedded
  ? null
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
  lockSelection: fundingIntent?.lockSelection === true,
  chooseDestination: fundingIntent?.chooseDestination === true,
});

const allocationHasActiveGoal = (overview) => (overview?.goals || []).some((goal) => goal.status === "active");

const hasFundableAllocation = (accounts, items) => fundingAccountsForItems(
  accounts,
  items.filter((item) => item.can_adjust && item.source_account_id),
).length > 0;

const resolveFundingResult = (result, closeFunding, setFundingError) => {
  if (result.ok) closeFunding();
  else setFundingError(result.error || new Error("Dana belum berhasil ditambahkan. Periksa pesan lalu coba lagi."));
};

const planningCreateNavigation = (navigate) => ({
  openRecurringCreate: () => navigate("/perencanaan/jadwal", { state: { workflowSource: "planning-overview", workflowAction: "create-recurring" } }),
  openCommitmentCreate: (commitmentType) => navigate("/perencanaan/komitmen", { state: { workflowSource: "planning-overview", workflowAction: "create-commitment", commitmentType } }),
});

const allocationDetailCanMove = ({ detailItem, movableItems, administratorMode }) => {
  if (!detailItem?.can_move) return false;
  return allocationMoveDestinations({
    movableItems,
    selectedSourceEnvelope: detailItem,
    sourceId: detailItem.envelope_period_id,
    administratorMode,
  }).length > 0;
};

const useAllocationWorkspaceNavigationEffects = ({ resource, budgetResource, location, navigate, notify, view, canCreate, detailItem, detailRuleId, setDetailRuleId, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, consumeAttention, openFunding, openCreate }) => {
  useAllocationAttentionNavigation({ resourceStatus: resource.status, budgetStatus: budgetResource.status, attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, activeItems: view.activeItems, budgets: view.budgets, consumeAttention, setDetailRuleId, setLegacyBudgetAttention, openFunding });
  useEffect(() => { if (detailRuleId && resource.status === "ready" && !detailItem) setDetailRuleId("", { replace: true }); }, [detailItem, detailRuleId, resource.status, setDetailRuleId]);
  useAllocationDashboardCreateWorkflow({ canCreate, location, navigate, notify, resourceStatus: resource.status, activeItems: view.activeItems, openCreate, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, setDetailRuleId });
  useAllocationCommitmentPlanNavigation({ resourceStatus: resource.status, budgetStatus: budgetResource.status, location, navigate, notify, activeItems: view.activeItems, budgets: view.budgets, setLegacyBudgetAttention, setDetailAction, setDetailRuleId });
  useAllocationFundingNavigation({ resourceStatus: resource.status, location, navigate, openFunding });
};


const hasAllocationOverlay = (values) => values.some(Boolean);

const AllocationWorkspaceShell = ({ resources, noticesProps, embedded, detailItem, detailProps, overviewProps, showOverlay, overlayProps }) => <AllocationResourceState resources={resources}><div className={allocationClass("page-stack allocations-page")}>
  <AllocationNoticesLayer {...noticesProps} />
  <AllocationHeading embedded={embedded} />
  <AllocationMainContent detailItem={detailItem} detailProps={detailProps} overviewProps={overviewProps} />
  {showOverlay ? <Suspense fallback={<LazyActionFallback surface="modal" title="Alokasi Dana" label="Menyiapkan aksi Alokasi Dana..." />}><AllocationOverlayLayer {...overlayProps} /></Suspense> : null}
</div></AllocationResourceState>;

// Workspace orchestrates route state, resources, and modal controllers in one canonical owner.
const AllocationsWorkspace = ({ embedded = false }) => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const period = currentMonthInJakarta();
  const resource = useApiResource("envelopes.list", { period });
  const budgetResource = useApiResource("budgets.list", { period });
  const recurringResource = useApiResource("recurring.list", { period });
  const commitmentResource = useApiResource("commitments.list", {});
  const { refreshOverview, invalidate, bootstrap, overview } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const administratorMode = isAllocationAdministrator(user);
  const usersResource = useApiResource("users.list", {}, { enabled: administratorMode });
  const createMutation = useGuardedMutation();
  const moveMutation = useGuardedMutation();
  const adjustMutation = useGuardedMutation();
  const { move, setMove, createForm, setCreateForm, createNeeds, setCreateNeeds, createOpen, setCreateOpen, moveOpen, setMoveOpen, adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, message, setMessage, allocationFilter, setAllocationFilter, detailAction, setDetailAction, legacyBudgetAttention, setLegacyBudgetAttention, actionTarget, setActionTarget, reminderTarget, setReminderTarget, closeTarget, setCloseTarget, closeReuseNeeds, setCloseReuseNeeds, closeState, setCloseState, archiveTarget, setArchiveTarget, archiveState, setArchiveState, reverseTarget, setReverseTarget, reverseState, setReverseState, releasedFunds, setReleasedFunds, fundingIntent, setFundingIntent, fundingError, setFundingError } = useAllocationWorkspaceUiState({ createFormFactory: defaultCreateForm, createNeedsFactory: defaultCreateNeeds });
  const { detailRuleId, setDetailRuleId } = useAllocationDetailRoute(location, navigate);
  const allocationActor = allocationActorFor(bootstrap, user);
  const view = useAllocationViewData({ resource, budgetResource, recurringResource, commitmentResource, bootstrap, overview, usersResource, move, administratorMode, allocationActor });
  const canCreate = view.accounts.length > 0;
  const canFund = hasFundableAllocation(view.accounts, view.activeItems);
  const detailItem = view.activeItems.find((item) => item.envelope_rule_id === detailRuleId) || null;
  const createMove = useAllocationCreateMove({ resource, commitmentResource, refreshOverview, invalidate, createMutation, moveMutation, createForm, createNeeds, setCreateForm, resetCreateNeeds: () => setCreateNeeds(defaultCreateNeeds()), move, setMove, lookup: view.lookup, notify, setMessage, period, onCreated: (created) => {
    setCreateOpen(false);
    const createdRuleId = String(created?.rule?.envelope_rule_id || "");
    if (createdRuleId) setDetailRuleId(createdRuleId);
  }, onMoved: () => setMoveOpen(false) });
  const adjustment = useAllocationAdjustment({ adjustTarget, setAdjustTarget, adjustForm, setAdjustForm, adjustMutation, refreshAfterMutation: createMove.refreshAfterMutation, notify, setMessage, onReleased: setReleasedFunds });
  const lifecycle = useAllocationLifecycle({ closeTarget, closeReuseNeeds, setCloseTarget, setCloseReuseNeeds, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation: createMove.refreshAfterMutation, notify, onReleased: setReleasedFunds });
  const attentionData = allocationAttentionData(attention);
  const { action: attentionAction, envelopeId: attentionEnvelopeId, budgetId: attentionBudgetId, suggestedAmount: attentionSuggestedAmount } = attentionData;
  const workflowResult = { commitmentId: String(location.state?.planningCommitmentId || ""), recurringRuleId: String(location.state?.planningRecurringRuleId || "") };
  const refreshBudgetPlanning = async () => { invalidate(["budgets.list", "recurring.list", "commitments.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState"]); await Promise.allSettled([budgetResource.reload(), recurringResource.reload(), commitmentResource.reload(), resource.reload(), refreshOverview()]); };
  const detail = allocationDetailData(detailItem, view.budgets, view.recurringItems);
  const closePlanning = allocationClosePlanning(closeTarget, view.budgets);
  const usersStatus = allocationUsersStatus(administratorMode, usersResource);
  const showSecondaryLayer = hasAllocationSecondaryContent(detailItem, view, actionTarget);
  const fundingInitialState = allocationFundingInitialState(fundingIntent);
  const detailCanMove = allocationDetailCanMove({ detailItem, movableItems: view.movableItems, administratorMode });
  const hasActiveGoal = allocationHasActiveGoal(overview);

  const openCreate = useCallback(({ sourceAccountId = "" } = {}) => {
    const sourceAccount = view.accounts.find((item) => item.account_id === sourceAccountId) || null;
    setMessage(null);
    setCreateForm(defaultCreateForm(sourceAccount));
    setCreateNeeds(defaultCreateNeeds());
    setCreateOpen(true);
  }, [setCreateForm, setCreateNeeds, setCreateOpen, setMessage, view.accounts]);
  const openFunding = useCallback(({ sourceAccountId = "", envelopePeriodId = "", suggestedAmount = 0, lockSelection = false, chooseDestination = false } = {}) => {
    setFundingError(null);
    setFundingIntent({ sourceAccountId, envelopePeriodId, suggestedAmount: Number(suggestedAmount || 0), lockSelection: lockSelection === true, chooseDestination: chooseDestination === true });
  }, [setFundingError, setFundingIntent]);
  const createFromFunding = useCallback(({ sourceAccountId = "" } = {}) => {
    setFundingIntent(null);
    setFundingError(null);
    openCreate({ sourceAccountId });
  }, [openCreate, setFundingError, setFundingIntent]);
  useAllocationWorkspaceNavigationEffects({ resource, budgetResource, location, navigate, notify, view, canCreate, detailItem, detailRuleId, setDetailRuleId, setAllocationFilter, setLegacyBudgetAttention, setDetailAction, attentionAction, attentionEnvelopeId, attentionBudgetId, attentionSuggestedAmount, consumeAttention, openFunding, openCreate });

  const closeCreate = () => { if (!createMutation.busy && !createMutation.outcomeUnknown) setCreateOpen(false); };
  const closeMove = () => { if (!moveMutation.busy && !moveMutation.outcomeUnknown) setMoveOpen(false); };
  const closeAdjust = () => { if (!adjustMutation.busy && !adjustMutation.outcomeUnknown) setAdjustTarget(null); };
  const closeFunding = () => { if (!adjustMutation.busy && !adjustMutation.outcomeUnknown) { setFundingIntent(null); setFundingError(null); } };
  const submitFunding = async ({ target, amount, reason }) => {
    const result = await adjustment.fundAvailable({ target, amount, reason });
    resolveFundingResult(result, closeFunding, setFundingError);
  };
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
  const openRecurringDetail = (item) => navigate("/perencanaan/jadwal", { state: { workflowSource: "planning-overview", workflowAction: "view-recurring", occurrenceId: item.occurrence_id || "", period: String(item.due_date || "").slice(0, 7) } });
  const openCommitmentDetail = (item) => navigate("/perencanaan/komitmen", { state: { planningCommitmentId: item.commitment_id || "" } });
  const { openRecurringCreate, openCommitmentCreate } = planningCreateNavigation(navigate);
  const closeDetail = () => { setDetailRuleId("", { replace: true }); setDetailAction(""); window.requestAnimationFrame(() => scrollWindowToWithMotionPreference({ top: 0 })); };
  const modalProps = { closeTarget, setCloseTarget, closeState, closeReuseNeeds, setCloseReuseNeeds, closeNeedsCount: closePlanning.needsCount, closeCanReuseNeeds: closePlanning.canReuseNeeds, archiveTarget, setArchiveTarget, archiveState, reverseTarget, setReverseTarget, reverseState, ...lifecycle };

  const noticesProps = { resource, budgetResource, recurringResource, commitmentResource, administratorMode, usersResource, legacyBudgetAttention, unlinkedBudgets: view.unlinkedBudgets, hasUnboundAllocation: view.hasUnboundAllocation, releasedFunds, hasActiveGoal, onDismissReleasedFunds: () => setReleasedFunds(null) };
  const detailProps = { ...detail, budgets: view.budgets, canLifecycle: administratorMode, period, notify, refreshBudgetPlanning, expenseCategories: view.expenseCategories, accounts: view.accounts, users: view.activeUsers, usersStatus, initialAction: detailAction, onInitialActionConsumed: () => setDetailAction(""), onBack: closeDetail, onBudgetReminder: openBudgetReminder, onAllocationReminder: openReminder, onOpenAllocationActions: setActionTarget, canAdjustAllocation: allocationDetailCanAdjust(detailItem), onAdjustAllocation: (item, amount) => openAdjust(item, "fund", amount), canMoveAllocation: detailCanMove, onMoveAllocation: openMoveForItem };
  const overviewProps = { activeItems: view.activeItems, allocationFilter, setAllocationFilter, attentionEnvelopeId, budgets: view.budgets, recurringItems: view.recurringItems, commitments: view.commitments, onOpenDetail: openDetail, onOpenRecurringDetail: openRecurringDetail, onOpenCommitmentDetail: openCommitmentDetail, onCreateRecurring: openRecurringCreate, onCreateCommitment: openCommitmentCreate, canCreate, canFund, accounts: view.accounts, actor: allocationActor, onOpenFunding: openFunding, openCreate, workflowResult, onWorkflowResultConsumed: () => navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null }) };
  const dialogsOpen = hasAllocationOverlay([createOpen, moveOpen, adjustTarget, closeTarget, archiveTarget, reverseTarget]);
  const showOverlay = hasAllocationOverlay([showSecondaryLayer, fundingIntent, reminderTarget, dialogsOpen]);
  const overlayProps = { dialogsOpen, dialogProps: { createOpen, closeCreate, createForm, setCreateForm, createNeeds, setCreateNeeds, expenseCategories: view.expenseCategories, accounts: view.accounts, activeUsers: view.activeUsers, usersStatus, createEnvelope: createMove.createEnvelope, createMutation, message, moveOpen, closeMove, move, setMove, movableItems: view.movableItems, destinations: view.destinations, submitMove: createMove.submitMove, moveMutation, adjustTarget, closeAdjust, adjustForm, setAdjustForm, submitAdjustment: adjustment.submitAdjustment, adjustMutation, modalProps }, showSecondaryLayer, secondaryProps: { historicalItems: view.historicalItems, recentMovements: view.recentMovements, actionTarget, onCloseAction: () => setActionTarget(null), onClosePeriod: startClosePeriod, onLifecycle: startLifecycle, setReverseTarget, setReverseState }, fundingIntent, fundingProps: { accounts: view.accounts, items: view.activeItems.filter((item) => canAdjustAllocation(item) && item.source_account_id), initialSourceAccountId: fundingInitialState.sourceAccountId, initialEnvelopePeriodId: fundingInitialState.envelopePeriodId, suggestedAmount: fundingInitialState.suggestedAmount, lockSelection: fundingInitialState.lockSelection, chooseDestination: fundingInitialState.chooseDestination, busy: adjustMutation.busy, retryOnly: adjustMutation.outcomeUnknown, error: fundingError, onClose: closeFunding, onSubmit: submitFunding, onCreateNew: createFromFunding }, reminderTarget, onCloseReminder: () => setReminderTarget(null) };
  return <AllocationWorkspaceShell resources={[resource, budgetResource, recurringResource, commitmentResource]} noticesProps={noticesProps} embedded={embedded} detailItem={detailItem} detailProps={detailProps} overviewProps={overviewProps} showOverlay={showOverlay} overlayProps={overlayProps} />;
};

export default AllocationsWorkspace;
