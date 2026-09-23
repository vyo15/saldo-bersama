import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { CategoryIconPicker } from "./CategoryIconPicker.jsx";

export const ExpenseCategoryCreateModal = ({ state }) => {
  const guard = useUnsavedChangesGuard({ open: state.open, value: state.form, onClose: state.close, blocked: state.status.status === "submitting" });
  return <Modal
    open={state.open}
    onClose={guard.requestClose}
    discardGuard={guard}
    discardSubject="kategori baru"
    dismissible={state.status.status !== "submitting"}
    title={state.requestMode ? "Ajukan kategori" : "Tambah kategori"}
    size="lg"
    footer={<><Button onClick={guard.discardAndClose} disabled={state.status.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="expense-category-quick-create-form" loading={state.status.status === "submitting"}>{state.requestMode ? "Kirim pengajuan" : "Simpan kategori"}</Button></>}
  >
    <form id="expense-category-quick-create-form" className="form-grid" onSubmit={state.submit}>
      <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Arisan" value={state.form.name} onChange={(event) => state.setForm((current) => ({ ...current, name: event.target.value }))} /></label>
      <CategoryIconPicker value={state.form.icon} onChange={(icon) => state.setForm((current) => ({ ...current, icon }))} transactionType="expense" name={state.form.name} />
      {state.status.error ? <div className="notice notice--danger form-grid__full" role="alert">{state.status.error.message}</div> : null}
    </form>
  </Modal>;
};
