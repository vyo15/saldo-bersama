import { useCallback, useEffect, useRef, useState } from "react";
import { FiArchive, FiArrowDown, FiArrowUp, FiCheckCircle, FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { EmergencyFundIcon, PriorityHighIcon, PriorityLowIcon, PriorityNormalIcon, SinkingFundIcon, TargetIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
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
import { filterByOwnership } from "../../domain/ownership.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";

const GOAL_PACE_LABELS = Object.freeze({ completed: "Tercapai", on_track: "Sesuai rencana", behind: "Tertinggal", overdue: "Melewati target", no_target_date: "Tanpa tanggal target" });
const emptyGoalForm = () => ({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
const emptyMovement = () => ({ goal: null, movement_type: "deposit", amount: "", source_account_id: "", destination_account_id: "", transaction_date: todayInJakarta(), reason: "" });
const goalTypeLabel = (type) => ({ emergency_fund: "Dana darurat", sinking_fund: "Dana berkala" }[type] || "Tujuan tabungan");
const refreshGoalKeys = Object.freeze(["goals.list", "reports.monthly", "app.initialState"]);
const goalLedgerRefreshKeys = Object.freeze(["goals.list", "transactions.list", "accounts.list", "reports.monthly", "app.initialState"]);

const GOAL_HERO_ART = "/login/assets/mobile/piggy-bank.webp";

const summarizeGoals = (items) => {
  const active = items.filter((item) => item.status === "active");
  const totals = active.reduce((sum, item) => ({
    current: sum.current + Math.max(0, Number(item.current_amount || 0)),
    target: sum.target + Math.max(0, Number(item.target_amount || 0)),
    remaining: sum.remaining + Math.max(0, Number(item.remaining_amount || 0)),
    monthly: sum.monthly + Math.max(0, Number(item.required_monthly_amount || 0)),
    attention: sum.attention + (["behind", "overdue"].includes(item.pace_status) ? 1 : 0),
  }), { current: 0, target: 0, remaining: 0, monthly: 0, attention: 0 });
  return { ...totals, activeCount: active.length };
};

const GoalSummary = ({ items }) => {
  const summary = summarizeGoals(items);
  return (
    <Card className="goal-summary" aria-labelledby="goal-summary-title">
      <div className="goal-summary__content">
        <p className="goal-summary__eyebrow" id="goal-summary-title">Progress target aktif</p>
        <div className="goal-summary__amount"><Money value={summary.current} /></div>
        <p className="goal-summary__description">Terkumpul dari target <Money value={summary.target} />.</p>
        <div className="goal-summary__progress"><ProgressBar value={summary.current} max={summary.target} label="Progress seluruh target aktif" /></div>
        <div className="goal-summary__meta">
          <span>Sisa <strong><Money value={summary.remaining} /></strong></span>
          <span>Estimasi/bulan <strong><Money value={summary.monthly} /></strong></span>
          <span>{summary.activeCount} target aktif{summary.attention ? <> · <strong>{summary.attention} perlu perhatian</strong></> : ""}</span>
        </div>
      </div>
      <img className="goal-summary__art" src={GOAL_HERO_ART} alt="" aria-hidden="true" draggable="false" />
    </Card>
  );
};

const GoalActions = ({ goal, openMovement, openReverse, openEdit, openArchive, openStatusChange }) => {
  const primaryAction = goal.can_deposit
    ? <Button className="goal-card__primary-action" variant="primary" icon={FiArrowUp} onClick={() => openMovement(goal, "deposit")}>Tambah dana</Button>
    : goal.can_complete
      ? <Button className="goal-card__primary-action" variant="primary" icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Selesaikan target</Button>
      : goal.can_reopen
        ? <Button className="goal-card__primary-action" variant="primary" icon={FiRotateCcw} onClick={() => openStatusChange(goal, "active")}>Buka kembali</Button>
        : null;
  const hasSecondaryActions = goal.can_withdraw || (goal.can_complete && goal.can_deposit) || goal.can_reverse || goal.can_update || goal.can_archive;
  if (!primaryAction && !hasSecondaryActions) return null;
  return (
    <div className="goal-card__actions">
      {primaryAction}
      {hasSecondaryActions ? <details className="goal-action-menu"><summary aria-label={`Kelola target ${goal.name}`}><FiMoreHorizontal aria-hidden="true" /><span>Kelola</span></summary><div className="goal-action-menu__items">{goal.can_withdraw ? <Button icon={FiArrowDown} onClick={() => openMovement(goal, "withdrawal")}>Tarik dana</Button> : null}{goal.can_complete && goal.can_deposit ? <Button icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Selesaikan target</Button> : null}{goal.can_reverse ? <Button icon={FiRotateCcw} onClick={() => openReverse(goal)}>Batalkan terakhir</Button> : null}{goal.can_update ? <Button icon={FiEdit2} onClick={() => openEdit(goal)}>Edit</Button> : null}{goal.can_archive ? <Button icon={FiArchive} onClick={() => openArchive(goal)}>Hapus / Arsipkan</Button> : null}</div></details> : null}
    </div>
  );
};

const GoalCard = ({ goal, actions }) => (
  <Card className="goal-card">
    <div className="goal-card__icon">{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div>
    <div><p className="eyebrow">{goalTypeLabel(goal.goal_type)}</p><h2>{goal.name}</h2></div>
    <Money value={goal.current_amount} />
    <ProgressBar value={goal.current_amount} max={goal.target_amount} label={goal.name} />
    <div className="goal-card__footer"><span>Target <Money value={goal.target_amount} /></span><span>{goal.target_date || "Tanpa tanggal"}</span></div>
    <dl className="goal-card__projection">
      <div><dt>Sisa</dt><dd><Money value={goal.remaining_amount || 0} /></dd></div>
      <div><dt>Estimasi/bulan</dt><dd>{goal.pace_status === "no_target_date" ? "Tetapkan tanggal" : <Money value={goal.required_monthly_amount || 0} />}</dd></div>
      <div><dt>Proyeksi</dt><dd data-pace={goal.pace_status}>{GOAL_PACE_LABELS[goal.pace_status] || goal.pace_status}</dd></div>
    </dl>
    {goal.status === "active" && goal.pace_status === "completed" ? <p className="goal-card__completion">Target tercapai. Selesaikan target untuk mengunci mutasi.</p> : null}
    <GoalActions goal={goal} {...actions} />
  </Card>
);

const GoalGrid = ({ items, actions, ownerMode, openCreate }) => (
  <section className="goal-grid">
    {items.length ? items.map((goal) => <GoalCard key={goal.goal_id} goal={goal} actions={actions} />) : (
      <Card className="panel">
        <EmptyState variant="inline" icon={FiTarget} title="Belum ada target keuangan" description="Buat target untuk memantau progres dana dan kebutuhan bulanan." action={ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Buat target pertama</Button> : null} />
      </Card>
    )}
  </section>
);

const GoalCreateModal = ({ open, close, form, setForm, accounts, createGoal, createMutation, message }) => (
  <Modal
    open={open}
    onClose={close}
    dismissible={!createMutation.busy}
    title="Buat target"
    footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button type="submit" form="goal-create-form" variant="primary" icon={FiPlus} loading={createMutation.busy}>Buat target</Button></>}
  >
    <form id="goal-create-form" className="form-grid" onSubmit={createGoal}>
      <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <VisualChoiceGroup className="form-grid__full" legend="Jenis target" name="goal-type" value={form.goal_type} onChange={(goal_type) => setForm((current) => ({ ...current, goal_type }))} options={[{ value: "savings", label: "Tabungan tujuan", icon: TargetIcon, description: "Target nominal" }, { value: "emergency_fund", label: "Dana darurat", icon: EmergencyFundIcon, description: "Cadangan kebutuhan mendadak" }, { value: "sinking_fund", label: "Dana berkala", icon: SinkingFundIcon, description: "Kebutuhan periodik" }]} columns={3} />
      <MoneyInput id="goal-target" label="Target nominal" value={form.target_amount} onChange={(value) => setForm((current) => ({ ...current, target_amount: value }))} />
      <label className="field"><span>Tanggal target</span><input required type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} /></label>
      <label className="field"><span>Rekening tujuan</span><select required value={form.account_id} onChange={(event) => setForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>
);

const GoalEditModal = ({ editGoal, setEditGoal, editState, saveGoal }) => (
  <Modal open={Boolean(editGoal)} onClose={() => setEditGoal(null)} dismissible={editState.status !== "submitting"} title="Edit target" footer={<><Button type="button" disabled={editState.status === "submitting"} onClick={() => setEditGoal(null)}>Batal</Button><Button type="submit" form="goal-edit-form" variant="primary" disabled={editState.status === "submitting"}>{editState.status === "submitting" ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
    <form id="goal-edit-form" className="form-grid" onSubmit={saveGoal}>
      <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={editGoal?.name || ""} onChange={(event) => setEditGoal((current) => ({ ...current, name: event.target.value }))} /></label>
      <MoneyInput id="goal-edit-target" label="Target nominal" value={editGoal?.target_amount || ""} onChange={(value) => setEditGoal((current) => ({ ...current, target_amount: value }))} />
      <label className="field"><span>Tanggal target</span><input required type="date" value={editGoal?.target_date || ""} onChange={(event) => setEditGoal((current) => ({ ...current, target_date: event.target.value }))} /></label>
      <VisualChoiceGroup className="form-grid__full" legend="Prioritas" name="goal-priority" value={editGoal?.priority || "normal"} onChange={(priority) => setEditGoal((current) => ({ ...current, priority }))} options={[{ value: "low", label: "Rendah", icon: PriorityLowIcon }, { value: "normal", label: "Normal", icon: PriorityNormalIcon }, { value: "high", label: "Tinggi", icon: PriorityHighIcon }]} columns={3} compact />
      {editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}
    </form>
  </Modal>
);

const MovementAccountField = ({ label, value, accounts, onChange }) => <label className="field"><span>{label} *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label>;

const GoalMovementModal = ({ movement, setMovement, movementState, movementMutation, accounts, submitMovement }) => {
  const close = () => movementState.status !== "submitting" && setMovement((current) => ({ ...current, goal: null }));
  const deposit = movement.movement_type === "deposit";
  return <Modal open={Boolean(movement.goal)} onClose={close} dismissible={movementState.status !== "submitting"} title={deposit ? "Tambah dana target" : "Tarik dana target"} description={movement.goal ? movement.goal.name : ""} footer={<><Button type="button" disabled={movementState.status === "submitting"} onClick={close}>Batal</Button><Button type="submit" form="goal-movement-form" variant="primary" loading={movementMutation.busy} disabled={movementState.status === "submitting"}>Simpan transfer</Button></>}>
    <form id="goal-movement-form" className="form-grid" onSubmit={submitMovement}>
      {movement.goal ? <div className="notice notice--info form-grid__full"><span>{deposit ? "Sisa target" : "Dana target tersedia"} <Money value={deposit ? movement.goal.remaining_amount : movement.goal.current_amount} />.</span></div> : null}
      <MoneyInput id="goal-movement-amount" label="Nominal" value={movement.amount} onChange={(value) => setMovement((current) => ({ ...current, amount: value }))} />
      <MovementAccountField label="Rekening sumber" value={movement.source_account_id} accounts={accounts} onChange={(source_account_id) => setMovement((current) => ({ ...current, source_account_id }))} />
      <MovementAccountField label="Rekening tujuan" value={movement.destination_account_id} accounts={accounts} onChange={(destination_account_id) => setMovement((current) => ({ ...current, destination_account_id }))} />
      <label className="field"><span>Tanggal *</span><input required type="date" value={movement.transaction_date} onChange={(event) => setMovement((current) => ({ ...current, transaction_date: event.target.value }))} /></label>
      <label className="field form-grid__full"><span>Alasan *</span><input required maxLength="180" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} /></label>
      {movementState.error ? <div className="notice notice--danger form-grid__full" role="alert">{movementState.error.message}</div> : null}
    </form>
  </Modal>;
};

const GoalStatusConfirmation = ({ statusTarget, statusState, setStatusTarget, applyGoalStatus }) => {
  const completing = statusTarget?.nextStatus === "completed";
  return <ConfirmationModal
    open={Boolean(statusTarget)}
    title={completing ? "Selesaikan target?" : "Buka kembali target?"}
    description={statusTarget ? (completing
      ? `${statusTarget.goal.name} sudah mencapai nominal tujuan. Mutasi target akan dikunci tanpa mengubah saldo rekening.`
      : `${statusTarget.goal.name} akan kembali aktif. Jika progress masih 100%, penambahan dana tetap terkunci sampai nominal target dinaikkan; penarikan dana tetap tersedia.`) : ""}
    confirmLabel={completing ? "Selesaikan target" : "Buka kembali"}
    tone="primary"
    busy={statusState.status === "submitting"}
    error={statusState.error}
    onCancel={() => statusState.status !== "submitting" && setStatusTarget(null)}
    onConfirm={applyGoalStatus}
  />;
};

const GoalConfirmations = ({ reverseTarget, reverseState, setReverseTarget, reverseLastMovement, archiveTarget, archiveState, setArchiveTarget, applyGoalLifecycle, statusTarget, statusState, setStatusTarget, applyGoalStatus }) => <>
  <GoalStatusConfirmation statusTarget={statusTarget} statusState={statusState} setStatusTarget={setStatusTarget} applyGoalStatus={applyGoalStatus} />
  <ConfirmationModal open={Boolean(reverseTarget)} title="Batalkan mutasi target terakhir?" description={reverseTarget ? `${reverseTarget.name} · transfer terkait juga akan dibatalkan tanpa menghapus audit.` : ""} confirmLabel="Batalkan mutasi" reasonLabel="Alasan pembatalan" requireReason busy={reverseState.status === "submitting"} error={reverseState.error} onCancel={() => reverseState.status !== "submitting" && setReverseTarget(null)} onConfirm={reverseLastMovement} />
  <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus target yang belum dipakai?" : "Arsipkan target?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.goal.name} masih Rp0 dan belum pernah memiliki mutasi maupun transaksi terkait.` : `${archiveTarget.goal.name} sudah memiliki histori. Target tidak dihapus permanen dan riwayat tetap tersimpan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan target"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={archiveTarget?.preview.canDeleteUnused ? "Saya memahami target ini belum pernah digunakan dan penghapusan bersifat permanen." : ""} busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyGoalLifecycle}>{archiveTarget ? <div className="notice notice--info">Progress saat ini <Money value={archiveTarget.preview.currentAmount} /> · mutasi historis {archiveTarget.preview.dependencies.movements} · transaksi terkait {archiveTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal>
</>;

const useGoalCreation = ({ resource, refreshOverview, invalidate, notify }) => {
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

const useGoalMovement = ({ accounts, resource, refreshOverview, invalidate, notify }) => {
  const movementMutation = useGuardedMutation();
  const [movement, setMovement] = useState(emptyMovement);
  const [movementState, setMovementState] = useState({ status: "idle", error: null });
  const goalAccount = movement.goal ? accounts.find((account) => account.account_id === movement.goal.account_id) || null : null;
  const compatibleMovementAccounts = filterByOwnership(accounts, goalAccount);
  const openMovement = useCallback((goal, movement_type) => {
    const withdrawal = movement_type === "withdrawal";
    setMovement({ goal, movement_type, amount: "", source_account_id: withdrawal ? goal.account_id || "" : "", destination_account_id: withdrawal ? "" : goal.account_id || "", transaction_date: todayInJakarta(), reason: withdrawal ? "Penggunaan dana target" : "Kontribusi target" });
    setMovementState({ status: "idle", error: null });
  }, []);
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

const GoalsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const attentionHandled = useRef(false);
  const resource = useApiResource("goals.list");
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const ownerMode = user?.role === "owner";
  const accounts = bootstrap?.accounts?.filter((item) => item.status === "active") || [];
  const shared = { resource, refreshOverview, invalidate, notify };
  const creation = useGoalCreation(shared);
  const movement = useGoalMovement({ ...shared, accounts });
  const { openMovement } = movement;
  const lifecycle = useGoalLifecycle(shared);
  const attentionGoalId = String(attention?.attentionGoalId || "");
  useEffect(() => {
    if (attentionHandled.current || !attentionGoalId || resource.status !== "ready") return;
    attentionHandled.current = true;
    const goal = (resource.data?.items || []).find((item) => item.goal_id === attentionGoalId);
    if (goal && attention?.attentionAction === "deposit" && goal.can_deposit) openMovement(goal, "deposit");
    consumeAttention();
  }, [attention?.attentionAction, attentionGoalId, consumeAttention, openMovement, resource.data?.items, resource.status]);
  if (resource.status === "loading") return <LoadingScreen label="Memuat target keuangan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const actions = { openMovement: movement.openMovement, openReverse: lifecycle.openReverse, openEdit: lifecycle.openEdit, openArchive: lifecycle.openArchive, openStatusChange: lifecycle.openStatusChange };
  return <div className="page-stack">
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <PageHeader title="Target" actions={ownerMode && (resource.data?.items || []).length ? <Button variant="primary" icon={FiPlus} onClick={creation.openCreate}>Buat target</Button> : null} />{attentionGoalId ? <div className="notice notice--info attention-guidance" role="status"><strong>Target ini tertinggal dari rencana.</strong><span>Tambahkan dana hanya jika saldo rekening sumber mencukupi. Form setoran akan dibuka otomatis bila target masih menerima setoran.</span></div> : null}
    <GoalSummary items={resource.data?.items || []} />
    <GoalGrid items={resource.data?.items || []} actions={actions} ownerMode={ownerMode} openCreate={creation.openCreate} />
    <GoalCreateModal open={creation.open} close={creation.closeCreate} form={creation.form} setForm={creation.setForm} accounts={accounts} createGoal={creation.createGoal} createMutation={creation.createMutation} message={creation.message} />
    <GoalEditModal editGoal={lifecycle.editGoal} setEditGoal={lifecycle.setEditGoal} editState={lifecycle.editState} saveGoal={lifecycle.saveGoal} />
    <GoalMovementModal movement={movement.movement} setMovement={movement.setMovement} movementState={movement.movementState} movementMutation={movement.movementMutation} accounts={movement.compatibleMovementAccounts} submitMovement={movement.submitMovement} />
    <GoalConfirmations reverseTarget={lifecycle.reverseTarget} reverseState={lifecycle.reverseState} setReverseTarget={lifecycle.setReverseTarget} reverseLastMovement={lifecycle.reverseLastMovement} archiveTarget={lifecycle.archiveTarget} archiveState={lifecycle.archiveState} setArchiveTarget={lifecycle.setArchiveTarget} applyGoalLifecycle={lifecycle.applyGoalLifecycle} statusTarget={lifecycle.statusTarget} statusState={lifecycle.statusState} setStatusTarget={lifecycle.setStatusTarget} applyGoalStatus={lifecycle.applyGoalStatus} />
  </div>;
};

export default GoalsPage;
