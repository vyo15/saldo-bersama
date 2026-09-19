import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { assertPositiveRupiah } from "../../domain/money.js";
import {
  archiveGoal as requestArchiveGoal,
  createGoal as requestCreateGoal,
  deleteUnusedGoal as requestDeleteUnusedGoal,
  previewGoalLifecycle,
  updateGoal as requestUpdateGoal,
} from "./goals.api.js";
import { GoalGrid, GoalSummary } from "./components/GoalCards.jsx";

const GoalDialogLayer = lazy(() => import("./components/GoalDialogLayer.jsx"));
const GoalFundingModal = lazy(() => import("./components/GoalFundingModal.jsx"));
const GoalAchievementPostcard = lazy(() => import("./components/GoalAchievementPostcard.jsx"));

const emptyGoalForm = () => ({
  name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", portfolio_id: "", funding_mode: "cash", priority: "normal",
});
const refreshGoalKeys = Object.freeze(["goals.list", "investments.overview", "transactions.list", "accounts.list", "reports.monthly", "dashboard.overview", "app.initialState"]);

const useGoalCreation = ({ resource, investmentResource, refreshOverview, invalidate, notify, onCreated }) => {
  const createMutation = useGuardedMutation();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(emptyGoalForm);
  const [open, setOpen] = useState(false);
  const openCreate = useCallback(() => { setMessage(null); setOpen(true); }, []);
  const closeCreate = useCallback(() => { if (!createMutation.busy) setOpen(false); }, [createMutation.busy]);
  const createGoal = (event) => {
    event.preventDefault();
    setMessage(null);
    if (!form.target_date) return setMessage({ type: "danger", text: "Tanggal target wajib dipilih." });
    if (["cash", "mixed"].includes(form.funding_mode) && !form.account_id) return setMessage({ type: "danger", text: "Pilih rekening tabungan Target." });
    if (form.funding_mode === "investment" && !form.portfolio_id) return setMessage({ type: "danger", text: "Pilih portfolio investasi Target." });
    return createMutation.run(async () => {
      const payload = { ...form, target_amount: assertPositiveRupiah(form.target_amount) };
      if (payload.funding_mode !== "investment") delete payload.portfolio_id;
      const result = await requestCreateGoal(payload, {});
      setForm(emptyGoalForm());
      setOpen(false);
      notify({ message: "Target keuangan berhasil dibuat.", tone: "success", dedupeKey: "goals:create" });
      invalidate(refreshGoalKeys);
      await Promise.allSettled([resource.reload(), investmentResource.reload(), refreshOverview()]);
      onCreated?.(result?.goal || result || null);
      return result;
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { createMutation, message, form, setForm, open, openCreate, closeCreate, createGoal };
};

const useGoalLifecycle = ({ resource, investmentResource, refreshOverview, invalidate, notify }) => {
  const [editGoal, setEditGoal] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusState, setStatusState] = useState({ status: "idle", error: null });
  const refresh = async (keys) => { invalidate(keys); await Promise.allSettled([resource.reload(), investmentResource.reload(), refreshOverview()]); };
  const saveGoal = async (event) => {
    event.preventDefault();
    if (!editGoal) return;
    setEditState({ status: "submitting", error: null });
    try {
      await requestUpdateGoal({ goal_id: editGoal.goal_id, row_version: editGoal.row_version, name: editGoal.name, target_amount: assertPositiveRupiah(editGoal.target_amount), target_date: editGoal.target_date, priority: editGoal.priority || "normal" }, { rowVersion: editGoal.row_version });
      setEditGoal(null);
      setEditState({ status: "idle", error: null });
      notify({ message: "Target berhasil diperbarui.", tone: "success", dedupeKey: "goals:update" });
      await refresh(refreshGoalKeys);
    } catch (error) { setEditState({ status: "error", error }); }
  };
  const openArchive = async (goal) => {
    setArchiveState({ status: "submitting", error: null });
    try {
      const preview = await previewGoalLifecycle({ goal_id: goal.goal_id, row_version: goal.row_version }, { force: true });
      setArchiveTarget({ goal, preview });
      setArchiveState({ status: "idle", error: null });
    } catch (error) {
      setArchiveState({ status: "idle", error: null });
      notify({ message: error.message || "Status target gagal diperiksa.", tone: "danger", dedupeKey: "goals:lifecycle-preview-error" });
    }
  };
  const applyGoalLifecycle = async (reason, confirmation) => {
    if (!archiveTarget) return;
    const { goal, preview } = archiveTarget;
    setArchiveState({ status: "submitting", error: null });
    try {
      if (preview.canDeleteUnused) {
        await requestDeleteUnusedGoal({ goal_id: goal.goal_id, row_version: goal.row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: goal.row_version });
        notify({ message: "Target yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "goals:delete-unused" });
      } else {
        await requestArchiveGoal({ goal_id: goal.goal_id, row_version: goal.row_version, reason }, { rowVersion: goal.row_version });
        notify({ message: "Target berhasil diarsipkan. Riwayat dana dan investasi tetap tersimpan.", tone: "success", dedupeKey: "goals:archive" });
      }
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      await refresh(refreshGoalKeys);
    } catch (error) { setArchiveState({ status: "error", error }); }
  };
  const openStatusChange = (goal, nextStatus) => { setStatusTarget({ goal, nextStatus }); setStatusState({ status: "idle", error: null }); };
  const applyGoalStatus = async () => {
    if (!statusTarget) return;
    const { goal, nextStatus } = statusTarget;
    setStatusState({ status: "submitting", error: null });
    try {
      await requestUpdateGoal({ goal_id: goal.goal_id, row_version: goal.row_version, status: nextStatus }, { rowVersion: goal.row_version });
      setStatusTarget(null);
      setStatusState({ status: "idle", error: null });
      notify({
        message: nextStatus === "completed" ? "Target ditandai selesai. Nilai investasi tetap mengikuti catatan harga pasar." : "Target dibuka kembali dan dapat menerima dana tunai atau investasi.",
        tone: "success",
        dedupeKey: nextStatus === "completed" ? "goals:complete" : "goals:reopen",
      });
      await refresh(refreshGoalKeys);
    } catch (error) { setStatusState({ status: "error", error }); }
  };
  const openEdit = (goal) => { setEditGoal({ ...goal }); setEditState({ status: "idle", error: null }); };
  return { editGoal, setEditGoal, editState, saveGoal, archiveTarget, setArchiveTarget, archiveState, applyGoalLifecycle, statusTarget, setStatusTarget, statusState, applyGoalStatus, openStatusChange, openEdit, openArchive };
};

const goalPageAccounts = (bootstrap, overview) => {
  const balanceLookup = new Map((overview?.accountBalances || []).map((item) => [item.account_id, item]));
  return (bootstrap?.accounts || []).filter((item) => item.status === "active").map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) }));
};


const useGoalRouteWorkflow = ({ location, resourceStatus, canCreate, openCreate, clearWorkflowState, items, openFunding, setFundingPrompt, notify }) => {
  const workflowHandled = useRef("");
  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    const workflowKey = workflowAction ? `${location.key}|${workflowAction}` : "";
    if (resourceStatus !== "ready" || workflowAction !== "create-goal" || workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    clearWorkflowState();
    if (canCreate) openCreate();
    else notify({ message: "Siapkan rekening Bersama atau portfolio investasi Bersama sebelum membuat Target.", tone: "warning", dedupeKey: "goal:create-unavailable" });
  }, [canCreate, clearWorkflowState, location.key, location.state, notify, openCreate, resourceStatus]);

  useEffect(() => {
    const workflowAction = String(location.state?.workflowAction || "");
    const workflowKey = workflowAction ? `${location.key}|${workflowAction}` : "";
    if (resourceStatus !== "ready" || !["goal-fund", "choose-goal-funding"].includes(workflowAction) || workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    const goalId = String(location.state?.goalId || "");
    const intent = { sourceAccountId: String(location.state?.sourceAccountId || ""), suggestedAmount: Number(location.state?.suggestedAmount || 0), manualAmount: location.state?.manualAmount === true };
    clearWorkflowState();
    if (workflowAction === "choose-goal-funding") {
      const active = items.filter((item) => item.status === "active" && (item.can_deposit || item.can_invest));
      if (active.length === 1) openFunding(active[0], intent);
      else if (active.length > 1) setFundingPrompt(intent);
      else notify({ message: "Belum ada Target aktif yang dapat menerima dana.", tone: "warning", dedupeKey: "goal:funding-unavailable" });
      return;
    }
    const goal = items.find((item) => item.goal_id === goalId && item.status === "active");
    if (goal) openFunding(goal, intent);
    else notify({ message: "Target aktif tidak ditemukan atau sudah tidak dapat menerima dana.", tone: "warning", dedupeKey: "goal:funding-target-unavailable" });
  }, [clearWorkflowState, items, location.key, location.state, notify, openFunding, resourceStatus, setFundingPrompt]);
};

// Route, resource, and modal orchestration intentionally stays in one canonical page owner.
// eslint-disable-next-line complexity
const GoalsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const resource = useApiResource("goals.list");
  const investmentResource = useApiResource("investments.overview");
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const [reminderTarget, setReminderTarget] = useState(null);
  const [createdGoal, setCreatedGoal] = useState(null);
  const [fundingTarget, setFundingTarget] = useState(null);
  const [fundingPrompt, setFundingPrompt] = useState(null);
  const [achievement, setAchievement] = useState(null);
  const accounts = useMemo(() => goalPageAccounts(bootstrap, overview), [bootstrap, overview]);
  const creationAccounts = useMemo(() => accounts.filter((item) => item.can_transact !== false && item.owner_scope === "shared" && item.account_type !== "investment"), [accounts]);
  const investmentPortfolios = useMemo(() => (investmentResource.data?.portfolios || []).filter((item) => item.can_operate !== false && item.owner_scope === "shared"), [investmentResource.data?.portfolios]);
  const canCreate = creationAccounts.length > 0 || investmentPortfolios.length > 0;
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const shared = { resource, investmentResource, refreshOverview, invalidate, notify };
  const creation = useGoalCreation({ ...shared, onCreated: (goal) => { if (location.state?.setupFlow) setCreatedGoal(goal || { name: "Target" }); } });
  const lifecycle = useGoalLifecycle(shared);

  const clearWorkflowState = useCallback(() => navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null }), [location.hash, location.pathname, location.search, navigate]);
  const openFunding = useCallback((goal, intent = {}) => {
    if (!goal || goal.status !== "active") return;
    setFundingPrompt(null);
    setFundingTarget({ goal, sourceAccountId: String(intent.sourceAccountId || ""), suggestedAmount: Number(intent.suggestedAmount || 0), manualAmount: intent.manualAmount === true });
  }, []);

  useGoalRouteWorkflow({ location, resourceStatus: resource.status, canCreate, openCreate: creation.openCreate, clearWorkflowState, items, openFunding, setFundingPrompt, notify });

  useEffect(() => {
    const goalId = String(attention?.attentionGoalId || "");
    if (resource.status !== "ready" || !goalId) return;
    const goal = items.find((item) => item.goal_id === goalId && item.status === "active");
    if (!goal) {
      notify({ message: "Target aktif yang perlu perhatian tidak ditemukan.", tone: "warning", dedupeKey: "goal:attention-unavailable" });
      consumeAttention?.();
      return;
    }
    openFunding(goal, { suggestedAmount: Number(attention?.attentionSuggestedAmount || goal.required_monthly_amount || 0) });
    consumeAttention?.();
  }, [attention?.attentionGoalId, attention?.attentionSuggestedAmount, consumeAttention, items, notify, openFunding, resource.status]);

  if (resource.status === "loading") return <NativePageSkeleton kind="goals" label="Memuat target keuangan…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const openReminder = (goal) => setReminderTarget({ entityType: "goal", entityId: goal.goal_id, name: goal.name, suggestedDate: goal.target_date });
  const actions = { openEdit: lifecycle.openEdit, openArchive: lifecycle.openArchive, openStatusChange: lifecycle.openStatusChange, openReminder, openFunding };
  const headerActions = canCreate && items.length ? <Button variant="primary" icon={FiPlus} data-preload-action="goalDialog" onClick={creation.openCreate}>Buat target</Button> : null;
  const onFundingChanged = async ({ goal, amount }) => {
    setFundingTarget(null);
    invalidate(refreshGoalKeys);
    const [goalsResult] = await Promise.allSettled([resource.reload(), investmentResource.reload(), refreshOverview()]);
    const refreshed = goalsResult.status === "fulfilled" ? goalsResult.value : null;
    const nextGoal = (refreshed?.items || resource.data?.items || []).find((item) => item.goal_id === goal.goal_id) || null;
    if (amount > 0 && nextGoal) setAchievement({ goalBefore: goal, goalAfter: nextGoal, amount });
    notify({ message: amount > 0 ? "Dana Target berhasil ditambahkan." : "Hubungan investasi Target berhasil diperbarui.", tone: "success", dedupeKey: `goal:funding:${goal.goal_id}` });
  };
  const openGoalInvestmentBuy = (goal, portfolioId) => {
    setFundingTarget(null);
    navigate("/investasi", { state: { workflowSource: "goal", workflowAction: "record-investment", goalId: goal.goal_id, ...(portfolioId ? { portfolioId } : {}) } });
  };

  return <div className="page-stack">
    <RefreshWarning error={resource.refreshError || investmentResource.refreshError} onRetry={() => Promise.allSettled([resource.reload(), investmentResource.reload()])} />
    <PageHeader title="Target" help="Satu tujuan dapat berisi dana tunai, investasi, atau keduanya. Nilai investasi mengikuti catatan harga terakhir dan setiap kejadian uang dihitung satu kali." actions={headerActions} />
    {createdGoal ? <CompactNotice tone="success" title="Target sudah siap." role="status">Gunakan Tambah dana untuk menyimpan lewat rekening atau investasi sesuai cara menabung Target.</CompactNotice> : null}
    {createdGoal ? <div className="form-actions"><Button type="button" onClick={() => setCreatedGoal(null)}>Selesai</Button>{createdGoal?.goal_id ? <Button type="button" variant="primary" onClick={() => { openFunding(createdGoal); setCreatedGoal(null); }}>Tambah dana</Button> : null}</div> : null}
    {fundingPrompt ? <CompactNotice tone="info" title="Pilih Target yang ingin ditambah." role="status">Gunakan tombol Tambah dana pada Target yang dituju. Dana dapat disimpan sebagai tunai atau investasi sesuai pengaturannya.</CompactNotice> : null}
    {items.length ? <GoalSummary items={items} /> : null}
    <GoalGrid items={items} actions={actions} canCreate={canCreate} openCreate={creation.openCreate} />
    {(reminderTarget || creation.open || lifecycle.editGoal || lifecycle.archiveTarget || lifecycle.statusTarget) ? <Suspense fallback={<LazyActionFallback surface="modal" title="Target" label="Menyiapkan aksi target..." />}><GoalDialogLayer reminderTarget={reminderTarget} onReminderClose={() => setReminderTarget(null)} creation={creation} creationAccounts={creationAccounts} investmentPortfolios={investmentPortfolios} lifecycle={lifecycle} /></Suspense> : null}
    {fundingTarget ? <Suspense fallback={<LazyActionFallback surface="modal" title="Target" label="Menyiapkan dana Target..." />}><GoalFundingModal goal={fundingTarget.goal} accounts={accounts} transferRoutes={bootstrap?.transferRoutes || []} investmentOverview={investmentResource.data || { portfolios: [] }} initialSourceAccountId={fundingTarget.sourceAccountId} suggestedAmount={fundingTarget.suggestedAmount} manualAmount={fundingTarget.manualAmount} onClose={() => setFundingTarget(null)} onChanged={onFundingChanged} onBuyInvestment={openGoalInvestmentBuy} /></Suspense> : null}
    {achievement ? <Suspense fallback={null}><GoalAchievementPostcard {...achievement} onClose={() => setAchievement(null)} /></Suspense> : null}
  </div>;
};

export default GoalsPage;
