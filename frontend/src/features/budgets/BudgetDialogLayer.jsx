import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { AdminIcon, PersonIcon, SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { userOptionLabel } from "../../shared/presentation/user.js";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

const BudgetModal = ({ open, close, existingBudget, saveState, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership }) => {
  const ownershipOptions = [
    { value: "shared", label: "Bersama", icon: SharedIcon, description: "Anggaran bersama" },
    ...users.map((item) => ({ value: `user:${item.user_id}`, label: userOptionLabel(item), icon: item.role === "owner" ? AdminIcon : PersonIcon, description: "Anggaran personal" })),
  ];
  return <Modal open={open} onClose={close} dismissible={saveState.status !== "submitting"} title={existingBudget ? "Edit anggaran" : "Tambah anggaran"} footer={<><Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{existingBudget ? "Simpan perubahan" : "Simpan anggaran"}</Button></>}>
    <form id="budget-form" className="form-grid" onSubmit={saveBudget}>
      <label className="field"><span>Kategori pengeluaran *</span><select required value={form.category_id} onChange={(event) => selectCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
      <VisualChoiceGroup className="form-grid__full" legend="Berlaku untuk" name="budget-ownership" value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} columns={Math.min(ownershipOptions.length, 3)} disabled={usersStatus === "loading"} helper="Anggaran pribadi menghitung transaksi pada rekening pribadi pengguna tersebut. Untuk jatah per orang dari rekening bersama, gunakan Alokasi." />
      <MoneyInput id="budget-amount" label="Nominal anggaran" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      <label className="field"><span>Ambang peringatan (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>
      {saveState.status === "error" ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Anggaran belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus anggaran yang belum dipakai?" : "Arsipkan anggaran?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum menjadi histori perencanaan dan dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah terkait transaksi atau histori periode. Anggaran hanya dapat diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan anggaran"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Transaksi periode {archiveTarget.preview.dependencies.transactions} · penutupan periode {archiveTarget.preview.dependencies.period_closures}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, categories, users, usersStatus, formController, lifecycleController }) => <>
  <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} />
  <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} />
</>;

export default BudgetDialogLayer;
