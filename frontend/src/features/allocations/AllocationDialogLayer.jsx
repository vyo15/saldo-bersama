import { FiArrowRight, FiChevronDown, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { AdminIcon, BiweeklyIcon, CarryForwardIcon, CustomPeriodIcon, DailyIcon, MonthlyIcon, PaycycleIcon, PersonIcon, ReturnRemainderIcon, SharedIcon, WeeklyIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userOptionLabel } from "../../shared/presentation/user.js";

const envelopeAssigneeOptions = (form, accounts, users) => {
  const source = accounts.find((item) => item.account_id === form.source_account_id) || null;
  if (source?.owner_scope !== "personal") return { options: users, locked: false };
  const existing = users.find((item) => item.user_id === source.owner_user_id);
  const fallback = existing || {
    user_id: source.owner_user_id,
    name: source.owner_name || "Pemilik rekening",
    option_label: `${source.owner_name || "Pemilik rekening"} · Pemilik rekening`,
  };
  return { options: fallback.user_id ? [fallback] : [], locked: true };
};

const assigneeOptionLabel = (item) => item.option_label || userOptionLabel(item);

const CreateEnvelopeModal = ({ open, close, createForm, setCreateForm, accounts, users, usersStatus, createEnvelope, createMutation, message }) => {
  const assigneeState = envelopeAssigneeOptions(createForm, accounts, users);
  const assigneeOptions = [
    ...(!assigneeState.locked ? [{ value: "", label: "Bersama", icon: SharedIcon, description: "Jatah bersama" }] : []),
    ...assigneeState.options.map((item) => ({ value: item.user_id, label: assigneeOptionLabel(item), icon: item.role === "owner" ? AdminIcon : PersonIcon, description: item.role === "owner" ? "Administrator" : "Member" })),
  ];
  const periodOptions = [
    { value: "daily", label: "Harian", icon: DailyIcon },
    { value: "weekly", label: "Mingguan", icon: WeeklyIcon },
    { value: "biweekly", label: "Dua mingguan", icon: BiweeklyIcon },
    { value: "monthly", label: "Bulanan", icon: MonthlyIcon },
    { value: "paycycle", label: "Periode gajian", icon: PaycycleIcon },
    { value: "custom", label: "Khusus", icon: CustomPeriodIcon },
  ];
  const rolloverOptions = [
    { value: "unallocated", label: "Kembalikan sisa", icon: ReturnRemainderIcon, description: "Kembali ke belum dialokasikan" },
    { value: "carry", label: "Bawa ke depan", icon: CarryForwardIcon, description: "Bawa ke periode berikutnya" },
  ];
  const changeSource = (sourceAccountId) => {
    const source = accounts.find((item) => item.account_id === sourceAccountId) || null;
    setCreateForm((current) => ({
      ...current,
      source_account_id: sourceAccountId,
      assignee_user_id: source?.owner_scope === "personal" ? source.owner_user_id || "" : current.assignee_user_id,
    }));
  };
  return <Modal open={open} onClose={close} dismissible={!createMutation.busy} title="Buat kantong" footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="create-envelope-form" loading={createMutation.busy}>Buat kantong</Button></>}>
    <form id="create-envelope-form" className="form-grid allocation-create-form" onSubmit={createEnvelope}>
      <label className="field form-grid__full"><span>Nama kantong *</span><input required maxLength="100" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Jatah makan bulanan" /></label>
      <MoneyInput id="envelope-default" label="Nominal alokasi" value={createForm.default_amount} onChange={(value) => setCreateForm((current) => ({ ...current, default_amount: value }))} />
      <label className="field"><span>Rekening sumber</span><select value={createForm.source_account_id} onChange={(event) => changeSource(event.target.value)}><option value="">Gabungan rekening bersama</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label>
      <VisualChoiceGroup className="form-grid__full" legend="Jatah untuk" name="allocation-assignee" value={createForm.assignee_user_id} onChange={(assignee_user_id) => setCreateForm((current) => ({ ...current, assignee_user_id }))} options={assigneeOptions} columns={Math.min(assigneeOptions.length, 3)} disabled={usersStatus === "loading" || assigneeState.locked} helper={assigneeState.locked ? "Rekening personal hanya dapat dialokasikan untuk pemilik rekening tersebut." : usersStatus === "loading" ? "Memuat pengguna aktif..." : "Pilih Bersama, Administrator, atau Member yang menerima jatah."} />
      <details className="allocation-advanced form-grid__full">
        <summary><span><strong>Periode dan rollover</strong><small>{createForm.period_start} – {createForm.period_end}</small></span><FiChevronDown aria-hidden="true" /></summary>
        <div className="allocation-advanced__content">
          <VisualChoiceGroup className="form-grid__full" legend="Periode jatah" name="allocation-period" value={createForm.period_type} onChange={(period_type) => setCreateForm((current) => ({ ...current, period_type }))} options={periodOptions} columns={3} compact />
          <VisualChoiceGroup className="form-grid__full" legend="Rollover" name="allocation-rollover" value={createForm.rollover_policy} onChange={(rollover_policy) => setCreateForm((current) => ({ ...current, rollover_policy }))} options={rolloverOptions} columns={2} compact />
          <label className="field"><span>Mulai periode</span><input type="date" value={createForm.period_start} onChange={(event) => setCreateForm((current) => ({ ...current, period_start: event.target.value }))} /></label>
          <label className="field"><span>Akhir periode</span><input type="date" value={createForm.period_end} onChange={(event) => setCreateForm((current) => ({ ...current, period_end: event.target.value }))} /></label>
        </div>
      </details>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>;
};

const MoveEnvelopeModal = ({ open, close, move, setMove, items, destinations, submitMove, moveMutation, message, assigneeLabel }) => <Modal open={open} onClose={close} dismissible={!moveMutation.busy} title="Pindahkan alokasi" footer={<><Button type="button" disabled={moveMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiArrowRight} type="submit" form="move-envelope-form" loading={moveMutation.busy}>Pindahkan</Button></>}><form id="move-envelope-form" className="form-grid" onSubmit={submitMove}><label className="field"><span>Dari kantong *</span><select required value={move.fromEnvelopePeriodId} onChange={(event) => setMove((current) => ({ ...current, fromEnvelopePeriodId: event.target.value, toEnvelopePeriodId: "" }))}><option value="">Pilih sumber</option>{items.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name} · {assigneeLabel(item)} · sisa Rp {Number(item.remaining_amount || 0).toLocaleString("id-ID")}</option>)}</select></label><label className="field"><span>Ke kantong *</span><select required value={move.toEnvelopePeriodId} onChange={(event) => setMove((current) => ({ ...current, toEnvelopePeriodId: event.target.value }))}><option value="">Pilih tujuan</option>{destinations.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name} · {assigneeLabel(item)}</option>)}</select></label><MoneyInput id="move-amount" label="Nominal dipindahkan" value={move.amount} onChange={(amount) => setMove((current) => ({ ...current, amount }))} /><label className="field form-grid__full"><span>Alasan *</span><input required value={move.reason} maxLength="160" onChange={(event) => setMove((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: sisa jatah mingguan" /></label>{message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}</form></Modal>;


const AllocationModals = (p) => <><ConfirmationModal open={Boolean(p.closeTarget)} title="Tutup periode kantong?" description={p.closeTarget ? `${p.closeTarget.name} (${p.closeTarget.period_start}–${p.closeTarget.period_end}) akan dikunci. ${p.closeTarget.rollover_policy === "carry" ? "Sisa alokasi akan dibawa ke periode berikutnya." : "Sisa alokasi akan kembali menjadi dana belum dialokasikan."}` : ""} confirmLabel="Tutup periode" busy={p.closeState.status === "submitting"} error={p.closeState.error} onCancel={() => p.closeState.status !== "submitting" && p.setCloseTarget(null)} onConfirm={p.closeEnvelope} /><ConfirmationModal open={Boolean(p.archiveTarget)} title={p.archiveTarget?.preview.canDeleteUnused ? "Hapus kantong yang belum dipakai?" : "Arsipkan aturan kantong?"} description={p.archiveTarget ? (p.archiveTarget.preview.canDeleteUnused ? `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} hanya memiliki periode awal kosong dan belum pernah memiliki transaksi, mutasi, penutupan, atau anggaran terkait.` : `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} sudah memiliki histori atau dependency. Data tidak dihapus permanen dan hanya diarsipkan.`) : ""} confirmLabel={p.archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan aturan"} reasonLabel={p.archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan arsip"} requireReason acknowledgementLabel={p.archiveTarget?.preview.canDeleteUnused ? "Saya memahami kantong ini belum pernah digunakan dan penghapusan bersifat permanen." : ""} busy={p.archiveState.status === "submitting"} error={p.archiveState.error} onCancel={() => p.archiveState.status !== "submitting" && p.setArchiveTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveTarget ? <div className="notice notice--info">Periode {p.archiveTarget.preview.dependencies.periods} · transaksi {p.archiveTarget.preview.dependencies.transactions} · mutasi/rollover {p.archiveTarget.preview.dependencies.movements} · anggaran {p.archiveTarget.preview.dependencies.budgets} · periode ditutup {p.archiveTarget.preview.dependencies.closed_periods}.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan mutasi alokasi?" description={p.reverseTarget ? `${p.reverseTarget.from_name} → ${p.reverseTarget.to_name}. Dana akan dikembalikan hanya jika belum terpakai atau dipesan.` : ""} confirmLabel="Batalkan mutasi" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reverseMovement} /></>;

const AllocationDialogLayer = ({
  createOpen, closeCreate, createForm, setCreateForm, accounts, activeUsers, usersStatus, createEnvelope, createMutation, message,
  moveOpen, closeMove, move, setMove, movableItems, destinations, submitMove, moveMutation, assigneeLabel,
  modalProps,
}) => (
  <>
    <CreateEnvelopeModal open={createOpen} close={closeCreate} createForm={createForm} setCreateForm={setCreateForm} accounts={accounts} users={activeUsers} usersStatus={usersStatus} createEnvelope={createEnvelope} createMutation={createMutation} message={message} />
    <MoveEnvelopeModal open={moveOpen} close={closeMove} move={move} setMove={setMove} items={movableItems} destinations={destinations} submitMove={submitMove} moveMutation={moveMutation} message={message} assigneeLabel={assigneeLabel} />
    <AllocationModals {...modalProps} />
  </>
);

export default AllocationDialogLayer;
