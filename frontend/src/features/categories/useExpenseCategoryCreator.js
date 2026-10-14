import { useState } from "react";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { DEFAULT_CATEGORY_ICON_BY_TYPE } from "../../shared/presentation/transaction.js";
import { createSharedCategory } from "../../shared/workflows/categoryCreation.js";

export const useExpenseCategoryCreator = ({ onCreated } = {}) => {
  const { notify } = useFeedback();
  const { refreshBootstrap, invalidate } = useFinance();
  const initialForm = () => ({ name: "", transaction_type: "expense", icon: DEFAULT_CATEGORY_ICON_BY_TYPE.expense });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ status: "idle", error: null });
  const close = () => { if (status.status !== "submitting") { setOpen(false); setStatus({ status: "idle", error: null }); } };
  const submit = async (event) => {
    event.preventDefault();
    setStatus({ status: "submitting", error: null });
    try {
      const created = await createSharedCategory(form, {});
      setForm(initialForm());
      setOpen(false);
      setStatus({ status: "idle", error: null });
      notify({ message: "Kategori berhasil dibuat dan siap dipilih.", tone: "success", dedupeKey: "expense-category:create" });
      invalidate(["categories.list", "bootstrap.get", "app.initialState"]);
      await refreshBootstrap({ invalidate: false });
      onCreated?.(created?.category_id || "");
    } catch (error) { setStatus({ status: "error", error }); }
  };
  return { open, form, setForm, status, openModal: () => { setStatus({ status: "idle", error: null }); setOpen(true); }, close, submit };
};
