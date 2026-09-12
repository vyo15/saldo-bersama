import Button from "../../components/common/Button.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { MoneyInIcon, MoneyOutIcon, RefundIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { CATEGORY_TYPE_OPTIONS } from "../../shared/presentation/category.js";
import { DEFAULT_CATEGORY_ICON_BY_TYPE } from "../../shared/presentation/transaction.js";
import { CategoryIconPicker } from "./CategoryIconPicker.jsx";
import styles from "./CategoriesPage.module.css";

const CATEGORY_TYPE_ICONS = Object.freeze({ expense: MoneyOutIcon, income: MoneyInIcon, refund: RefundIcon });
const CategoryTypeField = ({ form, setForm }) => <VisualChoiceGroup className="form-grid__full" legend="Dipakai untuk transaksi" name="category-transaction-type" value={form.transaction_type} onChange={(nextType) => { setForm((current) => ({ ...current, transaction_type: nextType, icon: current.icon === DEFAULT_CATEGORY_ICON_BY_TYPE[current.transaction_type] ? DEFAULT_CATEGORY_ICON_BY_TYPE[nextType] : current.icon })); }} options={CATEGORY_TYPE_OPTIONS.map((item) => ({ ...item, icon: CATEGORY_TYPE_ICONS[item.value] || RefundIcon, tone: item.value }))} columns={3} mobileColumns={3} denseTiles plainIcons />;

export const CreateCategoryModal = ({ open, close, form, setForm, createCategory, dialogState, requestMode }) => {
  const submitting = dialogState.status === "submitting";
  const guard = useUnsavedChangesGuard({ open, value: form, onClose: close, blocked: submitting });
  return <>
    <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="kategori baru" dismissible={!submitting} title={requestMode ? "Ajukan kategori" : "Tambah kategori"} description={requestMode ? "Kategori baru dapat dipakai setelah Administrator menyetujui pengajuan." : undefined} size="lg" footer={<><Button onClick={guard.discardAndClose} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="create-category-form" loading={submitting}>{requestMode ? "Kirim pengajuan" : "Simpan kategori"}</Button></>}><form id="create-category-form" className="form-grid" onSubmit={createCategory}><label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Cicilan rumah" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><CategoryTypeField form={form} setForm={setForm} /><CategoryIconPicker value={form.icon} onChange={(icon) => setForm((current) => ({ ...current, icon }))} transactionType={form.transaction_type} name={form.name} />{dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}</form></Modal>
  </>;
};

export const EditCategoryModal = ({ editCategory, setEditCategory, saveCategory, dialogState }) => {
  const submitting = dialogState.status === "submitting";
  const close = () => setEditCategory(null);
  const guard = useUnsavedChangesGuard({ open: Boolean(editCategory), value: editCategory, onClose: close, blocked: submitting });
  return <>
    <Modal open={Boolean(editCategory)} onClose={guard.requestClose} discardGuard={guard} discardSubject="perubahan kategori" dismissible={!submitting} title="Edit kategori" size="lg" footer={<><Button onClick={guard.discardAndClose} disabled={submitting}>Batal</Button><Button variant="primary" type="submit" form="edit-category-form" loading={submitting}>Simpan perubahan</Button></>}><form id="edit-category-form" className="form-grid" onSubmit={saveCategory}><label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={editCategory?.name || ""} onChange={(event) => setEditCategory((current) => ({ ...current, name: event.target.value }))} /></label>{editCategory ? <CategoryIconPicker value={editCategory.icon} onChange={(icon) => setEditCategory((current) => ({ ...current, icon }))} transactionType={editCategory.transaction_type} name={editCategory.name} /> : null}{dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}</form></Modal>
  </>;
};

export const ArchiveCategoryModal = ({ archiveTarget, dialogState, setArchiveTarget, applyCategoryLifecycle }) => <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus kategori yang belum dipakai?" : "Arsipkan kategori?"} description={archiveTarget ? (archiveTarget.preview.canDeleteUnused ? `${archiveTarget.category.name} belum pernah digunakan dan dapat dihapus permanen.` : `${archiveTarget.category.name} pernah digunakan atau masih memiliki dependency. Riwayat lama tetap disimpan dan kategori hanya diarsipkan.`) : ""} confirmLabel={archiveTarget?.preview.canDeleteUnused ? "Hapus permanen" : archiveTarget ? `Arsipkan ${archiveTarget.category.name}` : "Arsipkan kategori"} reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason busy={dialogState.status === "submitting"} error={dialogState.error} onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)} onConfirm={applyCategoryLifecycle}>{archiveTarget ? <dl className={styles.impactSummary}><div><dt>Transaksi</dt><dd>{archiveTarget.preview.dependencies.transactions}</dd></div><div><dt>Tagihan rutin</dt><dd>{archiveTarget.preview.dependencies.recurring}</dd></div><div><dt>Kebutuhan</dt><dd>{archiveTarget.preview.dependencies.budgets}</dd></div></dl> : null}</ConfirmationModal>;

