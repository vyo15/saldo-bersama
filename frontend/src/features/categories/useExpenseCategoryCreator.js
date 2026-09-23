import { useState } from "react";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { DEFAULT_CATEGORY_ICON_BY_TYPE } from "../../shared/presentation/transaction.js";
import { createSharedCategory, requestSharedCategoryCreation } from "../../shared/workflows/categoryCreation.js";

export const useExpenseCategoryCreator = ({ onCreated } = {}) => {
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
      notify({ message: requestMode ? "Pengajuan kategori dikirim ke Administrator." : "Kategori berhasil dibuat dan siap dipilih.", tone: "success", dedupeKey: requestMode ? "expense-category:request" : "expense-category:create" });
      if (!requestMode) {
        invalidate(["categories.list", "bootstrap.get", "app.initialState"]);
        await refreshBootstrap({ invalidate: false });
        onCreated?.(created?.category_id || "");
      }
    } catch (error) { setStatus({ status: "error", error }); }
  };
  return { open, form, setForm, status, requestMode, openModal: () => { setStatus({ status: "idle", error: null }); setOpen(true); }, close, submit };
};
