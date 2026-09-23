import { FiBell, FiCalendar, FiPlus, FiTrash2 } from "react-icons/fi";
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
import { userRoleLabel } from "../../shared/presentation/user.js";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import BudgetBatchEditor from "./BudgetBatchEditor.jsx";
import { BUDGET_RECORDING_OPTIONS } from "./budgetRecordingOptions.js";
import styles from "./BudgetDialogLayer.module.css";
import { ExpenseCategoryCreateModal } from "../categories/ExpenseCategoryQuickCreate.jsx";
import { useExpenseCategoryCreator } from "../categories/useExpenseCategoryCreator.js";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

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

const BudgetModalFooter = ({ saveState, close, pendingSchedule, existingBudget }) => {
  const submitLabel = pendingSchedule ? "Simpan jadwal" : existingBudget ? "Simpan perubahan" : "Simpan kebutuhan";
  return <>
    <Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button>
    <Button variant="primary" icon={pendingSchedule ? FiCalendar : FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{submitLabel}</Button>
  </>;
};

const BudgetModalNotices = ({ pendingSchedule, linksLegacyBudget }) => <>
  {pendingSchedule ? <CompactNotice className="form-grid__full" tone="warning" title="Kebutuhan sudah tersimpan.">Jadwal pembayaran belum berhasil dibuat. Simpan jadwal lagi tanpa membuat Kebutuhan duplikat.</CompactNotice> : null}
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
  return <div className={styles.actions}>
    <Button type="button" icon={FiBell} onClick={() => onReminder?.(existingBudget)}>Atur pengingat</Button>
    {canLifecycle ? <Button type="button" className={styles.deleteAction} icon={FiTrash2} onClick={() => onLifecycle?.(existingBudget)}>Hapus dari daftar</Button> : null}
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

const BudgetFundingNotices = ({ funding }) => <>
  {funding.shortageAmount > 0 ? <CompactNotice className="form-grid__full" tone="warning" title={`Masih kurang ${formatRupiah(funding.shortageAmount)}`}>Kebutuhan tetap dapat disimpan. Dana yang tersedia dialokasikan sekarang dan kekurangannya dapat dipenuhi nanti.</CompactNotice> : null}
  {funding.additionalAmount > 0 && funding.shortageAmount === 0 ? <CompactNotice className="form-grid__full" tone="info" title={`Tambahan ${formatRupiah(funding.additionalAmount)} dialokasikan`}>Dana Tersedia setelah perubahan {formatRupiah(funding.afterAmount)}.</CompactNotice> : null}
</>;

const BudgetOwnershipField = ({ lockedEnvelope, form, selectOwnership, ownershipOptions, usersStatus }) => {
  if (lockedEnvelope) return null;
  return <InlineOwnershipPicker className="form-grid__full" legend="Berlaku untuk" required value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} disabled={usersStatus === "loading"} helper={usersStatus === "loading" ? "Memuat pengguna aktif..." : ""} />;
};

const BudgetRecordingModeField = ({ existingBudget, form, setForm }) => {
  const hasUsage = Number(existingBudget?.used_amount || 0) > 0;
  const helper = hasUsage
    ? "Cara penggunaan tidak dapat diubah karena kebutuhan ini sudah memiliki pemakaian."
    : existingBudget
      ? "Bisa diubah selama kebutuhan belum pernah dipakai."
      : "Pilih bagaimana kebutuhan ini akan digunakan.";
  return <InlineSelectionPicker
    className={styles.recordingField}
    label="Cara penggunaan"
    required
    value={form.recording_mode || ""}
    onChange={(recording_mode) => setForm((current) => ({ ...current, recording_mode }))}
    options={BUDGET_RECORDING_OPTIONS}
    placeholder="Pilih cara penggunaan"
    placeholderMeta="Sekali bayar, beberapa kali, atau rutin"
    helper={helper}
    locked={hasUsage}
  />;
};

const BudgetThresholdField = ({ lockedEnvelope, form, setForm }) => {
  if (lockedEnvelope) return null;
  return <label className="field"><span>Peringatan saat terpakai (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>;
};

const BudgetSaveError = ({ saveState }) => saveState.status === "error"
  ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div>
  : null;

const handleBudgetSubmit = (event, saveBudget) => saveBudget(event);

const BudgetModal = ({ open, close, existingBudget, saveState, pendingSchedule, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership, lockedEnvelope, sourceAccount, canLifecycle, onLifecycle, onReminder, onCreateCategory, categoryCreateLabel }) => {
  const ownershipOptions = budgetOwnershipOptions(users);
  const title = existingBudget ? "Edit kebutuhan" : "Tambah kebutuhan";
  const linksLegacyBudget = Boolean(lockedEnvelope && existingBudget && !existingBudget.envelope_rule_id);
  const showSchedule = form.recording_mode === "recurring" && (!existingBudget || existingBudget.recording_mode !== "recurring");
  const submitting = saveState.status === "submitting";
  const funding = budgetEditFundingState({ form, existingBudget, lockedEnvelope, sourceAccount });
  const guard = useUnsavedChangesGuard({ open, value: form, onClose: close, blocked: submitting });
  const categoryOptions = categories.map((item) => ({ value: item.category_id, label: item.name, meta: "Kategori pengeluaran", ...categoryOptionVisual(item) }));
  const categoryFooter = !existingBudget && onCreateCategory ? <Button type="button" icon={FiPlus} onClick={onCreateCategory}>{categoryCreateLabel}</Button> : null;

  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="Kebutuhan" dismissible={!submitting} title={title} size="sm" className={styles.budgetModal} footer={<BudgetModalFooter saveState={saveState} close={guard.discardAndClose} pendingSchedule={pendingSchedule} existingBudget={existingBudget} />}>
    <form id="budget-form" className={`form-grid ${styles.budgetForm}`} onSubmit={(event) => handleBudgetSubmit(event, saveBudget)}>
      <BudgetModalNotices pendingSchedule={pendingSchedule} linksLegacyBudget={linksLegacyBudget} />
      <div className={styles.primaryFields}>
        <label className="field"><span>Nama kebutuhan *</span><input required maxLength="100" placeholder="Contoh: Arisan PT" value={form.name || ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <MoneyInput id="budget-amount" label="Nominal" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      </div>
      <InlineSelectionPicker className="form-grid__full" label="Kategori" required value={form.category_id} onChange={selectCategory} locked={Boolean(existingBudget)} placeholder="Pilih kategori" placeholderMeta="Tentukan jenis pengeluaran" searchable={categories.length > 8} searchPlaceholder="Cari kategori…" options={categoryOptions} footer={categoryFooter} />
      <BudgetOwnershipField lockedEnvelope={lockedEnvelope} form={form} selectOwnership={selectOwnership} ownershipOptions={ownershipOptions} usersStatus={usersStatus} />
      <BudgetFundingNotices funding={funding} />
      <BudgetRecordingModeField existingBudget={existingBudget} form={form} setForm={setForm} />
      {showSchedule ? <BudgetScheduleFields form={form} setForm={setForm} /> : null}
      <BudgetThresholdField lockedEnvelope={lockedEnvelope} form={form} setForm={setForm} />
      <ExistingBudgetActions existingBudget={existingBudget} canLifecycle={canLifecycle} onReminder={onReminder} onLifecycle={onLifecycle} />
      <BudgetSaveError saveState={saveState} />
    </form>
  </Modal>;
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus kebutuhan yang belum dipakai?" : "Arsipkan kebutuhan?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum memiliki histori finansial, jadi dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah memiliki histori. Kebutuhan akan diarsipkan dari daftar aktif; transaksi dan konteks laporan lama tetap tersimpan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan kebutuhan"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Terpakai {Number(archiveTarget.preview.used_amount || 0).toLocaleString("id-ID")} · dana yang aman dilepas {Number(archiveTarget.preview.releasable_amount || 0).toLocaleString("id-ID")} · transaksi histori {archiveTarget.preview.dependencies.transactions}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, canLifecycle = false, categories, users, usersStatus, formController, lifecycleController, lockedEnvelope = null, sourceAccount = null, onReminder }) => {
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
      ? <BudgetBatchEditor open controller={formController} categories={categories} lockedEnvelope={lockedEnvelope} sourceAccount={sourceAccount} onCreateCategory={categoryCreator.openModal} categoryCreateLabel={categoryCreateLabel} />
      : <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} pendingSchedule={formController.pendingSchedule} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} lockedEnvelope={lockedEnvelope} sourceAccount={sourceAccount} canLifecycle={canLifecycle} onLifecycle={openLifecycle} onReminder={openReminder} onCreateCategory={categoryCreator.openModal} categoryCreateLabel={categoryCreateLabel} />}
    <ExpenseCategoryCreateModal state={categoryCreator} />
    {canLifecycle ? <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} /> : null}
  </>;
};

export default BudgetDialogLayer;
