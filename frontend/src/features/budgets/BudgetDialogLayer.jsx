import { FiBell, FiCalendar, FiEdit3, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineOwnershipPicker from "../../components/common/InlineOwnershipPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { userRoleLabel } from "../../shared/presentation/user.js";
import TemporalInput from "../../components/common/TemporalInput.jsx";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

const RECORDING_MODE_OPTIONS = Object.freeze([
  { value: "flexible", label: "Catat saat digunakan", icon: FiEdit3, description: "Dicatat manual ketika dana benar-benar dipakai." },
  { value: "scheduled", label: "Saya punya jadwal pembayaran", icon: FiCalendar, description: "Atur frekuensi dan jatuh tempo langsung di sini." },
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

const BudgetModalFooter = ({ saveState, close, pendingSchedule, existingBudget }) => {
  const submitLabel = pendingSchedule ? "Simpan jadwal" : existingBudget ? "Simpan perubahan" : "Simpan kebutuhan";
  return <>
    <Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button>
    <Button variant="primary" icon={pendingSchedule ? FiCalendar : FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{submitLabel}</Button>
  </>;
};

const BudgetModalNotices = ({ pendingSchedule, lockedEnvelope, linksLegacyBudget }) => <>
  {pendingSchedule ? <CompactNotice className="form-grid__full" tone="warning" title="Kebutuhan sudah tersimpan.">Jadwal pembayaran belum berhasil dibuat. Simpan jadwal lagi tanpa membuat Kebutuhan duplikat.</CompactNotice> : null}
  {lockedEnvelope ? <CompactNotice className="form-grid__full" tone="info" title={`Alokasi Dana: ${lockedEnvelope.name}`}>Kebutuhan ini memakai kategori yang sudah ada dan hanya menghitung transaksi dari Alokasi Dana tersebut.</CompactNotice> : null}
  {linksLegacyBudget ? <CompactNotice className="form-grid__full" tone="info" title="Kebutuhan lama ditemukan.">Menyimpan akan menghubungkan Kebutuhan lama yang belum memiliki Alokasi Dana ke alokasi ini. Riwayat transaksi tidak dipindahkan atau diubah.</CompactNotice> : null}
</>;

const BudgetScheduleFields = ({ form, setForm }) => <>
  <div className="form-grid__full"><CompactNotice tone="info" title="Jadwal pembayaran">Jadwal dibuat bersama Kebutuhan. Saldo baru berubah setelah pembayaran aktual dikonfirmasi.</CompactNotice></div>
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

const BudgetModal = ({ open, close, existingBudget, saveState, pendingSchedule, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership, lockedEnvelope, canLifecycle, onLifecycle, onReminder }) => {
  const ownershipOptions = budgetOwnershipOptions(users);
  const title = existingBudget ? "Edit kebutuhan" : "Tambah kebutuhan";
  const linksLegacyBudget = Boolean(lockedEnvelope && existingBudget && !existingBudget.envelope_rule_id);
  const showSchedule = !existingBudget && form.recording_mode === "scheduled";

  return <Modal open={open} onClose={close} dismissible={saveState.status !== "submitting"} title={title} footer={<BudgetModalFooter saveState={saveState} close={close} pendingSchedule={pendingSchedule} existingBudget={existingBudget} />}>
    <form id="budget-form" className="form-grid" onSubmit={saveBudget}>
      <BudgetModalNotices pendingSchedule={pendingSchedule} lockedEnvelope={lockedEnvelope} linksLegacyBudget={linksLegacyBudget} />
      <SelectionField label="Kategori" required value={form.category_id} onChange={selectCategory} placeholder="Pilih kategori" searchable={categories.length > 8} searchPlaceholder="Cari kategori…" options={categories.map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) }))} />
      {!lockedEnvelope ? <InlineOwnershipPicker className="form-grid__full" legend="Berlaku untuk" required value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} disabled={usersStatus === "loading"} helper={usersStatus === "loading" ? "Memuat pengguna aktif..." : ""} /> : null}
      <MoneyInput id="budget-amount" label="Nominal kebutuhan" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      {!existingBudget ? <VisualChoiceGroup className="form-grid__full" legend="Cara mencatat kebutuhan" name="budget-recording-mode" value={form.recording_mode || "flexible"} onChange={(recording_mode) => setForm((current) => ({ ...current, recording_mode }))} options={RECORDING_MODE_OPTIONS} columns={2} mobileColumns={2} descriptive wrapLabels helperPanel helper="Pilihan ini hanya menentukan langkah berikutnya. Nominal Kebutuhan dan saldo tidak berubah saat Kebutuhan disimpan." /> : null}
      {showSchedule ? <BudgetScheduleFields form={form} setForm={setForm} /> : null}
      {!lockedEnvelope ? <label className="field"><span>Peringatan saat terpakai (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label> : null}
      <ExistingBudgetActions existingBudget={existingBudget} canLifecycle={canLifecycle} onReminder={onReminder} onLifecycle={onLifecycle} />
      {saveState.status === "error" ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus kebutuhan yang belum dipakai?" : "Arsipkan kebutuhan?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum menjadi histori perencanaan dan dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah terkait transaksi atau histori periode. Kebutuhan hanya dapat diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan kebutuhan"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Transaksi periode {archiveTarget.preview.dependencies.transactions} · penutupan periode {archiveTarget.preview.dependencies.period_closures}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, canLifecycle = false, categories, users, usersStatus, formController, lifecycleController, lockedEnvelope = null, onReminder }) => {
  const openLifecycle = (budget) => {
    formController.closeBudgetForm();
    lifecycleController.openBudgetLifecycle(budget);
  };
  const openReminder = (budget) => {
    formController.closeBudgetForm();
    onReminder?.(budget);
  };
  return <>
    <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} pendingSchedule={formController.pendingSchedule} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} lockedEnvelope={lockedEnvelope} canLifecycle={canLifecycle} onLifecycle={openLifecycle} onReminder={openReminder} />
    {canLifecycle ? <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} /> : null}
  </>;
};

export default BudgetDialogLayer;
