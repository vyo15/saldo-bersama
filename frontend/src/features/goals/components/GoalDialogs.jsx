import { FiPlus } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import useUnsavedChangesGuard from "../../../hooks/useUnsavedChangesGuard.js";
import CompactNotice from "../../../components/common/CompactNotice.jsx";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { AccountIcon, EmergencyFundIcon, PriorityHighIcon, PriorityLowIcon, PriorityNormalIcon, SinkingFundIcon, TargetIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import InlineSelectionPicker from "../../../components/common/InlineSelectionPicker.jsx";
import { accountOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { formatRupiah } from "../../../domain/money.js";
import { canRepresentAccountTransfer } from "../../../domain/ownership.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";

import TemporalInput from "../../../components/common/TemporalInput.jsx";
const GoalCreateModal = ({ open, close, form, setForm, accounts, createGoal, createMutation, message }) => {
  const targetAccount = accounts.find((item) => item.account_id === form.account_id) || null;
  const compatibleSource = targetAccount ? accounts.some((item) => item.account_id !== targetAccount.account_id && canRepresentAccountTransfer(item, targetAccount)) : true;
  const guard = useUnsavedChangesGuard({ open, value: form, onClose: close, blocked: createMutation.busy });
  return <>
  <Modal
    open={open}
    onClose={guard.requestClose}
    discardGuard={guard}
    discardSubject="target baru"
    dismissible={!createMutation.busy}
    title="Buat target"
    footer={<><Button type="button" disabled={createMutation.busy} onClick={guard.discardAndClose}>Batal</Button><Button type="submit" form="goal-create-form" variant="primary" icon={FiPlus} loading={createMutation.busy}>Buat target</Button></>}
  >
    <form id="goal-create-form" className="form-grid" onSubmit={createGoal}>
      <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <VisualChoiceGroup className="form-grid__full" legend="Jenis target" name="goal-type" value={form.goal_type} onChange={(goal_type) => setForm((current) => ({ ...current, goal_type }))} options={[{ value: "savings", label: "Tabungan tujuan", icon: TargetIcon, description: "Target nominal" }, { value: "emergency_fund", label: "Dana darurat", icon: EmergencyFundIcon, description: "Cadangan kebutuhan mendadak" }, { value: "sinking_fund", label: "Dana berkala", icon: SinkingFundIcon, description: "Kebutuhan periodik" }]} columns={3} />
      <MoneyInput id="goal-target" label="Target nominal" value={form.target_amount} onChange={(value) => setForm((current) => ({ ...current, target_amount: value }))} />
      <label className="field"><span>Tanggal target</span><TemporalInput required type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} /></label>
      <InlineSelectionPicker label="Rekening tujuan" required value={form.account_id} onChange={(account_id) => setForm((current) => ({ ...current, account_id }))} placeholder="Pilih rekening" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" options={accounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`, ...accountOptionVisual(account) }))} />
      {targetAccount && !compatibleSource ? <CompactNotice className="form-grid__full" tone="info" title="Target dapat dibuat, tetapi belum dapat disetor">Tambahkan rekening sumber lain yang dapat dioperasikan. Setoran target selalu berupa transfer antar rekening yang berbeda.</CompactNotice> : null}
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>
  </>;
};

const GoalEditModal = ({ editGoal, setEditGoal, editState, saveGoal }) => {
  const close = () => setEditGoal(null);
  const submitting = editState.status === "submitting";
  const guard = useUnsavedChangesGuard({ open: Boolean(editGoal), value: editGoal, onClose: close, blocked: submitting });
  return <>
    <Modal open={Boolean(editGoal)} onClose={guard.requestClose} discardGuard={guard} discardSubject="perubahan target" dismissible={!submitting} title="Edit target" footer={<><Button type="button" disabled={submitting} onClick={guard.discardAndClose}>Batal</Button><Button type="submit" form="goal-edit-form" variant="primary" disabled={submitting}>{submitting ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
      <form id="goal-edit-form" className="form-grid" onSubmit={saveGoal}>
        <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={editGoal?.name || ""} onChange={(event) => setEditGoal((current) => ({ ...current, name: event.target.value }))} /></label>
        <MoneyInput id="goal-edit-target" label="Target nominal" value={editGoal?.target_amount || ""} onChange={(value) => setEditGoal((current) => ({ ...current, target_amount: value }))} />
        <label className="field"><span>Tanggal target</span><TemporalInput required type="date" value={editGoal?.target_date || ""} onChange={(event) => setEditGoal((current) => ({ ...current, target_date: event.target.value }))} /></label>
        <VisualChoiceGroup className="form-grid__full" legend="Prioritas" name="goal-priority" value={editGoal?.priority || "normal"} onChange={(priority) => setEditGoal((current) => ({ ...current, priority }))} options={[{ value: "low", label: "Rendah", icon: PriorityLowIcon }, { value: "normal", label: "Normal", icon: PriorityNormalIcon }, { value: "high", label: "Tinggi", icon: PriorityHighIcon }]} columns={3} compact />
        {editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}
      </form>
    </Modal>
  </>;
};

const GoalStatusConfirmation = ({ statusTarget, statusState, setStatusTarget, applyGoalStatus }) => {
  const completing = statusTarget?.nextStatus === "completed";
  return <ConfirmationModal
    open={Boolean(statusTarget)}
    title={completing ? "Selesaikan target?" : "Buka kembali target?"}
    description={statusTarget ? (completing
      ? `${statusTarget.goal.name} sudah mencapai nominal tujuan. Mutasi target akan dikunci tanpa mengubah saldo rekening.`
      : `${statusTarget.goal.name} akan kembali aktif. Jika progress masih 100%, sesuaikan nominal target bila rencana berubah. Eksekusi dana tetap dilakukan melalui Alokasi.`) : ""}
    confirmLabel={completing ? "Selesaikan target" : "Buka kembali"}
    tone="primary"
    busy={statusState.status === "submitting"}
    error={statusState.error}
    onCancel={() => statusState.status !== "submitting" && setStatusTarget(null)}
    onConfirm={applyGoalStatus}
  />;
};

const GoalConfirmations = ({ archiveTarget, archiveState, setArchiveTarget, applyGoalLifecycle, statusTarget, statusState, setStatusTarget, applyGoalStatus }) => <>
  <GoalStatusConfirmation statusTarget={statusTarget} statusState={statusState} setStatusTarget={setStatusTarget} applyGoalStatus={applyGoalStatus} />
  <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus target yang belum dipakai?" : "Arsipkan target?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.goal.name} masih Rp0 dan belum pernah memiliki mutasi maupun transaksi terkait.` : `${archiveTarget.goal.name} sudah memiliki histori. Target tidak dihapus permanen dan riwayat tetap tersimpan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan target"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={archiveTarget?.preview.canDeleteUnused ? "Saya memahami target ini belum pernah digunakan dan penghapusan bersifat permanen." : ""} busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyGoalLifecycle}>{archiveTarget ? <div className="notice notice--info">Progress saat ini <Money value={archiveTarget.preview.currentAmount} /> · mutasi historis {archiveTarget.preview.dependencies.movements} · transaksi terkait {archiveTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal>
</>;


export { GoalConfirmations, GoalCreateModal, GoalEditModal };
