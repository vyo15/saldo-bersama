import { useState } from "react";
import { FiBell, FiCalendar, FiCheckCircle, FiEdit3, FiMoreHorizontal, FiPlus, FiRepeat } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineOwnershipPicker from "../../components/common/InlineOwnershipPicker.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatRupiah } from "../../domain/money.js";
import SelectionField from "../../components/common/SelectionField.jsx";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { DEFAULT_CATEGORY_ICON_BY_TYPE } from "../../shared/presentation/transaction.js";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { CategoryIconPicker } from "../categories/CategoryIconPicker.jsx";
import { createSharedCategory, requestSharedCategoryCreation } from "../../shared/workflows/categoryCreation.js";
import BudgetBatchEditor from "./BudgetBatchEditor.jsx";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

const RECORDING_MODE_OPTIONS = Object.freeze([
  { value: "flexible", label: "Fleksibel", icon: FiEdit3, description: "Bisa dicatat beberapa kali sesuai transaksi aktual." },
  { value: "fixed_once", label: "Sekali bayar", icon: FiCheckCircle, description: "Nominal otomatis terisi saat kebutuhan dicatat." },
  { value: "recurring", label: "Berulang", icon: FiRepeat, description: "Nominal menjadi bawaan pada jadwal pembayaran." },
]);

const SCHEDULE_FREQUENCY_OPTIONS = Object.freeze([
  { value: "weekly", label: "Mingguan" },
  { value: "biweekly", label: "Dua mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "bimonthly", label: "Dua bulanan" },
  { value: "quarterly", label: "Tiga bulanan" },
  { value: "semiannual", label: "Semester" },
  { value: "annual", label: "Tahunan" },
]);

const PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Tunai" },
  { value: "ewallet", label: "E-wallet" },
]);

const BudgetModalFooter = ({ saveState, close, pendingSchedule, existingBudget, funding, onAddBalance }) => {
  const submitLabel = pendingSchedule ? "Simpan jadwal" : existingBudget ? "Simpan perubahan" : "Simpan kebutuhan";
  return <>
    <Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button>
    {funding.shortageAmount > 0
      ? <Button variant="primary" type="button" disabled={!onAddBalance || saveState.status === "submitting"} onClick={() => onAddBalance?.(funding.shortageAmount)}>Tambah saldo {formatRupiah(funding.shortageAmount)}</Button>
      : <Button variant="primary" icon={pendingSchedule ? FiCalendar : FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{submitLabel}</Button>}
  </>;
};

const BudgetModalNotices = ({ pendingSchedule, lockedEnvelope, linksLegacyBudget }) => <>
  {pendingSchedule ? <CompactNotice className="form-grid__full" tone="warning" title="Kebutuhan sudah tersimpan.">Jadwal pembayaran belum berhasil dibuat. Simpan jadwal lagi tanpa membuat Kebutuhan duplikat.</CompactNotice> : null}
  {lockedEnvelope ? <CompactNotice className="form-grid__full" tone="info" title={`Alokasi Dana: ${lockedEnvelope.name}`}>Nama kebutuhan dan kategori disimpan terpisah. Transaksi dicatat ke kebutuhan yang dipilih tanpa mengubah kategori master.</CompactNotice> : null}
  {linksLegacyBudget ? <CompactNotice className="form-grid__full" tone="info" title="Kebutuhan lama ditemukan.">Menyimpan akan menghubungkan Kebutuhan lama yang belum memiliki Alokasi Dana ke alokasi ini. Riwayat transaksi tidak dipindahkan atau diubah.</CompactNotice> : null}
</>;

const BudgetScheduleFields = ({ form, setForm }) => <>
  <SelectionField label="Frekuensi" required value={form.schedule_frequency || "monthly"} onChange={(schedule_frequency) => setForm((current) => ({ ...current, schedule_frequency }))} options={SCHEDULE_FREQUENCY_OPTIONS} />
  <label className="field"><span>Tanggal jatuh tempo *</span><input required type="number" min="1" max="31" value={form.schedule_due_day ?? ""} onChange={(event) => setForm((current) => ({ ...current, schedule_due_day: event.target.value }))} /></label>
  <label className="field"><span>Tanggal mulai *</span><TemporalInput required type="date" value={form.schedule_start_date || ""} onChange={(event) => setForm((current) => ({ ...current, schedule_start_date: event.target.value }))} /></label>
  <SelectionField label="Metode pembayaran" required value={form.schedule_payment_method || "transfer"} onChange={(schedule_payment_method) => setForm((current) => ({ ...current, schedule_payment_method }))} options={PAYMENT_METHOD_OPTIONS} />
</>;

const ExistingBudgetActions = ({ existingBudget, canLifecycle, onReminder, onLifecycle }) => {
  if (!existingBudget) return null;
  return <div className="form-grid__full form-actions">
    <Button type="button" icon={FiBell} onClick={() => onReminder?.(existingBudget)}>Atur pengingat</Button>
    {canLifecycle ? <Button type="button" icon={FiMoreHorizontal} onClick={() => onLifecycle?.(existingBudget)}>Kelola kebutuhan</Button> : null}
  </div>;
};

const budgetOwnershipOptions = (users) => [
  { value: "shared", label: "Bersama", icon: SharedIcon, description: "Berlaku untuk semua anggota" },
  ...users.map((item) => ({
    value: `user:${item.user_id}`,
    label: String(item.name || item.email || "Pengguna").trim(),
    user: item,
    badge: `${userRoleLabel(item.role)}${item.is_current ? " · saya" : ""}`,
    badgeTone: item.role === "owner" ? "primary" : "neutral",
    description: item.is_current ? "Berlaku untuk saya" : "Berlaku untuk anggota ini",
  })),
];

const budgetEditFundingState = ({ form, existingBudget, lockedEnvelope, sourceAccount }) => {
  if (!lockedEnvelope || !existingBudget) return { additionalAmount: 0, availableAmount: 0, shortageAmount: 0, afterAmount: 0 };
  const nextAmount = Number(String(form.amount || "").replace(/\D/g, "")) || 0;
  const additionalAmount = Math.max(0, nextAmount - Number(existingBudget.amount || 0));
  const availableAmount = Math.max(0, Number(sourceAccount?.available_balance ?? sourceAccount?.balance ?? 0));
  return {
    additionalAmount,
    availableAmount,
    shortageAmount: Math.max(0, additionalAmount - availableAmount),
    afterAmount: Math.max(0, availableAmount - additionalAmount),
  };
};

const BudgetFundingNotices = ({ funding, sourceAccount }) => <>
  {funding.shortageAmount > 0 ? <CompactNotice className="form-grid__full" tone="danger" title={`Dana belum mencukupi ${formatRupiah(funding.shortageAmount)}`}>Tambahan kebutuhan memerlukan {formatRupiah(funding.additionalAmount)}, sementara Dana Tersedia {sourceAccount?.name || "rekening sumber"} {formatRupiah(funding.availableAmount)}. Tambahkan saldo atau kurangi nominal.</CompactNotice> : null}
  {funding.additionalAmount > 0 && funding.shortageAmount === 0 ? <CompactNotice className="form-grid__full" tone="info" title={`Tambahan ${formatRupiah(funding.additionalAmount)} akan dialokasikan otomatis`}>Dana Tersedia setelah perubahan menjadi {formatRupiah(funding.afterAmount)}. Saldo rekening fisik baru berubah saat transaksi dicatat.</CompactNotice> : null}
</>;

const BudgetOwnershipField = ({ lockedEnvelope, form, selectOwnership, ownershipOptions, usersStatus }) => {
  if (lockedEnvelope) return null;
  return <InlineOwnershipPicker className="form-grid__full" legend="Berlaku untuk" required value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} disabled={usersStatus === "loading"} helper={usersStatus === "loading" ? "Memuat pengguna aktif..." : ""} />;
};

const BudgetRecordingModeField = ({ existingBudget, form, setForm }) => {
  if (existingBudget) {
    const label = existingBudget.recording_mode === "fixed_once" ? "Sekali bayar" : existingBudget.recording_mode === "recurring" ? "Berulang" : "Fleksibel";
    return <CompactNotice className="form-grid__full" tone="info" title="Pola kebutuhan">{label}</CompactNotice>;
  }
  return <VisualChoiceGroup className="form-grid__full" legend="Pola kebutuhan" name="budget-recording-mode" value={form.recording_mode || "flexible"} onChange={(recording_mode) => setForm((current) => ({ ...current, recording_mode }))} options={RECORDING_MODE_OPTIONS} columns={3} mobileColumns={3} wrapLabels />;
};

const BudgetThresholdField = ({ lockedEnvelope, form, setForm }) => {
  if (lockedEnvelope) return null;
  return <label className="field"><span>Peringatan saat terpakai (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>;
};

const BudgetSaveError = ({ saveState }) => saveState.status === "error"
  ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div>
  : null;

const handleBudgetSubmit = (event, funding, saveBudget) => {
  if (funding.shortageAmount > 0) {
    event.preventDefault();
    return;
  }
  saveBudget(event);
};

const BudgetModal = ({ open, close, existingBudget, saveState, pendingSchedule, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership, lockedEnvelope, sourceAccount, onAddBalance, canLifecycle, onLifecycle, onReminder, onCreateCategory, categoryCreateLabel }) => {
  const ownershipOptions = budgetOwnershipOptions(users);
  const title = existingBudget ? "Edit kebutuhan" : "Tambah kebutuhan";
  const linksLegacyBudget = Boolean(lockedEnvelope && existingBudget && !existingBudget.envelope_rule_id);
  const showSchedule = !existingBudget && form.recording_mode === "recurring";
  const submitting = saveState.status === "submitting";
  const funding = budgetEditFundingState({ form, existingBudget, lockedEnvelope, sourceAccount });
  const guard = useUnsavedChangesGuard({ open, value: form, onClose: close, blocked: submitting });
  const categoryOptions = categories.map((item) => ({ value: item.category_id, label: item.name, meta: "Kategori pengeluaran", ...categoryOptionVisual(item) }));
  const categoryFooter = !existingBudget && onCreateCategory ? <Button type="button" icon={FiPlus} onClick={onCreateCategory}>{categoryCreateLabel}</Button> : null;

  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="Kebutuhan" dismissible={!submitting} title={title} footer={<BudgetModalFooter saveState={saveState} close={guard.discardAndClose} pendingSchedule={pendingSchedule} existingBudget={existingBudget} funding={funding} onAddBalance={onAddBalance} />}>
    <form id="budget-form" className="form-grid" onSubmit={(event) => handleBudgetSubmit(event, funding, saveBudget)}>
      <BudgetModalNotices pendingSchedule={pendingSchedule} lockedEnvelope={lockedEnvelope} linksLegacyBudget={linksLegacyBudget} />
      <label className="field"><span>Nama kebutuhan *</span><input required maxLength="100" placeholder="Contoh: Arisan PT" value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <MoneyInput id="budget-amount" label="Nominal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      <InlineSelectionPicker className="form-grid__full" label="Kategori" required value={form.category_id} onChange={selectCategory} locked={Boolean(existingBudget)} placeholder="Pilih kategori" placeholderMeta="Gunakan kategori master, misalnya Arisan" searchable={categories.length > 8} searchPlaceholder="Cari kategori…" options={categoryOptions} footer={categoryFooter} />
      <BudgetOwnershipField lockedEnvelope={lockedEnvelope} form={form} selectOwnership={selectOwnership} ownershipOptions={ownershipOptions} usersStatus={usersStatus} />
      <BudgetFundingNotices funding={funding} sourceAccount={sourceAccount} />
      <BudgetRecordingModeField existingBudget={existingBudget} form={form} setForm={setForm} />
      {showSchedule ? <BudgetScheduleFields form={form} setForm={setForm} /> : null}
      <BudgetThresholdField lockedEnvelope={lockedEnvelope} form={form} setForm={setForm} />
      <ExistingBudgetActions existingBudget={existingBudget} canLifecycle={canLifecycle} onReminder={onReminder} onLifecycle={onLifecycle} />
      <BudgetSaveError saveState={saveState} />
    </form>
  </Modal>;
};

const ExpenseCategoryCreateModal = ({ state }) => {
  const guard = useUnsavedChangesGuard({ open: state.open, value: state.form, onClose: state.close, blocked: state.status.status === "submitting" });
  return <Modal
    open={state.open}
    onClose={guard.requestClose}
    discardGuard={guard}
    discardSubject="kategori baru"
    dismissible={state.status.status !== "submitting"}
    title={state.requestMode ? "Ajukan kategori" : "Tambah kategori"}
    description="Kategori ini dapat dipakai oleh kebutuhan dan transaksi pengeluaran."
    size="lg"
    footer={<><Button onClick={guard.discardAndClose} disabled={state.status.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="budget-category-create-form" loading={state.status.status === "submitting"}>{state.requestMode ? "Kirim pengajuan" : "Simpan kategori"}</Button></>}
  >
    <form id="budget-category-create-form" className="form-grid" onSubmit={state.submit}>
      <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Arisan" value={state.form.name} onChange={(event) => state.setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <CategoryIconPicker value={state.form.icon} onChange={(icon) => state.setForm((current) => ({ ...current, icon }))} transactionType="expense" name={state.form.name} />
      {state.status.error ? <div className="notice notice--danger form-grid__full" role="alert">{state.status.error.message}</div> : null}
    </form>
  </Modal>;
};

const useExpenseCategoryCreator = ({ onCreated } = {}) => {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const { refreshBootstrap, invalidate } = useFinance();
  const requestMode = user?.role !== "owner";
  const initialForm = () => ({ name: "", transaction_type: "expense", icon: DEFAULT_CATEGORY_ICON_BY_TYPE.expense });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ status: "idle", error: null });
  const close = () => { if (status.status !== "submitting") { setOpen(false); setStatus({ status: "idle", error: null }); } };
  const submit = async (event) => {
    event.preventDefault();
    setStatus({ status: "submitting", error: null });
    try {
      const created = requestMode
        ? await requestSharedCategoryCreation(form, {})
        : await createSharedCategory(form, {});
      setForm(initialForm());
      setOpen(false);
      setStatus({ status: "idle", error: null });
      notify({ message: requestMode ? "Pengajuan kategori dikirim ke Administrator." : "Kategori berhasil dibuat dan siap dipilih.", tone: "success", dedupeKey: requestMode ? "budgets:category-request" : "budgets:category-create" });
      if (!requestMode) {
        invalidate(["categories.list", "bootstrap.get", "app.initialState"]);
        await refreshBootstrap({ invalidate: false });
        onCreated?.(created?.category_id || "");
      }
    } catch (error) { setStatus({ status: "error", error }); }
  };
  return { open, form, setForm, status, requestMode, openModal: () => { setStatus({ status: "idle", error: null }); setOpen(true); }, close, submit };
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title="Hapus kebutuhan?" description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum memiliki histori finansial, jadi dapat dibersihkan tanpa meninggalkan data operasional.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} akan hilang dari daftar aktif. Transaksi dan konteks laporan historis tetap tersimpan.`) : ""} confirmLabel="Hapus kebutuhan" reasonLabel="Alasan penghapusan" requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Terpakai {Number(archiveTarget.preview.used_amount || 0).toLocaleString("id-ID")} · dana yang aman dilepas {Number(archiveTarget.preview.releasable_amount || 0).toLocaleString("id-ID")} · transaksi histori {archiveTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, canLifecycle = false, categories, users, usersStatus, formController, lifecycleController, lockedEnvelope = null, sourceAccount = null, onAddBalance = null, onReminder }) => {
  const batchCreateOpen = formController.formOpen && canManage && formController.formMode === "create-batch" && Boolean(lockedEnvelope);
  const selectCreatedCategory = (categoryId) => {
    if (!categoryId) return;
    if (batchCreateOpen && formController.activeBatchRowId) {
      formController.updateBatchRow(formController.activeBatchRowId, { category_id: categoryId });
      return;
    }
    formController.selectCategory(categoryId);
  };
  const categoryCreator = useExpenseCategoryCreator({ onCreated: selectCreatedCategory });
  const openLifecycle = (budget) => {
    formController.closeBudgetForm();
    lifecycleController.openBudgetLifecycle(budget);
  };
  const openReminder = (budget) => {
    formController.closeBudgetForm();
    onReminder?.(budget);
  };
  const categoryCreateLabel = categoryCreator.requestMode ? "Ajukan kategori baru" : "Tambah kategori baru";
  return <>
    {batchCreateOpen
      ? <BudgetBatchEditor open controller={formController} categories={categories} lockedEnvelope={lockedEnvelope} sourceAccount={sourceAccount} onAddBalance={onAddBalance} onCreateCategory={categoryCreator.openModal} categoryCreateLabel={categoryCreateLabel} />
      : <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} pendingSchedule={formController.pendingSchedule} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} lockedEnvelope={lockedEnvelope} sourceAccount={sourceAccount} onAddBalance={onAddBalance} canLifecycle={canLifecycle} onLifecycle={openLifecycle} onReminder={openReminder} onCreateCategory={categoryCreator.openModal} categoryCreateLabel={categoryCreateLabel} />}
    <ExpenseCategoryCreateModal state={categoryCreator} />
    {canLifecycle ? <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} /> : null}
  </>;
};

export default BudgetDialogLayer;
