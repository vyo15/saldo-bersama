import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import { useLocation, useNavigate } from "react-router";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import {
  archiveGoal as requestArchiveGoal,
  createGoal as requestCreateGoal,
  deleteUnusedGoal as requestDeleteUnusedGoal,
  previewGoalLifecycle,
  updateGoal as requestUpdateGoal,
} from "./goals.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { GoalGrid, GoalSummary } from "./components/GoalCards.jsx";

const GoalDialogLayer = lazy(() => import("./components/GoalDialogLayer.jsx"));

const emptyGoalForm = () => ({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
const refreshGoalKeys = Object.freeze(["goals.list", "reports.monthly", "app.initialState"]);

const useGoalCreation = ({ resource, refreshOverview, invalidate, notify, onCreated }) => {
  const createMutation = useGuardedMutation();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(emptyGoalForm);
  const [open, setOpen] = useState(false);
  const openCreate = () => { setMessage(null); setOpen(true); };
  const closeCreate = () => { if (!createMutation.busy) setOpen(false); };
  const createGoal = (event) => {
    event.preventDefault();
    setMessage(null);
    if (!form.target_date) {
      setMessage({ type: "danger", text: "Tanggal target wajib dipilih." });
      return undefined;
    }
    return createMutation.run(async () => {
      await requestCreateGoal({ ...form, target_amount: assertPositiveRupiah(form.target_amount) }, {});
      setForm(emptyGoalForm());
      setOpen(false);
      notify({ message: "Target keuangan berhasil dibuat.", tone: "success", dedupeKey: "goals:create" });
      invalidate(refreshGoalKeys);
      await Promise.allSettled([resource.reload(), refreshOverview()]);
      onCreated?.();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { createMutation, message, form, setForm, open, openCreate, closeCreate, createGoal };
};

const useGoalLifecycle = ({ resource, refreshOverview, invalidate, notify }) => {
  const [editGoal, setEditGoal] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusState, setStatusState] = useState({ status: "idle", error: null });
  const refresh = async (keys) => { invalidate(keys); await Promise.allSettled([resource.reload(), refreshOverview()]); };
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
        notify({ message: "Target berhasil diarsipkan. Riwayat mutasi dan transaksi tetap tersimpan.", tone: "success", dedupeKey: "goals:archive" });
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
        message: nextStatus === "completed" ? "Target selesai. Progress dikunci dan saldo rekening tidak berubah." : "Target dibuka kembali. Rencana dapat dilanjutkan melalui Alokasi.",
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
  return (bootstrap?.accounts || []).filter((item) => item.status === "active")
    .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) }));
};

const goalHeaderActions = ({ canCreate, itemCount, openCreate }) => (canCreate && itemCount
  ? <Button variant="primary" icon={FiPlus} data-preload-action="goalDialog" onClick={openCreate}>Buat target</Button>
  : null);

const GoalsPage = () => {
  const { attention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const resource = useApiResource("goals.list");
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const [reminderTarget, setReminderTarget] = useState(null);
  const [setupCreated, setSetupCreated] = useState(false);
  const [allocationIntent, setAllocationIntent] = useState(null);
  const accounts = goalPageAccounts(bootstrap, overview);
  const operableAccounts = accounts.filter((item) => item.can_transact !== false);
  const creationAccounts = operableAccounts.filter((item) => item.owner_scope === "shared");
  const canCreate = creationAccounts.length > 0;
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const shared = { resource, refreshOverview, invalidate, notify };
  const creation = useGoalCreation({ ...shared, onCreated: () => { if (location.state?.setupFlow) setSetupCreated(true); } });
  const lifecycle = useGoalLifecycle(shared);
  const attentionGoalId = String(attention?.attentionGoalId || "");
  useEffect(() => {
    if (resource.status !== "ready" || location.state?.workflowAction !== "create-goal") return;
    if (canCreate) creation.openCreate();
    else notify({ message: "Siapkan rekening Bersama aktif sebelum membuat Target.", tone: "warning", dedupeKey: "goal:dashboard-create-unavailable" });
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [canCreate, creation, location.hash, location.pathname, location.search, location.state, navigate, notify, resource.status]);
  useEffect(() => {
    if (resource.status !== "ready" || location.state?.workflowAction !== "goal-deposit") return;
    setAllocationIntent({
      sourceAccountId: String(location.state.sourceAccountId || ""),
      suggestedAmount: Number(location.state.suggestedAmount || 0),
    });
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state, navigate, resource.status]);
  useEffect(() => {
    if (resource.status !== "ready" || !attentionGoalId) return;
    const goal = items.find((item) => item.goal_id === attentionGoalId && item.status === "active");
    if (!goal) {
      notify({ message: "Target aktif yang perlu perhatian tidak ditemukan.", tone: "warning", dedupeKey: "goal:attention-unavailable" });
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
      return;
    }
    navigate("/perencanaan/kantong", {
      replace: true,
      state: { workflowSource: "goal-attention", workflowAction: "goal-plan", goalId: goal.goal_id, suggestedAmount: Number(attention?.attentionSuggestedAmount || goal.required_monthly_amount || 0) },
    });
  }, [attention?.attentionSuggestedAmount, attentionGoalId, items, location.hash, location.pathname, location.search, navigate, notify, resource.status]);
  if (resource.status === "loading") return <NativePageSkeleton kind="goals" label="Memuat target keuangan…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const openReminder = (goal) => setReminderTarget({ entityType: "goal", entityId: goal.goal_id, name: goal.name, suggestedDate: goal.target_date });
  const actions = { openEdit: lifecycle.openEdit, openArchive: lifecycle.openArchive, openStatusChange: lifecycle.openStatusChange, openReminder, allocationIntent };
  const headerActions = goalHeaderActions({ canCreate, itemCount: items.length, openCreate: creation.openCreate });
  return <div className="page-stack">
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <PageHeader title="Target" help="Pantau uang yang sedang dikumpulkan untuk tujuan tertentu." actions={headerActions} />{setupCreated ? <div><CompactNotice tone="success" title="Target sudah siap." role="status">Target siap dipantau. Menyisihkan dana tetap dilakukan melalui Alokasi agar transaksi tidak tercatat dua kali.</CompactNotice><div className="form-actions"><Button type="button" onClick={() => setSetupCreated(false)}>Selesai</Button><Button type="button" variant="primary" onClick={() => navigate("/perencanaan/kantong")}>Buka Alokasi</Button></div></div> : null}{allocationIntent ? <CompactNotice tone="info" title="Pilih Target yang ingin diisi." role="status">Dana yang baru tersedia akan diteruskan ke Alokasi setelah kamu memilih Target melalui tombol Buka Alokasi.</CompactNotice> : null}
    {items.some((item) => item.status === "active") ? <CompactNotice tone="info" title="Eksekusi lewat Alokasi">Target hanya memantau rencana dan progres. Menyisihkan atau menggunakan dana dilakukan dari Alokasi agar satu kejadian uang tetap memiliki satu transaksi.</CompactNotice> : null}
    {items.length ? <GoalSummary items={items} /> : null}
    <GoalGrid items={items} actions={actions} canCreate={canCreate} openCreate={creation.openCreate} />
    {(reminderTarget || creation.open || lifecycle.editGoal || lifecycle.archiveTarget || lifecycle.statusTarget) ? (
      <Suspense fallback={<LazyActionFallback surface="modal" title="Target" label="Menyiapkan aksi target..." />}>
        <GoalDialogLayer reminderTarget={reminderTarget} onReminderClose={() => setReminderTarget(null)} creation={creation} creationAccounts={creationAccounts} lifecycle={lifecycle} />
      </Suspense>
    ) : null}
  </div>;
};

export default GoalsPage;
