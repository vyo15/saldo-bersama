import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { AdminIcon, PersonIcon, SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { userOptionLabel } from "../../shared/presentation/user.js";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

const BudgetModal = ({ open, close, existingBudget, saveState, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership, lockedEnvelope, sharedOnly = false }) => {
  const ownershipOptions = [
    { value: "shared", label: "Bersama", icon: SharedIcon, description: "Batas bersama" },
    ...users.map((item) => ({ value: `user:${item.user_id}`, label: userOptionLabel(item), icon: item.role === "owner" ? AdminIcon : PersonIcon, description: "Batas personal" })),
  ];
  const title = existingBudget ? "Edit batas pengeluaran" : "Tambah batas pengeluaran";
  const relinksExistingBudget = Boolean(lockedEnvelope && existingBudget?.envelope_rule_id && existingBudget.envelope_rule_id !== lockedEnvelope.envelope_rule_id);
  return <Modal open={open} onClose={close} dismissible={saveState.status !== "submitting"} title={title} footer={<><Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{existingBudget ? "Simpan perubahan" : "Simpan batas"}</Button></>}>
    <form id="budget-form" className="form-grid" onSubmit={saveBudget}>
      {lockedEnvelope ? <CompactNotice className="form-grid__full" tone="info" title={`Kantong Dana: ${lockedEnvelope.name}`}>Batas ini hanya menghitung transaksi kategori yang memakai Kantong Dana tersebut.</CompactNotice> : null}{relinksExistingBudget ? <CompactNotice className="form-grid__full" tone="warning" title="Kategori sudah terhubung ke Kantong lain.">Menyimpan akan memindahkan batas kategori ini ke Kantong Dana yang sedang dibuka. Riwayat transaksi tidak dipindahkan atau diubah.</CompactNotice> : null}
      <label className="field"><span>Kategori pengeluaran *</span><select required value={form.category_id} onChange={(event) => selectCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
      {!lockedEnvelope && !sharedOnly ? <VisualChoiceGroup className="form-grid__full" legend="Berlaku untuk" name="budget-ownership" value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} columns={Math.min(ownershipOptions.length, 3)} disabled={usersStatus === "loading"} helper="Untuk dana dari rekening bersama atau personal, hubungkan batas ke Kantong Dana agar sumber pemakaiannya jelas." /> : null}
      {sharedOnly && !lockedEnvelope ? <CompactNotice className="form-grid__full" tone="info" title="Batas Bersama">Member dapat membuat dan mengubah batas untuk ruang Bersama.</CompactNotice> : null}
      <MoneyInput id="budget-amount" label="Batas pengeluaran" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      <label className="field"><span>Peringatan saat terpakai (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label>
      {saveState.status === "error" ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Batas pengeluaran belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus batas yang belum dipakai?" : "Arsipkan batas pengeluaran?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum menjadi histori perencanaan dan dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah terkait transaksi atau histori periode. Batas hanya dapat diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan batas"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Transaksi periode {archiveTarget.preview.dependencies.transactions} · penutupan periode {archiveTarget.preview.dependencies.period_closures}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, canLifecycle = false, categories, users, usersStatus, formController, lifecycleController, lockedEnvelope = null, sharedOnly = false }) => <>
  <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} lockedEnvelope={lockedEnvelope} sharedOnly={sharedOnly} />
  {canLifecycle ? <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} /> : null}
</>;

export default BudgetDialogLayer;
