import { useMemo, useState } from "react";
import Modal from "../../components/common/Modal.jsx";
import Button from "../../components/common/Button.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { assertPositiveRupiah, formatRupiah } from "../../domain/money.js";
import { todayInJakarta } from "../../domain/dates.js";
import { moveGoalFromAllocation } from "./allocations.api.js";

const directRoute = (routes, sourceId, destinationId) => (routes || []).find((route) => route.source_account_id === sourceId && route.destination_account_id === destinationId && route.mode === "direct");

const AllocationGoalExecutionModal = ({ goal, accounts, transferRoutes, initialSourceAccountId = "", suggestedAmount = 0, manualAmount = false, onClose, onSuccess }) => {
  const compatibleAccounts = useMemo(() => (accounts || []).filter((account) => account.account_id !== goal?.account_id && directRoute(transferRoutes, account.account_id, goal?.account_id)), [accounts, goal?.account_id, transferRoutes]);
  const [sourceAccountId, setSourceAccountId] = useState(() => {
    if (compatibleAccounts.some((account) => account.account_id === initialSourceAccountId)) return initialSourceAccountId;
    return compatibleAccounts.length === 1 ? compatibleAccounts[0].account_id : "";
  });
  const [amount, setAmount] = useState(() => {
    if (manualAmount) return "";
    const remaining = Math.max(0, Number(goal?.remaining_amount || 0));
    const preferred = Math.max(0, Number(suggestedAmount || goal?.required_monthly_amount || 0));
    return String(Math.min(remaining, preferred) || "");
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const requestClose = () => {
    if (busy) return false;
    setError(null);
    onClose();
    return true;
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const value = assertPositiveRupiah(amount);
      if (!sourceAccountId) throw new Error("Pilih rekening sumber untuk Target.");
      if (value > Number(goal?.remaining_amount || 0)) throw new Error("Nominal melebihi sisa Target.");
      setBusy(true);
      const result = await moveGoalFromAllocation({ goal_id: goal.goal_id, movement_type: "deposit", amount: value, source_account_id: sourceAccountId, destination_account_id: goal.account_id, transaction_date: todayInJakarta(), reason: "Kontribusi Target dari Alokasi" }, {});
      await onSuccess?.({ goalBefore: goal, goalAfter: result?.goal || null, amount: value });
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return <Modal open={Boolean(goal)} onClose={requestClose} dismissible={!busy} title="Sisihkan ke Target" description={goal?.name || ""} footer={<><Button type="button" disabled={busy} onClick={requestClose}>Batal</Button><Button type="submit" form="allocation-goal-execution" variant="primary" loading={busy}>Sisihkan</Button></>}>
    <form id="allocation-goal-execution" className="form-grid" onSubmit={submit}>
      <CompactNotice className="form-grid__full" tone="info" title="Satu transaksi">Aksi ini membuat satu transfer yang menjadi sumber progres Target. Halaman Target hanya membaca hasilnya.</CompactNotice>
      <InlineSelectionPicker className="form-grid__full" label="Dari rekening" required value={sourceAccountId} onChange={setSourceAccountId} placeholder="Pilih rekening sumber" placeholderOption={{ icon: AccountIcon }} options={compatibleAccounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`, ...accountOptionVisual(account) }))} />
      <MoneyInput id="allocation-goal-amount" label="Nominal disisihkan" value={amount} onChange={setAmount} required />
      <div className="notice notice--neutral form-grid__full">Sisa Target {formatRupiah(goal?.remaining_amount || 0)}.</div>
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
    </form>
  </Modal>;
};

export default AllocationGoalExecutionModal;
