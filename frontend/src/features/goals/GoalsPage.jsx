import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  archiveGoal as requestArchiveGoal,
  createGoal as requestCreateGoal,
  deleteUnusedGoal as requestDeleteUnusedGoal,
  moveGoal as requestMoveGoal,
  previewGoalLifecycle,
  reverseGoalMovement,
  updateGoal as requestUpdateGoal,
} from "./goals.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { todayInJakarta } from "../../domain/dates.js";
import { canRepresentAccountTransfer } from "../../domain/ownership.js";
import ManualReminderModal from "../reminders/ManualReminderModal.jsx";
import { GoalGrid, GoalSummary } from "./components/GoalCards.jsx";
import { GoalConfirmations, GoalCreateModal, GoalEditModal, GoalMovementModal } from "./components/GoalDialogs.jsx";

const emptyGoalForm = () => ({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
const emptyMovement = () => ({ goal: null, movement_type: "deposit", amount: "", source_account_id: "", destination_account_id: "", transaction_date: todayInJakarta(), reason: "" });
const refreshGoalKeys = Object.freeze(["goals.list", "reports.monthly", "app.initialState"]);
const goalLedgerRefreshKeys = Object.freeze(["goals.list", "transactions.list", "accounts.list", "reports.monthly", "app.initialState"]);

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

const movementError = (movement, amount) => {
  if (!movement.source_account_id || !movement.destination_account_id) return new Error("Rekening sumber dan tujuan wajib dipilih.");
  if (movement.source_account_id === movement.destination_account_id) return new Error("Rekening sumber dan tujuan harus berbeda.");
  if (movement.movement_type === "deposit" && amount > Number(movement.goal?.remaining_amount || 0)) return new Error("Nominal melebihi sisa target.");
  if (movement.movement_type === "withdrawal" && amount > Number(movement.goal?.current_amount || 0)) return new Error("Nominal melebihi dana target yang tersedia.");
  return null;
};


const goalMovementDraft = ({ goal, movementType, accounts, prefill }) => {
  const withdrawal = movementType === "withdrawal";
  if (withdrawal) return { goal, movement_type: movementType, amount: "", source_account_id: goal.account_id || "", destination_account_id: "", transaction_date: todayInJakarta(), reason: "Penggunaan dana target" };
  const goalAccount = accounts.find((account) => account.account_id === goal.account_id) || null;
  const compatible = accounts.filter((account) => account.account_id !== goal.account_id && canRepresentAccountTransfer(account, goalAccount));
  const preferredSource = prefill?.sourceAccountId ? compatible.find((account) => account.account_id === prefill.sourceAccountId) || null : null;
  const suggested = Math.max(0, Number(prefill?.suggestedAmount || 0));
  const remaining = Math.max(0, Number(goal.remaining_amount || 0));
  const sourceAvailable = Math.max(0, Number(preferredSource?.available_balance ?? preferredSource?.balance ?? 0));
  const allowed = preferredSource ? Math.min(suggested, remaining, sourceAvailable) : 0;
  return { goal, movement_type: movementType, amount: allowed > 0 ? String(allowed) : "", source_account_id: preferredSource?.account_id || "", destination_account_id: goal.account_id || "", transaction_date: todayInJakarta(), reason: "Kontribusi target" };
};

const useGoalMovement = ({ accounts, resource, refreshOverview, invalidate, notify }) => {
  const movementMutation = useGuardedMutation();
  const [movement, setMovement] = useState(emptyMovement);
  const [movementState, setMovementState] = useState({ status: "idle", error: null });
  const goalAccount = movement.goal ? accounts.find((account) => account.account_id === movement.goal.account_id) || null : null;
  const compatibleMovementAccounts = goalAccount
    ? accounts.filter((account) => canRepresentAccountTransfer(account, goalAccount))
    : accounts;
  const openMovement = useCallback((goal, movement_type, prefill = null) => {
    setMovement(goalMovementDraft({ goal, movementType: movement_type, accounts, prefill }));
    setMovementState({ status: "idle", error: null });
  }, [accounts]);
  const submitMovement = (event) => {
    event.preventDefault();
    if (!movement.goal) return;
    let amount;
    try { amount = assertPositiveRupiah(movement.amount); } catch (error) { setMovementState({ status: "error", error }); return; }
    const error = movementError(movement, amount);
    if (error) { setMovementState({ status: "error", error }); return; }
    setMovementState({ status: "submitting", error: null });
    return movementMutation.run(async () => {
      await requestMoveGoal({ goal_id: movement.goal.goal_id, movement_type: movement.movement_type, amount, source_account_id: movement.source_account_id, destination_account_id: movement.destination_account_id, transaction_date: movement.transaction_date, reason: movement.reason }, {});
      setMovement((current) => ({ ...current, goal: null }));
      setMovementState({ status: "idle", error: null });
      notify({ message: movement.movement_type === "deposit" ? "Dana target dan transfer rekening berhasil dicatat." : "Penarikan target dan transfer rekening berhasil dicatat.", tone: "success", dedupeKey: "goals:move" });
      invalidate(goalLedgerRefreshKeys);
      await Promise.allSettled([resource.reload(), refreshOverview()]);
    }).catch((caught) => setMovementState({ status: "error", error: caught }));
  };
  return { movementMutation, movement, setMovement, movementState, compatibleMovementAccounts, openMovement, submitMovement };
};

const useGoalLifecycle = ({ resource, refreshOverview, invalidate, notify }) => {
  const [editGoal, setEditGoal] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
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
  const reverseLastMovement = async (reason) => {
    if (!reverseTarget?.last_movement_id) return;
    setReverseState({ status: "submitting", error: null });
    try {
      await reverseGoalMovement({ goal_movement_id: reverseTarget.last_movement_id, row_version: reverseTarget.last_movement_row_version, reason }, { rowVersion: reverseTarget.last_movement_row_version });
      setReverseTarget(null);
      setReverseState({ status: "idle", error: null });
      notify({ message: "Mutasi target terakhir dan transfer terkait berhasil dibatalkan.", tone: "success", dedupeKey: "goals:reverse" });
      await refresh(goalLedgerRefreshKeys);
    } catch (error) { setReverseState({ status: "error", error }); }
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
        message: nextStatus === "completed" ? "Target selesai. Mutasi target dikunci dan saldo rekening tidak berubah." : "Target dibuka kembali. Penarikan dana tersedia; setoran baru menunggu sisa target kembali positif.",
        tone: "success",
        dedupeKey: nextStatus === "completed" ? "goals:complete" : "goals:reopen",
      });
      await refresh(refreshGoalKeys);
    } catch (error) { setStatusState({ status: "error", error }); }
  };
  const openEdit = (goal) => { setEditGoal({ ...goal }); setEditState({ status: "idle", error: null }); };
  const openReverse = (goal) => { setReverseTarget(goal); setReverseState({ status: "idle", error: null }); };
  return { editGoal, setEditGoal, editState, saveGoal, archiveTarget, setArchiveTarget, archiveState, applyGoalLifecycle, reverseTarget, setReverseTarget, reverseState, reverseLastMovement, statusTarget, setStatusTarget, statusState, applyGoalStatus, openStatusChange, openEdit, openArchive, openReverse };
};


const goalPageAccounts = (bootstrap, overview) => {
  const balanceLookup = new Map((overview?.accountBalances || []).map((item) => [item.account_id, item]));
  return (bootstrap?.accounts || []).filter((item) => item.status === "active")
    .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) }));
};

const useGoalAttention = ({ attention, attentionGoalId, consumeAttention, items, resourceStatus, openMovement, attentionHandled }) => {
  useEffect(() => {
    if (attentionHandled.current || !attentionGoalId || resourceStatus !== "ready") return;
    attentionHandled.current = true;
    const goal = items.find((item) => item.goal_id === attentionGoalId);
    if (goal && attention?.attentionAction === "deposit" && goal.can_deposit) openMovement(goal, "deposit");
    consumeAttention();
  }, [attention?.attentionAction, attentionGoalId, attentionHandled, consumeAttention, items, openMovement, resourceStatus]);
};

const GoalsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const attentionHandled = useRef(false);
  const resource = useApiResource("goals.list");
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const ownerMode = user?.role === "owner";
  const canCreate = Boolean(ownerMode || user?.role === "member");
  const [reminderTarget, setReminderTarget] = useState(null);
  const [workflowPrefill, setWorkflowPrefill] = useState(null);
  const [setupCreated, setSetupCreated] = useState(false);
  const accounts = goalPageAccounts(bootstrap, overview);
  const operableAccounts = accounts.filter((item) => item.can_transact !== false);
  const creationAccounts = operableAccounts.filter((item) => item.owner_scope === "shared");
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const shared = { resource, refreshOverview, invalidate, notify };
  const creation = useGoalCreation({ ...shared, onCreated: () => { if (location.state?.setupFlow) setSetupCreated(true); } });
  const movement = useGoalMovement({ ...shared, accounts: operableAccounts });
  const { openMovement } = movement;
  const lifecycle = useGoalLifecycle(shared);
  const attentionGoalId = String(attention?.attentionGoalId || "");
  useGoalAttention({ attention, attentionGoalId, consumeAttention, items, resourceStatus: resource.status, openMovement, attentionHandled });
  useEffect(() => {
    if (resource.status !== "ready" || location.state?.workflowAction !== "goal-deposit") return;
    const nextPrefill = { sourceAccountId: String(location.state.sourceAccountId || ""), suggestedAmount: Number(location.state.suggestedAmount || 0) };
    setWorkflowPrefill(nextPrefill);
    const eligible = items.filter((item) => item.status === "active" && item.can_deposit);
    if (eligible.length === 1) openMovement(eligible[0], "deposit", nextPrefill);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [items, location.hash, location.pathname, location.search, location.state, navigate, openMovement, resource.status]);
  if (resource.status === "loading") return <LoadingScreen label="Memuat target keuangan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const openReminder = (goal) => setReminderTarget({ entityType: "goal", entityId: goal.goal_id, name: goal.name, suggestedDate: goal.target_date });
  const openMovementWithPrefill = (goal, type) => { movement.openMovement(goal, type, type === "deposit" ? workflowPrefill : null); if (type === "deposit" && workflowPrefill) setWorkflowPrefill(null); };
  const actions = { openMovement: openMovementWithPrefill, openReverse: lifecycle.openReverse, openEdit: lifecycle.openEdit, openArchive: lifecycle.openArchive, openStatusChange: lifecycle.openStatusChange, openReminder };
  return <div className="page-stack">
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <PageHeader title="Target" help="Target membantu memantau progres dana menuju nominal tujuan. Setoran dan penarikan tetap mengikuti saldo rekening serta konfirmasi server." actions={canCreate && items.length ? <Button variant="primary" icon={FiPlus} onClick={creation.openCreate}>Buat target</Button> : null} />{setupCreated ? <div><CompactNotice tone="success" title="Penyiapan selesai." role="status">Rekening, kategori, Alokasi Dana, dan Target sudah dapat dipakai bersama alur transaksi.</CompactNotice><div className="form-actions"><Button type="button" onClick={() => setSetupCreated(false)}>Selesai</Button><Button type="button" variant="primary" onClick={() => navigate("/transaksi")}>Mulai catat transaksi</Button></div></div> : null}{attentionGoalId ? <CompactNotice tone="info" title="Target ini tertinggal dari rencana." role="status">Setor hanya jika saldo rekening sumber cukup. Form setoran dibuka otomatis saat target masih menerima setoran.</CompactNotice> : null}{workflowPrefill ? <CompactNotice tone="success" title="Dana tersedia siap diarahkan ke Target." role="status">Pilih Target lalu tekan Setor dana. Rekening sumber dan nominal akan diprefill bila masih valid.</CompactNotice> : null}
    <GoalSummary items={items} />
    <GoalGrid items={items} actions={actions} canCreate={canCreate} openCreate={creation.openCreate} />
    <ManualReminderModal target={reminderTarget} onClose={() => setReminderTarget(null)} />
    <GoalCreateModal open={creation.open} close={creation.closeCreate} form={creation.form} setForm={creation.setForm} accounts={creationAccounts} createGoal={creation.createGoal} createMutation={creation.createMutation} message={creation.message} />
    <GoalEditModal editGoal={lifecycle.editGoal} setEditGoal={lifecycle.setEditGoal} editState={lifecycle.editState} saveGoal={lifecycle.saveGoal} />
    <GoalMovementModal movement={movement.movement} setMovement={movement.setMovement} movementState={movement.movementState} movementMutation={movement.movementMutation} accounts={movement.compatibleMovementAccounts} submitMovement={movement.submitMovement} />
    <GoalConfirmations reverseTarget={lifecycle.reverseTarget} reverseState={lifecycle.reverseState} setReverseTarget={lifecycle.setReverseTarget} reverseLastMovement={lifecycle.reverseLastMovement} archiveTarget={lifecycle.archiveTarget} archiveState={lifecycle.archiveState} setArchiveTarget={lifecycle.setArchiveTarget} applyGoalLifecycle={lifecycle.applyGoalLifecycle} statusTarget={lifecycle.statusTarget} statusState={lifecycle.statusState} setStatusTarget={lifecycle.setStatusTarget} applyGoalStatus={lifecycle.applyGoalStatus} />
  </div>;
};

export default GoalsPage;
