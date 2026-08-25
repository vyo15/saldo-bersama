import { FiArrowDown, FiArrowUp, FiPlus } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import CompactNotice from "../../../components/common/CompactNotice.jsx";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { EmergencyFundIcon, PriorityHighIcon, PriorityLowIcon, PriorityNormalIcon, SinkingFundIcon, TargetIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { formatRupiah } from "../../../domain/money.js";
import { canRepresentAccountTransfer } from "../../../domain/ownership.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";

const accountFundsLabel = (account) => `${accountDisplayLabel(account)} · tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`;

const GoalCreateModal = ({ open, close, form, setForm, accounts, createGoal, createMutation, message }) => {
  const targetAccount = accounts.find((item) => item.account_id === form.account_id) || null;
  const compatibleSource = targetAccount ? accounts.some((item) => item.account_id !== targetAccount.account_id && canRepresentAccountTransfer(item, targetAccount)) : true;
  return <Modal
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
      <label className="field"><span>Rekening tujuan</span><select required value={form.account_id} onChange={(event) => setForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountFundsLabel(account)}</option>)}</select></label>
      {targetAccount && !compatibleSource ? <CompactNotice className="form-grid__full" tone="info" title="Target dapat dibuat, tetapi belum dapat disetor">Tambahkan rekening sumber lain yang dapat dioperasikan. Setoran target selalu berupa transfer antar rekening yang berbeda.</CompactNotice> : null}
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>;
};

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

const MovementAccountField = ({ label, value, accounts, onChange }) => {
  const selected = accounts.find((account) => account.account_id === value) || null;
  return <label className="field"><span>{label} *</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountFundsLabel(account)}</option>)}</select>{selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}</label>;
};

const GoalMovementModal = ({ movement, setMovement, movementState, movementMutation, accounts, submitMovement }) => {
  const close = () => movementState.status !== "submitting" && setMovement((current) => ({ ...current, goal: null }));
  const deposit = movement.movement_type === "deposit";
  return <Modal open={Boolean(movement.goal)} onClose={close} dismissible={movementState.status !== "submitting"} title={deposit ? "Tambah dana target" : "Tarik dana target"} description={movement.goal ? movement.goal.name : ""} footer={<><Button type="button" disabled={movementState.status === "submitting"} onClick={close}>Batal</Button><Button type="submit" form="goal-movement-form" variant="primary" loading={movementMutation.busy} disabled={movementState.status === "submitting"}>Simpan transfer</Button></>}>
    <form id="goal-movement-form" className="form-grid" onSubmit={submitMovement}>
      {movement.goal ? <CompactNotice tone="info" title={deposit ? "Sisa target" : "Dana target tersedia"} className="form-grid__full"><Money value={deposit ? movement.goal.remaining_amount : movement.goal.current_amount} /></CompactNotice> : null}
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


export { GoalConfirmations, GoalCreateModal, GoalEditModal, GoalMovementModal };
