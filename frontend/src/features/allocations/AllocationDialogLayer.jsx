import { FiArrowLeft, FiArrowRight, FiChevronDown, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { AdminIcon, BiweeklyIcon, CarryForwardIcon, CustomPeriodIcon, DailyIcon, MonthlyIcon, PaycycleIcon, PersonIcon, ReturnRemainderIcon, SharedIcon, WeeklyIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { allocationAssigneeLabel } from "./allocationPresentation.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userOptionLabel } from "../../shared/presentation/user.js";
import { allocationClass } from "./allocationStyles.js";

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
  const selectedSource = accounts.find((item) => item.account_id === createForm.source_account_id) || null;
  const availableAmount = Number(selectedSource?.available_balance ?? selectedSource?.balance ?? 0);
  const enteredAmount = Number(String(createForm.default_amount || "").replace(/\D/g, "")) || 0;
  const insufficientAmount = Boolean(selectedSource) && enteredAmount > availableAmount;
  const assigneeOptions = [
    ...(!assigneeState.locked ? [{ value: "", label: "Bersama", icon: SharedIcon, description: "Dana bersama" }] : []),
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
    { value: "unallocated", label: "Kembalikan ke dana tersedia", icon: ReturnRemainderIcon, description: "Sisa dilepas dari alokasi" },
    { value: "carry", label: "Tetap di alokasi berikutnya", icon: CarryForwardIcon, description: "Sisa dibawa ke periode berikutnya" },
  ];
  const changeSource = (sourceAccountId) => {
    const source = accounts.find((item) => item.account_id === sourceAccountId) || null;
    setCreateForm((current) => ({
      ...current,
      source_account_id: sourceAccountId,
      assignee_user_id: source?.owner_scope === "personal" ? source.owner_user_id || "" : current.assignee_user_id,
    }));
  };
  return <Modal open={open} onClose={close} dismissible={!createMutation.busy} title="Buat alokasi" footer={<><Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="create-envelope-form" loading={createMutation.busy} disabled={insufficientAmount}>Buat alokasi</Button></>}>
    <form id="create-envelope-form" className={allocationClass("form-grid allocation-create-form")} onSubmit={createEnvelope}>
      <label className="field form-grid__full"><span>Untuk apa? *</span><input required maxLength="100" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Kebutuhan rumah" /></label>
      <SelectionField
        className="form-grid__full"
        label="Ambil dana dari"
        required
        value={createForm.source_account_id}
        onChange={changeSource}
        placeholder="Pilih rekening"
        searchable={accounts.length > 8}
        searchPlaceholder="Cari rekening…"
        options={accounts.map((account) => ({
          value: account.account_id,
          label: accountDisplayLabel(account),
          meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`,
        }))}
        helper={selectedSource ? "Dana tetap berada di rekening ini; Alokasi Dana hanya memisahkan dana yang dapat digunakan." : "Pilih rekening agar dana tersedia terlihat sebelum menentukan nominal."}
      />
      <VisualChoiceGroup className="form-grid__full" legend="Digunakan oleh" name="allocation-assignee" value={createForm.assignee_user_id} onChange={(assignee_user_id) => setCreateForm((current) => ({ ...current, assignee_user_id }))} options={assigneeOptions} columns={Math.min(assigneeOptions.length, 3)} mobileColumns={Math.min(assigneeOptions.length, 2)} compact plainIcons disabled={usersStatus === "loading" || assigneeState.locked} helper={assigneeState.locked ? "Mengikuti pemilik rekening personal." : usersStatus === "loading" ? "Memuat pengguna aktif..." : ""} />
      {selectedSource ? <MoneyInput id="envelope-default" label="Dana awal" value={createForm.default_amount} onChange={(value) => setCreateForm((current) => ({ ...current, default_amount: value }))} required /> : null}
      {selectedSource && enteredAmount > 0 ? <div className={allocationClass("allocation-create-impact form-grid__full")} role="status"><span>Tersedia setelah dialokasikan</span><strong>{formatRupiah(Math.max(0, availableAmount - enteredAmount))}</strong></div> : null}
      {insufficientAmount ? <div className="notice notice--danger form-grid__full" role="alert">Dana tersedia kurang {formatRupiah(enteredAmount - availableAmount)}. Kurangi Dana awal sebelum membuat alokasi.</div> : null}
      <details className={allocationClass("allocation-advanced form-grid__full")}>
        <summary><span><strong>Periode dan sisa</strong><small>{createForm.period_start} – {createForm.period_end}</small></span><FiChevronDown aria-hidden="true" /></summary>
        <div className={allocationClass("allocation-advanced__content")}>
          <VisualChoiceGroup className="form-grid__full" legend="Periode alokasi" name="allocation-period" value={createForm.period_type} onChange={(period_type) => setCreateForm((current) => ({ ...current, period_type }))} options={periodOptions} columns={3} compact />
          <VisualChoiceGroup className="form-grid__full" legend="Sisa saat periode berakhir" name="allocation-rollover" value={createForm.rollover_policy} onChange={(rollover_policy) => setCreateForm((current) => ({ ...current, rollover_policy }))} options={rolloverOptions} columns={2} compact />
          <label className="field"><span>Mulai periode</span><input type="date" value={createForm.period_start} onChange={(event) => setCreateForm((current) => ({ ...current, period_start: event.target.value }))} /></label>
          <label className="field"><span>Akhir periode</span><input type="date" value={createForm.period_end} onChange={(event) => setCreateForm((current) => ({ ...current, period_end: event.target.value }))} /></label>
        </div>
      </details>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>;
};

const MoveEnvelopeModal = ({ open, close, move, setMove, items, destinations, submitMove, moveMutation, message }) => <Modal open={open} onClose={close} dismissible={!moveMutation.busy} title="Pindahkan dana" footer={<><Button type="button" disabled={moveMutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={FiArrowRight} type="submit" form="move-envelope-form" loading={moveMutation.busy}>Pindahkan dana</Button></>}><form id="move-envelope-form" className="form-grid" onSubmit={submitMove}>
  <SelectionField label="Dari alokasi" required value={move.fromEnvelopePeriodId} onChange={(fromEnvelopePeriodId) => setMove((current) => ({ ...current, fromEnvelopePeriodId, toEnvelopePeriodId: "" }))} placeholder="Pilih sumber" searchable={items.length > 8} options={items.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)} · sisa ${formatRupiah(item.remaining_amount || 0)}` }))} />
  <SelectionField label="Ke alokasi" required value={move.toEnvelopePeriodId} onChange={(toEnvelopePeriodId) => setMove((current) => ({ ...current, toEnvelopePeriodId }))} placeholder="Pilih tujuan" searchable={destinations.length > 8} options={destinations.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)}` }))} />
  <MoneyInput id="move-amount" label="Nominal dipindahkan" value={move.amount} onChange={(amount) => setMove((current) => ({ ...current, amount }))} />
  <label className="field form-grid__full"><span>Alasan *</span><input required value={move.reason} maxLength="160" onChange={(event) => setMove((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: prioritas kebutuhan berubah" /></label>
  {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
</form></Modal>;


const AdjustAllocationModal = ({ target, close, form, setForm, submit, mutation, message }) => {
  const funding = form.direction === "fund";
  const committed = Math.max(0, Number(target?.used_amount || 0)) + Math.max(0, Number(target?.reserved_amount || 0));
  const removable = Math.max(0, Number(target?.allocated_amount || 0) - committed);
  return <Modal open={Boolean(target)} onClose={close} dismissible={!mutation.busy} title={funding ? "Tambah dana ke alokasi" : "Kembalikan dana alokasi"} description={target ? `${target.name} · ${target.source_account_name || "Rekening sumber"}` : ""} footer={<><Button type="button" disabled={mutation.busy} onClick={close}>Batal</Button><Button variant="primary" icon={funding ? FiPlus : FiArrowLeft} type="submit" form="adjust-envelope-form" loading={mutation.busy}>{funding ? "Tambah dana" : "Kembalikan"}</Button></>}>
    <form id="adjust-envelope-form" className="form-grid" onSubmit={submit}>
      <VisualChoiceGroup className="form-grid__full" legend="Aksi" name="allocation-adjustment-direction" value={form.direction} onChange={(direction) => setForm((current) => ({ ...current, direction, amount: "", reason: "" }))} options={[{ value: "fund", label: "Tambah dana", icon: FiPlus, description: "Dana tersedia → alokasi" }, { value: "release", label: "Kembalikan", icon: FiArrowLeft, description: "Alokasi → dana tersedia" }]} columns={2} />
      <MoneyInput id="allocation-adjustment-amount" label="Nominal" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} required />
      <div className="notice notice--info form-grid__full" role="status">{funding ? "Dana diambil dari saldo rekening yang belum dialokasikan. Saldo rekening tidak berubah." : `Maksimal ${formatRupiah(removable)} dapat dikembalikan tanpa menyentuh dana terpakai atau dipesan.`}</div>
      <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder={funding ? "Contoh: tambah dana bulan ini" : "Contoh: sisa tidak dibutuhkan"} /></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form>
  </Modal>;
};


const ClosePeriodModal = (p) => {
  const target = p.closeTarget;
  const carrying = target?.rollover_policy === "carry";
  const close = () => {
    if (p.closeState.status === "submitting") return;
    p.setCloseReuseNeeds(false);
    p.setCloseTarget(null);
  };
  const description = target
    ? `${target.name} (${target.period_start}–${target.period_end}) akan dikunci. ${carrying ? "Sisa dana akan dibawa ke periode berikutnya." : "Sisa dana akan kembali menjadi dana tersedia."} Periode berikutnya tetap disiapkan agar alokasi tidak terputus.`
    : "";
  return <ConfirmationModal open={Boolean(target)} title="Tutup periode alokasi?" description={description} confirmLabel="Tutup periode" busy={p.closeState.status === "submitting"} error={p.closeState.error} onCancel={close} onConfirm={p.closeEnvelope}>
    {target ? <div className="notice notice--info" role="status">{carrying ? "Tidak ada dana baru yang ditambahkan otomatis. Hanya sisa periode ini yang dapat diteruskan." : "Periode berikutnya dimulai dengan Rp0. Tambahkan dana nanti saat sudah siap."}</div> : null}
    {p.closeCanReuseNeeds ? <label className="checkbox-field">
      <input type="checkbox" checked={p.closeReuseNeeds} disabled={p.closeState.status === "submitting"} onChange={(event) => p.setCloseReuseNeeds(event.target.checked)} />
      <span><strong>Pakai lagi {p.closeNeedsCount} kebutuhan di periode berikutnya</strong><small>Hanya kategori dan nominal rencana yang disalin. Transaksi, saldo, serta dana Alokasi tidak ikut dipindahkan.</small></span>
    </label> : null}
  </ConfirmationModal>;
};

const AllocationModals = (p) => <><ClosePeriodModal {...p} /><ConfirmationModal open={Boolean(p.archiveTarget)} title={p.archiveTarget?.preview.canDeleteUnused ? "Hapus alokasi yang belum dipakai?" : "Arsipkan aturan alokasi?"} description={p.archiveTarget ? (p.archiveTarget.preview.canDeleteUnused ? `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} hanya memiliki periode awal kosong dan belum pernah memiliki transaksi, mutasi, penutupan, atau Kebutuhan terkait.` : `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} sudah memiliki histori atau dependency. Data tidak dihapus permanen dan hanya diarsipkan.`) : ""} confirmLabel={p.archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan aturan"} reasonLabel={p.archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan arsip"} requireReason acknowledgementLabel={p.archiveTarget?.preview.canDeleteUnused ? "Saya memahami alokasi ini belum pernah digunakan dan penghapusan bersifat permanen." : ""} busy={p.archiveState.status === "submitting"} error={p.archiveState.error} onCancel={() => p.archiveState.status !== "submitting" && p.setArchiveTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveTarget ? <div className="notice notice--info">Periode {p.archiveTarget.preview.dependencies.periods} · transaksi {p.archiveTarget.preview.dependencies.transactions} · mutasi/rollover {p.archiveTarget.preview.dependencies.movements} · Kebutuhan {p.archiveTarget.preview.dependencies.budgets} · periode ditutup {p.archiveTarget.preview.dependencies.closed_periods}.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan pemindahan dana?" description={p.reverseTarget ? `${p.reverseTarget.from_name} → ${p.reverseTarget.to_name}. Dana akan dikembalikan hanya jika belum terpakai atau dipesan.` : ""} confirmLabel="Batalkan mutasi" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reverseMovement} /></>;


const AllocationDialogLayer = ({
  createOpen, closeCreate, createForm, setCreateForm, accounts, activeUsers, usersStatus, createEnvelope, createMutation, message,
  moveOpen, closeMove, move, setMove, movableItems, destinations, submitMove, moveMutation,
  adjustTarget, closeAdjust, adjustForm, setAdjustForm, submitAdjustment, adjustMutation,
  modalProps,
}) => (
  <>
    <CreateEnvelopeModal open={createOpen} close={closeCreate} createForm={createForm} setCreateForm={setCreateForm} accounts={accounts} users={activeUsers} usersStatus={usersStatus} createEnvelope={createEnvelope} createMutation={createMutation} message={message} />
    <MoveEnvelopeModal open={moveOpen} close={closeMove} move={move} setMove={setMove} items={movableItems} destinations={destinations} submitMove={submitMove} moveMutation={moveMutation} message={message} />
    <AdjustAllocationModal target={adjustTarget} close={closeAdjust} form={adjustForm} setForm={setAdjustForm} submit={submitAdjustment} mutation={adjustMutation} message={message} />
    <AllocationModals {...modalProps} />
  </>
);

export default AllocationDialogLayer;
