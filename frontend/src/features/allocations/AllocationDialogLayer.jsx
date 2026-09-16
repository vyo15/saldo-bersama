import { useState } from "react";
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiEdit3, FiGrid, FiPlus, FiRepeat, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { AccountIcon, CarryForwardIcon, ReturnRemainderIcon, SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineOwnershipPicker from "../../components/common/InlineOwnershipPicker.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import { accountOptionVisual, allocationOptionVisual, categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { allocationAssigneeLabel } from "./allocationPresentation.js";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { allocationClass } from "./allocationStyles.js";
import { ALLOCATION_DECORATIONS, allocationDecoration } from "./allocationDecorations.js";
import { ALLOCATION_CREATE_NEED_LIMIT, createAllocationNeedDraft } from "./allocationNeedDraft.js";
import { budgetBatchScheduleLabel } from "../budgets/budgetBatchModel.js";
import needStyles from "../budgets/BudgetBatchEditor.module.css";

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

const rolloverOptions = [
  { value: "unallocated", label: "Kembalikan ke dana tersedia", icon: ReturnRemainderIcon, description: "Sisa dilepas dari alokasi" },
  { value: "carry", label: "Tetap di alokasi berikutnya", icon: CarryForwardIcon, description: "Sisa dibawa ke periode berikutnya" },
];

const assigneeDisplayName = (item) => String(item?.name || item?.email || "Pengguna").trim();

const buildAssigneeOptions = (assigneeState) => [
  ...(!assigneeState.locked ? [{
    value: "",
    label: "Bersama",
    icon: SharedIcon,
    description: "Digunakan oleh semua anggota",
  }] : []),
  ...assigneeState.options.map((item) => ({
    value: item.user_id,
    label: assigneeDisplayName(item),
    user: item,
    badge: item.role ? `${userRoleLabel(item.role)}${item.is_current ? " · saya" : ""}` : "",
    badgeTone: item.role === "owner" ? "primary" : "neutral",
    description: assigneeState.locked
      ? "Mengikuti pemilik rekening sumber"
      : item.is_current ? "Digunakan oleh saya" : "Digunakan oleh anggota ini",
  })),
];

const AllocationDecorationPicker = ({ name, value, onChange }) => {
  const automatic = allocationDecoration({ decorationKey: "auto", name, id: name });
  return <fieldset className={allocationClass("allocation-decoration form-grid__full")}>
    <legend>Pemanis kartu</legend>
    <div className={allocationClass("allocation-decoration__grid")}>
      {ALLOCATION_DECORATIONS.map((option) => {
        const selected = value === option.key;
        const asset = option.key === "auto" ? automatic.asset : option.asset;
        return <button key={option.key} type="button" className={allocationClass(`allocation-decoration__choice${selected ? " is-active" : ""}`)} aria-pressed={selected} onClick={() => onChange(option.key)}>
          <span className={allocationClass("allocation-decoration__visual")}>{asset ? <img src={asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /> : <FiGrid aria-hidden="true" />}</span>
          <span>{option.label}</span>
        </button>;
      })}
    </div>
  </fieldset>;
};

const createNeedsTotal = (needs) => (needs || []).reduce((total, need) => {
  const amount = Number(String(need.amount || "").replace(/\D/g, ""));
  return total + (Number.isFinite(amount) ? amount : 0);
}, 0);

const CreateEnvelopeFooter = ({ close, createMutation }) => <>
  <Button type="button" disabled={createMutation.busy} onClick={close}>Batal</Button>
  <Button variant="primary" icon={FiPlus} type="submit" form="create-envelope-form" loading={createMutation.busy}>Simpan Alokasi</Button>
</>;

const NEED_RECORDING_OPTIONS = Object.freeze([
  { value: "flexible", label: "Bisa dipakai beberapa kali", icon: FiEdit3 },
  { value: "fixed_once", label: "Sekali bayar", icon: FiCheckCircle },
  { value: "recurring", label: "Rutin", icon: FiRepeat },
]);

const NEED_FREQUENCY_OPTIONS = Object.freeze([
  { value: "weekly", label: "Mingguan" },
  { value: "biweekly", label: "Dua mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "bimonthly", label: "Dua bulanan" },
  { value: "quarterly", label: "Tiga bulanan" },
  { value: "semiannual", label: "Semester" },
  { value: "annual", label: "Tahunan" },
]);

const NEED_PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Tunai" },
  { value: "ewallet", label: "E-wallet" },
]);

const allocationNeedScheduleLabel = (need) => {
  if (need?.recording_mode === "fixed_once") return "Sekali bayar";
  if (need?.recording_mode === "recurring") return "Rutin";
  return "Bisa dipakai beberapa kali";
};

const AllocationNeedAmountInput = ({ need, update }) => {
  const numeric = need.amount === "" ? "" : Number(need.amount || 0);
  const value = numeric === "" ? "" : String(numeric).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return <label className={needStyles.fieldBlock}>
    <span>Nominal</span>
    <span className={needStyles.amountField}>
      <span className={needStyles.currency} aria-hidden="true">Rp</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder="0"
        aria-label="Nominal kebutuhan"
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) return update({ amount: "" });
          try { return update({ amount: parseRupiah(raw) }); } catch { return update({ amount: raw.replace(/[^0-9]/g, "") }); }
        }}
      />
    </span>
  </label>;
};

const AllocationNeedUsageFields = ({ need, update }) => <>
  <details className={needStyles.usageDetails}>
    <summary><span>Cara penggunaan</span><strong>{allocationNeedScheduleLabel(need)}</strong></summary>
    <div className={needStyles.usageDetailsContent}>
      <div className={needStyles.modeBlock}>
        <span className={needStyles.fieldLabel}>Cara penggunaan</span>
        <div className={needStyles.recordingMode} role="group" aria-label="Cara penggunaan">
          {NEED_RECORDING_OPTIONS.map(({ value, label, icon: Icon }) => <button
            key={value}
            type="button"
            className={need.recording_mode === value ? needStyles.recordingActive : ""}
            aria-pressed={need.recording_mode === value}
            onClick={() => update({ recording_mode: value })}
          ><Icon aria-hidden="true" /><span>{label}</span></button>)}
        </div>
      </div>
      {need.recording_mode === "recurring" ? <div className={needStyles.scheduleGrid}>
        <SelectionField compact label="Frekuensi" value={need.schedule_frequency} onChange={(schedule_frequency) => update({ schedule_frequency })} options={NEED_FREQUENCY_OPTIONS} />
        <label className="field"><span>Jatuh tempo *</span><input type="number" min="1" max="31" value={need.schedule_due_day ?? ""} onChange={(event) => update({ schedule_due_day: event.target.value })} /></label>
        <label className="field"><span>Mulai *</span><TemporalInput type="date" value={need.schedule_start_date || ""} onChange={(event) => update({ schedule_start_date: event.target.value })} /></label>
        <SelectionField compact label="Metode" value={need.schedule_payment_method} onChange={(schedule_payment_method) => update({ schedule_payment_method })} options={NEED_PAYMENT_METHOD_OPTIONS} />
      </div> : null}
    </div>
  </details>
</>;

const AllocationNeedEditorRow = ({ need, index, categories, updateNeed, removeNeed }) => {
  const update = (updates) => updateNeed(need.id, updates);
  return <div className={needStyles.editor} data-allocation-create-need={need.id}>
    <div className={needStyles.editorTopline}><span>Kebutuhan {index + 1}</span><button type="button" className={needStyles.trashButton} onClick={() => removeNeed(need.id)} aria-label={`Hapus kebutuhan ${index + 1}`}><FiTrash2 aria-hidden="true" /></button></div>
    <div className={needStyles.primaryFields}>
      <label className={needStyles.fieldBlock}>
        <span>Nama kebutuhan</span>
        <input className={needStyles.nameInput} required maxLength="100" value={need.name || ""} placeholder="Contoh: Arisan PT" autoComplete="off" onChange={(event) => update({ name: event.target.value })} />
      </label>
      <AllocationNeedAmountInput need={need} update={update} />
    </div>
    <div className={needStyles.categoryBlock}>
      <InlineSelectionPicker
        label="Kategori"
        required
        value={need.category_id}
        onChange={(category_id) => update({ category_id })}
        placeholder="Pilih kategori"
        searchable={categories.length > 8}
        searchPlaceholder="Cari kategori…"
        options={categories.map((category) => ({ value: category.category_id, label: category.name, ...categoryOptionVisual(category) }))}
      />
    </div>
    <AllocationNeedUsageFields need={need} update={update} />
  </div>;
};

const AllocationNeedCompactRow = ({ need, category, onEdit, onRemove }) => <div className={needStyles.compactRow}>
  <button type="button" className={needStyles.compactMain} onClick={onEdit}>
    <span className={needStyles.compactCopy}><strong>{need.name || "Kebutuhan tanpa nama"}</strong><small>{category?.name || "Pilih kategori"} · {budgetBatchScheduleLabel(need)}</small></span>
    <strong className={needStyles.compactAmount}>{formatRupiah(need.amount || 0)}</strong>
  </button>
  <button type="button" className={needStyles.compactRemove} onClick={onRemove} aria-label={`Hapus ${need.name || "kebutuhan"}`}><FiTrash2 aria-hidden="true" /></button>
</div>;

const AllocationCreateNeeds = ({ needs, setNeeds, categories, sourceAccount }) => {
  const [activeNeedId, setActiveNeedId] = useState(() => needs[0]?.id || "");
  const total = createNeedsTotal(needs);
  const available = Math.max(0, Number(sourceAccount?.available_balance ?? sourceAccount?.balance ?? 0));
  const shortage = Math.max(0, total - available);
  const updateNeed = (id, updates) => setNeeds((current) => current.map((need) => need.id === id ? { ...need, ...updates } : need));
  const removeNeed = (id) => {
    if (needs.length <= 1) {
      const replacement = createAllocationNeedDraft();
      setNeeds([replacement]);
      setActiveNeedId(replacement.id);
      return;
    }
    const next = needs.filter((need) => need.id !== id);
    setNeeds(next);
    if (activeNeedId === id) setActiveNeedId(next.at(-1)?.id || "");
  };
  const addNeed = () => {
    if (needs.length >= ALLOCATION_CREATE_NEED_LIMIT) return;
    const next = createAllocationNeedDraft();
    setNeeds((current) => [...current, next]);
    setActiveNeedId(next.id);
  };
  const categoryLookup = new Map(categories.map((category) => [category.category_id, category]));
  return <section className={allocationClass("allocation-create-needs form-grid__full")} aria-label="Kebutuhan">
    <div className={needStyles.rows}>
      {needs.map((need, index) => need.id === activeNeedId
        ? <AllocationNeedEditorRow key={need.id} need={need} index={index} categories={categories} updateNeed={updateNeed} removeNeed={removeNeed} />
        : <AllocationNeedCompactRow key={need.id} need={need} category={categoryLookup.get(need.category_id)} onEdit={() => setActiveNeedId(need.id)} onRemove={() => removeNeed(need.id)} />)}
    </div>
    <button type="button" className={needStyles.addButton} onClick={addNeed} disabled={needs.length >= ALLOCATION_CREATE_NEED_LIMIT}><FiPlus aria-hidden="true" /><span>Tambah kebutuhan lain</span></button>
    <div className={allocationClass("allocation-create-funding")}>
      <div><span>Perlu disiapkan</span><strong>{formatRupiah(total)}</strong></div>
      <div><span>Tersedia di {sourceAccount?.name || "rekening"}</span><strong>{formatRupiah(available)}</strong></div>
      {shortage > 0
        ? <div role="status"><span>Masih kurang</span><strong>{formatRupiah(shortage)}</strong></div>
        : <div role="status"><span>Sisa setelah dialokasikan</span><strong>{formatRupiah(Math.max(0, available - total))}</strong></div>}
    </div>
  </section>;
};

const CreateEnvelopeForm = ({
  createForm,
  setCreateForm,
  createNeeds,
  setCreateNeeds,
  categories,
  accounts,
  usersStatus,
  assigneeState,
  assigneeOptions,
  onChangeSource,
  message,
  createEnvelope,
}) => {
  const sourceAccount = accounts.find((account) => account.account_id === createForm.source_account_id) || null;
  return <form id="create-envelope-form" className={allocationClass("form-grid allocation-create-form")} onSubmit={createEnvelope}>
    <label className="field form-grid__full"><span>Untuk apa uang ini? *</span><input required maxLength="100" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Rumah Tangga" /></label>
    <InlineSelectionPicker className="form-grid__full" label="Dari rekening" required value={createForm.source_account_id} onChange={onChangeSource} placeholder="Pilih rekening" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" options={accounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`, ...accountOptionVisual(account) }))} />
{!assigneeState.locked ? <InlineOwnershipPicker className="form-grid__full" legend="Digunakan oleh" required value={createForm.assignee_user_id} onChange={(assignee_user_id) => setCreateForm((current) => ({ ...current, assignee_user_id }))} options={assigneeOptions} disabled={usersStatus === "loading"} helper={usersStatus === "loading" ? "Memuat pengguna aktif..." : ""} /> : null}
    <AllocationCreateNeeds needs={createNeeds} setNeeds={setCreateNeeds} categories={categories} sourceAccount={sourceAccount} />
    <AllocationDecorationPicker name={createForm.name} value={createForm.decoration_key} onChange={(decoration_key) => setCreateForm((current) => ({ ...current, decoration_key }))} />
    <VisualChoiceGroup className="form-grid__full" legend="Sisa saat periode berakhir" name="allocation-rollover" value={createForm.rollover_policy} onChange={(rollover_policy) => setCreateForm((current) => ({ ...current, rollover_policy }))} options={rolloverOptions} columns={2} compact />
    {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
  </form>;
};

const CreateEnvelopeModal = ({ open, close, createForm, setCreateForm, createNeeds, setCreateNeeds, categories, accounts, users, usersStatus, createEnvelope, createMutation, message }) => {
  const assigneeState = envelopeAssigneeOptions(createForm, accounts, users);
  const assigneeOptions = buildAssigneeOptions(assigneeState);
  const guard = useUnsavedChangesGuard({ open, value: { createForm, createNeeds }, onClose: close, blocked: createMutation.busy });
  const changeSource = (sourceAccountId) => {
    const source = accounts.find((item) => item.account_id === sourceAccountId) || null;
    setCreateForm((current) => ({ ...current, source_account_id: sourceAccountId, assignee_user_id: source?.owner_scope === "personal" ? source.owner_user_id || "" : "" }));
  };
  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="Alokasi Dana" dismissible={!createMutation.busy} title="Tambah Alokasi" footer={<CreateEnvelopeFooter close={guard.discardAndClose} createMutation={createMutation} />}>
    <CreateEnvelopeForm createForm={createForm} setCreateForm={setCreateForm} createNeeds={createNeeds} setCreateNeeds={setCreateNeeds} categories={categories} accounts={accounts} usersStatus={usersStatus} assigneeState={assigneeState} assigneeOptions={assigneeOptions} onChangeSource={changeSource} message={message} createEnvelope={createEnvelope} />
  </Modal>;
};

const MoveEnvelopeModal = ({ open, close, move, setMove, items, destinations, submitMove, moveMutation, message }) => {
  const guard = useUnsavedChangesGuard({ open, value: move, onClose: close, blocked: moveMutation.busy });
  return <>
    <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="pemindahan dana" dismissible={!moveMutation.busy} title="Pindahkan dana" footer={<><Button type="button" disabled={moveMutation.busy} onClick={guard.discardAndClose}>Batal</Button><Button variant="primary" icon={FiArrowRight} type="submit" form="move-envelope-form" loading={moveMutation.busy}>Pindahkan dana</Button></>}><form id="move-envelope-form" className="form-grid" onSubmit={submitMove}>
      <InlineSelectionPicker label="Dari alokasi" required value={move.fromEnvelopePeriodId} onChange={(fromEnvelopePeriodId) => setMove((current) => ({ ...current, fromEnvelopePeriodId, toEnvelopePeriodId: "" }))} placeholder="Pilih sumber" placeholderOption={allocationOptionVisual()} searchable={items.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={items.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)} · sisa ${formatRupiah(item.remaining_amount || 0)}`, ...allocationOptionVisual() }))} />
      <InlineSelectionPicker label="Ke alokasi" required value={move.toEnvelopePeriodId} onChange={(toEnvelopePeriodId) => setMove((current) => ({ ...current, toEnvelopePeriodId }))} placeholder="Pilih tujuan" placeholderOption={allocationOptionVisual()} searchable={destinations.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={destinations.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)}`, ...allocationOptionVisual() }))} />
      <MoneyInput id="move-amount" label="Nominal dipindahkan" value={move.amount} onChange={(amount) => setMove((current) => ({ ...current, amount }))} />
      <label className="field form-grid__full"><span>Alasan *</span><input required value={move.reason} maxLength="160" onChange={(event) => setMove((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: prioritas kebutuhan berubah" /></label>
      {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
    </form></Modal>
  </>;
};


const AdjustAllocationModal = ({ target, close, form, setForm, submit, mutation, message }) => {
  const funding = form.direction === "fund";
  const committed = Math.max(0, Number(target?.used_amount || 0)) + Math.max(0, Number(target?.reserved_amount || 0));
  const removable = Math.max(0, Number(target?.allocated_amount || 0) - committed);
  const guard = useUnsavedChangesGuard({ open: Boolean(target), value: form, onClose: close, blocked: mutation.busy });
  return <>
    <Modal open={Boolean(target)} onClose={guard.requestClose} discardGuard={guard} discardSubject="penyesuaian dana" dismissible={!mutation.busy} title={funding ? "Tambah dana ke alokasi" : "Kembalikan dana alokasi"} description={target ? `${target.name} · ${target.source_account_name || "Rekening sumber"}` : ""} footer={<><Button type="button" disabled={mutation.busy} onClick={guard.discardAndClose}>Batal</Button><Button variant="primary" icon={funding ? FiPlus : FiArrowLeft} type="submit" form="adjust-envelope-form" loading={mutation.busy}>{funding ? "Tambah dana" : "Kembalikan"}</Button></>}>
      <form id="adjust-envelope-form" className="form-grid" onSubmit={submit}>
        <VisualChoiceGroup className="form-grid__full" legend="Aksi" name="allocation-adjustment-direction" value={form.direction} onChange={(direction) => setForm((current) => ({ ...current, direction, amount: "", reason: "" }))} options={[{ value: "fund", label: "Tambah dana", icon: FiPlus, description: "Dana tersedia → alokasi" }, { value: "release", label: "Kembalikan", icon: FiArrowLeft, description: "Alokasi → dana tersedia" }]} columns={2} descriptive />
        <MoneyInput id="allocation-adjustment-amount" label="Nominal" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} required />
        <div className="notice notice--info form-grid__full" role="status">{funding ? "Dana diambil dari saldo rekening yang belum dialokasikan. Saldo rekening tidak berubah." : `Maksimal ${formatRupiah(removable)} dapat dikembalikan tanpa menyentuh dana terpakai atau yang disiapkan untuk jadwal.`}</div>
        <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder={funding ? "Contoh: tambah dana bulan ini" : "Contoh: sisa tidak dibutuhkan"} /></label>
        {message ? <div className={`notice notice--${message.type} form-grid__full`} role="alert">{message.text}</div> : null}
      </form>
    </Modal>
  </>;
};


const AllocationModals = (p) => <><ConfirmationModal open={Boolean(p.archiveTarget)} title={p.archiveTarget?.preview.canDeleteUnused ? "Hapus Alokasi yang belum dipakai?" : "Arsipkan Alokasi?"} description={p.archiveTarget ? (p.archiveTarget.preview.canDeleteUnused ? `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} belum pernah digunakan sehingga dapat dihapus permanen.` : `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} sudah memiliki histori. Alokasi akan diarsipkan dari daftar aktif tanpa menghapus transaksi atau mutasi lama.`) : ""} confirmLabel={p.archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan Alokasi"} reasonLabel={p.archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason acknowledgementLabel={p.archiveTarget?.preview.canDeleteUnused ? "Saya memahami alokasi yang belum pernah digunakan ini akan dihapus permanen." : ""} busy={p.archiveState.status === "submitting"} error={p.archiveState.error} onCancel={() => p.archiveState.status !== "submitting" && p.setArchiveTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveTarget && !p.archiveTarget.preview.canDeleteUnused ? <div className="notice notice--info">Data historis tetap tersimpan. Jadwal dan penggunaan masa depan dari Alokasi ini dihentikan.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan pemindahan dana?" description={p.reverseTarget ? `${p.reverseTarget.from_name} → ${p.reverseTarget.to_name}. Dana akan dikembalikan hanya jika belum terpakai atau disiapkan untuk jadwal.` : ""} confirmLabel="Batalkan mutasi" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reverseMovement} /></>;


const AllocationDialogLayer = ({
  createOpen, closeCreate, createForm, setCreateForm, createNeeds, setCreateNeeds, expenseCategories, accounts, activeUsers, usersStatus, createEnvelope, createMutation, message,
  moveOpen, closeMove, move, setMove, movableItems, destinations, submitMove, moveMutation,
  adjustTarget, closeAdjust, adjustForm, setAdjustForm, submitAdjustment, adjustMutation,
  modalProps,
}) => (
  <>
    <CreateEnvelopeModal open={createOpen} close={closeCreate} createForm={createForm} setCreateForm={setCreateForm} createNeeds={createNeeds} setCreateNeeds={setCreateNeeds} categories={expenseCategories} accounts={accounts} users={activeUsers} usersStatus={usersStatus} createEnvelope={createEnvelope} createMutation={createMutation} message={message} />
    <MoveEnvelopeModal open={moveOpen} close={closeMove} move={move} setMove={setMove} items={movableItems} destinations={destinations} submitMove={submitMove} moveMutation={moveMutation} message={message} />
    <AdjustAllocationModal target={adjustTarget} close={closeAdjust} form={adjustForm} setForm={setAdjustForm} submit={submitAdjustment} mutation={adjustMutation} message={message} />
    <AllocationModals {...modalProps} />
  </>
);

export default AllocationDialogLayer;
