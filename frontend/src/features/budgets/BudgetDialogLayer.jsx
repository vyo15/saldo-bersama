import { FiCalendar, FiEdit3, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { AdminIcon, PersonIcon, SharedIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { userOptionLabel } from "../../shared/presentation/user.js";

const budgetOwnershipValue = (form) => form.scope === "personal" && form.owner_user_id ? `user:${form.owner_user_id}` : "shared";

const RECORDING_MODE_OPTIONS = Object.freeze([
  { value: "flexible", label: "Catat saat digunakan", icon: FiEdit3, description: "Untuk bensin, belanja, perlengkapan, dan kebutuhan yang dapat terjadi berkali-kali." },
  { value: "scheduled", label: "Saya punya jadwal pembayaran", icon: FiCalendar, description: "Setelah Kebutuhan tersimpan, bantu buat Jadwal Rutin tanpa mengubah saldo." },
]);

const BudgetModal = ({ open, close, existingBudget, saveState, saveBudget, form, setForm, categories, users, usersStatus, selectCategory, selectOwnership, lockedEnvelope }) => {
  const ownershipOptions = [
    { value: "shared", label: "Bersama", icon: SharedIcon, description: "Kebutuhan bersama" },
    ...users.map((item) => ({ value: `user:${item.user_id}`, label: userOptionLabel(item), icon: item.role === "owner" ? AdminIcon : PersonIcon, description: "Kebutuhan personal" })),
  ];
  const title = existingBudget ? "Edit kebutuhan" : "Tambah kebutuhan";
  const linksLegacyBudget = Boolean(lockedEnvelope && existingBudget && !existingBudget.envelope_rule_id);

  return <Modal open={open} onClose={close} dismissible={saveState.status !== "submitting"} title={title} footer={<><Button type="button" disabled={saveState.status === "submitting"} onClick={close}>Batal</Button><Button variant="primary" icon={FiPlus} type="submit" form="budget-form" loading={saveState.status === "submitting"}>{existingBudget ? "Simpan perubahan" : "Simpan kebutuhan"}</Button></>}>
    <form id="budget-form" className="form-grid" onSubmit={saveBudget}>
      {lockedEnvelope ? <CompactNotice className="form-grid__full" tone="info" title={`Alokasi Dana: ${lockedEnvelope.name}`}>Kebutuhan ini memakai kategori yang sudah ada dan hanya menghitung transaksi dari Alokasi Dana tersebut.</CompactNotice> : null}
      {linksLegacyBudget ? <CompactNotice className="form-grid__full" tone="info" title="Kebutuhan lama ditemukan.">Menyimpan akan menghubungkan Kebutuhan lama yang belum memiliki Alokasi Dana ke alokasi ini. Riwayat transaksi tidak dipindahkan atau diubah.</CompactNotice> : null}
      <label className="field"><span>Kategori *</span><select required value={form.category_id} onChange={(event) => selectCategory(event.target.value)}><option value="">Pilih kategori</option>{categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
      {!lockedEnvelope ? <VisualChoiceGroup className="form-grid__full" legend="Berlaku untuk" name="budget-ownership" value={budgetOwnershipValue(form)} onChange={selectOwnership} options={ownershipOptions} columns={Math.min(ownershipOptions.length, 3)} disabled={usersStatus === "loading"} helper="Hubungkan Kebutuhan ke Alokasi Dana agar sumber pemakaiannya jelas." /> : null}
      <MoneyInput id="budget-amount" label="Anggaran" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
      {!existingBudget ? <VisualChoiceGroup className="form-grid__full" legend="Cara mencatat kebutuhan" name="budget-recording-mode" value={form.recording_mode || "flexible"} onChange={(recording_mode) => setForm((current) => ({ ...current, recording_mode }))} options={RECORDING_MODE_OPTIONS} columns={2} helper="Pilihan ini hanya mengatur langkah berikutnya. Kebutuhan tetap berupa anggaran per periode dan saldo tidak berubah saat disimpan." /> : null}
      {!lockedEnvelope ? <label className="field"><span>Peringatan saat terpakai (%)</span><input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} /></label> : null}
      {saveState.status === "error" ? <div className="notice notice--danger form-grid__full" role="alert">{saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

const BudgetLifecycleModal = ({ archiveTarget, archiveState, setArchiveTarget, applyBudgetLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus kebutuhan yang belum dipakai?" : "Arsipkan kebutuhan?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.budget.name || archiveTarget.budget.category_id} belum menjadi histori perencanaan dan dapat dihapus permanen.` : `${archiveTarget.budget.name || archiveTarget.budget.category_id} sudah terkait transaksi atau histori periode. Kebutuhan hanya dapat diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : "Arsipkan kebutuhan"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={archiveState.status === "submitting"} error={archiveState.error} onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyBudgetLifecycle}>{archiveTarget ? <div className="notice notice--info">Transaksi periode {archiveTarget.preview.dependencies.transactions} · penutupan periode {archiveTarget.preview.dependencies.period_closures}.</div> : null}</ConfirmationModal>;

const BudgetDialogLayer = ({ canManage, canLifecycle = false, categories, users, usersStatus, formController, lifecycleController, lockedEnvelope = null }) => <>
  <BudgetModal open={formController.formOpen && canManage} close={formController.closeBudgetForm} existingBudget={formController.existingBudget} saveState={formController.saveState} saveBudget={formController.saveBudget} form={formController.form} setForm={formController.setForm} categories={categories} users={users} usersStatus={usersStatus} selectCategory={formController.selectCategory} selectOwnership={formController.selectOwnership} lockedEnvelope={lockedEnvelope} />
  {canLifecycle ? <BudgetLifecycleModal archiveTarget={lifecycleController.archiveTarget} archiveState={lifecycleController.archiveState} setArchiveTarget={lifecycleController.setArchiveTarget} applyBudgetLifecycle={lifecycleController.applyBudgetLifecycle} /> : null}
</>;

export default BudgetDialogLayer;
