import { FiArrowLeft, FiArrowRight, FiGrid, FiPlus, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { AccountIcon, CarryForwardIcon, ReturnRemainderIcon, SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineOwnershipPicker from "../../components/common/InlineOwnershipPicker.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { accountOptionVisual, allocationOptionVisual, categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { allocationAssigneeLabel } from "./allocationPresentation.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { allocationClass } from "./allocationStyles.js";
import { ALLOCATION_DECORATIONS, allocationDecoration } from "./allocationDecorations.js";

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
    <small>Pemanis hanya membedakan kartu secara visual. Warna, saldo, dan tema aplikasi tidak berubah.</small>
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

const AllocationCreateNeeds = ({ needs, setNeeds, categories, sourceAccount }) => {
  const total = createNeedsTotal(needs);
  const available = Math.max(0, Number(sourceAccount?.available_balance ?? sourceAccount?.balance ?? 0));
  const funded = Math.min(total, available);
  const shortage = Math.max(0, total - available);
  const updateNeed = (id, updates) => setNeeds((current) => current.map((need) => need.id === id ? { ...need, ...updates } : need));
  const removeNeed = (id) => setNeeds((current) => current.length <= 1 ? current : current.filter((need) => need.id !== id));
  const addNeed = () => setNeeds((current) => [...current, { id: `allocation-create-need-${Date.now()}-${current.length}`, name: "", category_id: "", amount: "" }]);
  return <section className={allocationClass("allocation-create-needs form-grid__full")} aria-labelledby="allocation-create-needs-title">
    <div className={allocationClass("allocation-create-needs__header")}><div><h3 id="allocation-create-needs-title">Kebutuhan</h3><p>Tambahkan kebutuhan utama. Totalnya menjadi dana yang perlu disiapkan.</p></div><Button type="button" icon={FiPlus} onClick={addNeed}>Tambah kebutuhan</Button></div>
    <div className={allocationClass("allocation-create-needs__list")}>
      {needs.map((need, index) => <div className={allocationClass("allocation-create-need")} key={need.id}>
        <label className="field"><span>Nama kebutuhan {index + 1}</span><input required maxLength="100" value={need.name} onChange={(event) => updateNeed(need.id, { name: event.target.value })} placeholder="Contoh: Belanja bulanan" /></label>
        <InlineSelectionPicker label="Kategori" required value={need.category_id} onChange={(category_id) => updateNeed(need.id, { category_id })} placeholder="Pilih kategori" placeholderMeta="Kategori pengeluaran" searchable={categories.length > 8} searchPlaceholder="Cari kategori…" options={categories.map((category) => ({ value: category.category_id, label: category.name, ...categoryOptionVisual(category) }))} />
        <MoneyInput id={`allocation-create-need-amount-${need.id}`} label="Nominal" value={need.amount} onChange={(amount) => updateNeed(need.id, { amount })} required />
        {needs.length > 1 ? <Button className={allocationClass("allocation-create-need__remove")} type="button" icon={FiTrash2} onClick={() => removeNeed(need.id)}>Hapus</Button> : null}
      </div>)}
    </div>
    <div className={allocationClass("allocation-create-funding")}>
      <div><span>Total yang perlu disiapkan</span><strong>{formatRupiah(total)}</strong></div>
      <div><span>Dana tersedia di {sourceAccount?.name || "rekening"}</span><strong>{formatRupiah(available)}</strong></div>
      <div><span>Akan dialokasikan sekarang</span><strong>{formatRupiah(funded)}</strong></div>
      {shortage > 0 ? <p role="status"><strong>Masih kurang {formatRupiah(shortage)}.</strong> Alokasi tetap dapat disimpan; pembayaran otomatis hanya berjalan saat dana sudah cukup.</p> : <p role="status">Dana mencukupi. Sisa Dana Tersedia setelah disiapkan {formatRupiah(Math.max(0, available - total))}.</p>}
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
    <InlineSelectionPicker className="form-grid__full" label="Ambil dana dari" required value={createForm.source_account_id} onChange={onChangeSource} placeholder="Pilih rekening" placeholderMeta="Pilih rekening sumber dana" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" options={accounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`, ...accountOptionVisual(account) }))} />
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
  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="Alokasi Dana" dismissible={!createMutation.busy} title="Tambah Alokasi" description="Tentukan tujuan, kebutuhan, dan sumber dana dalam satu langkah." footer={<CreateEnvelopeFooter close={guard.discardAndClose} createMutation={createMutation} />}>
    <CreateEnvelopeForm createForm={createForm} setCreateForm={setCreateForm} createNeeds={createNeeds} setCreateNeeds={setCreateNeeds} categories={categories} accounts={accounts} usersStatus={usersStatus} assigneeState={assigneeState} assigneeOptions={assigneeOptions} onChangeSource={changeSource} message={message} createEnvelope={createEnvelope} />
  </Modal>;
};

const MoveEnvelopeModal = ({ open, close, move, setMove, items, destinations, submitMove, moveMutation, message }) => {
  const guard = useUnsavedChangesGuard({ open, value: move, onClose: close, blocked: moveMutation.busy });
  return <>
    <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="pemindahan dana" dismissible={!moveMutation.busy} title="Pindahkan dana" footer={<><Button type="button" disabled={moveMutation.busy} onClick={guard.discardAndClose}>Batal</Button><Button variant="primary" icon={FiArrowRight} type="submit" form="move-envelope-form" loading={moveMutation.busy}>Pindahkan dana</Button></>}><form id="move-envelope-form" className="form-grid" onSubmit={submitMove}>
      <InlineSelectionPicker label="Dari alokasi" required value={move.fromEnvelopePeriodId} onChange={(fromEnvelopePeriodId) => setMove((current) => ({ ...current, fromEnvelopePeriodId, toEnvelopePeriodId: "" }))} placeholder="Pilih sumber" placeholderMeta="Pilih Alokasi Dana sumber" placeholderOption={allocationOptionVisual()} searchable={items.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={items.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)} · sisa ${formatRupiah(item.remaining_amount || 0)}`, ...allocationOptionVisual() }))} />
      <InlineSelectionPicker label="Ke alokasi" required value={move.toEnvelopePeriodId} onChange={(toEnvelopePeriodId) => setMove((current) => ({ ...current, toEnvelopePeriodId }))} placeholder="Pilih tujuan" placeholderMeta="Pilih Alokasi Dana tujuan" placeholderOption={allocationOptionVisual()} searchable={destinations.length > 8} searchPlaceholder="Cari Alokasi Dana…" options={destinations.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: `${item.source_account_name || "Sumber belum ditentukan"} · ${allocationAssigneeLabel(item)}`, ...allocationOptionVisual() }))} />
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


const AllocationModals = (p) => <><ConfirmationModal open={Boolean(p.archiveTarget)} title="Hapus Alokasi?" description={p.archiveTarget ? (p.archiveTarget.preview.canDeleteUnused ? `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} belum pernah digunakan sehingga dapat dihapus permanen.` : `${p.archiveTarget.item.rule_name || p.archiveTarget.item.name} akan dihapus dari daftar aktif. Transaksi dan riwayat yang sudah terjadi tetap dipertahankan agar saldo historis tidak berubah.`) : ""} confirmLabel="Hapus Alokasi" reasonLabel="Alasan penghapusan" requireReason acknowledgementLabel={p.archiveTarget?.preview.canDeleteUnused ? "Saya memahami alokasi yang belum pernah digunakan ini akan dihapus permanen." : ""} busy={p.archiveState.status === "submitting"} error={p.archiveState.error} onCancel={() => p.archiveState.status !== "submitting" && p.setArchiveTarget(null)} onConfirm={p.applyRuleLifecycle}>{p.archiveTarget && !p.archiveTarget.preview.canDeleteUnused ? <div className="notice notice--info">Data historis tetap tersimpan. Jadwal dan penggunaan masa depan dari Alokasi ini dihentikan.</div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(p.reverseTarget)} title="Batalkan pemindahan dana?" description={p.reverseTarget ? `${p.reverseTarget.from_name} → ${p.reverseTarget.to_name}. Dana akan dikembalikan hanya jika belum terpakai atau disiapkan untuk jadwal.` : ""} confirmLabel="Batalkan mutasi" reasonLabel="Alasan pembatalan" requireReason busy={p.reverseState.status === "submitting"} error={p.reverseState.error} onCancel={() => p.reverseState.status !== "submitting" && p.setReverseTarget(null)} onConfirm={p.reverseMovement} /></>;


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
