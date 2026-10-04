import { useEffect, useRef, useState } from "react";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createCommitment } from "./commitments.api.js";

const TYPE_VALUES = new Set(["mortgage", "installment", "loan", "arisan", "other"]);

const commitmentCreatePayload = (form) => {
  const arisan = form.commitment_type === "arisan";
  const mortgage = form.commitment_type === "mortgage";
  return {
    commitment_type: form.commitment_type,
    name: form.name,
    provider: form.provider,
    original_amount: arisan ? undefined : assertPositiveRupiah(form.original_amount),
    current_balance: form.current_balance === "" ? undefined : Number(form.current_balance),
    installment_amount: assertPositiveRupiah(form.installment_amount),
    total_installments: Number(form.total_installments),
    installments_paid: mortgage ? Math.max(0, Number(form.installments_paid || 0)) : undefined,
    default_account_id: form.default_account_id,
    category_id: form.category_id,
    budget_id: form.budget_id || null,
    frequency: "monthly",
    due_day: Number(form.due_day),
    start_date: mortgage ? form.start_date : undefined,
    end_date: form.end_date || undefined,
    payment_method: "transfer",
  };
};

const useCommitmentCreateFlow = ({
  emptyForm,
  expenseCategories,
  location,
  mutation,
  navigate,
  notify,
  reloadAll,
  resourceStatus,
  suggestedCategoryId,
  validateDetails,
}) => {
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("type");
  const [origin, setOrigin] = useState("commitments");
  const [stepError, setStepError] = useState("");
  const workflowHandled = useRef("");
  const resetMutation = mutation.reset;
  const close = () => {
    if (mutation.busy || mutation.outcomeUnknown) return;
    setOpen(false);
    setStepError("");
    setStage("type");
  };
  const guard = useUnsavedChangesGuard({ open, value: form, onClose: close, blocked: mutation.busy || mutation.outcomeUnknown });

  useEffect(() => {
    if (resourceStatus !== "ready" || location.state?.workflowAction !== "create-commitment") return;
    const requestedType = TYPE_VALUES.has(String(location.state?.commitmentType || "")) ? String(location.state.commitmentType) : "mortgage";
    const workflowKey = `${location.key || "route"}:${requestedType}`;
    if (workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;
    resetMutation();
    setForm({ ...emptyForm(), commitment_type: requestedType, category_id: suggestedCategoryId(expenseCategories, requestedType) });
    setOrigin("planning");
    setStepError("");
    setStage("details");
    setOpen(true);
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [emptyForm, expenseCategories, location.hash, location.key, location.pathname, location.search, location.state, navigate, resetMutation, resourceStatus, suggestedCategoryId]);

  const openCreate = () => {
    resetMutation();
    setForm(emptyForm());
    setOrigin("commitments");
    setStepError("");
    setStage("type");
    setOpen(true);
  };
  const selectType = (commitmentType) => {
    const next = { ...emptyForm(), commitment_type: commitmentType, category_id: suggestedCategoryId(expenseCategories, commitmentType) };
    setForm(next);
    setStepError("");
    setStage("details");
    guard.markClean(next);
  };
  const continueDetails = (event) => {
    event.preventDefault();
    const message = validateDetails(form);
    setStepError(message);
    if (!message) setStage("payment");
  };
  const submit = (event) => {
    event.preventDefault();
    if (form.planning_need_resolved === false) {
      setStepError("Pilih Kebutuhan yang digunakan atau pilih Pembayaran mandiri.");
      return undefined;
    }
    setStepError("");
    return mutation.run(async () => {
      const created = await createCommitment(commitmentCreatePayload(form));
      const name = form.name || "Kewajiban";
      setOpen(false); setStage("type"); setStepError(""); setForm(emptyForm());
      notify({ message: `${name} berhasil dibuat. Jadwal pembayaran berikutnya sudah disiapkan.`, tone: "success", dedupeKey: "commitments:create" });
      await reloadAll();
      if (origin === "planning") navigate("/perencanaan/kantong", { replace: true, state: { workflowSource: "commitment-created", planningCommitmentId: created.commitment_id } });
    }).catch(() => undefined);
  };
  return { form, setForm, open, stage, stepError, guard, openCreate, selectType, continueDetails, submit, setStage, setStepError };
};

export default useCommitmentCreateFlow;
