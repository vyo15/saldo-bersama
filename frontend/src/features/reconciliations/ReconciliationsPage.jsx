import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, formatDateTimeJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { createReconciliation } from "./reconciliations.api.js";
import styles from "./ReconciliationsPage.module.css";
import { ReconciliationResultOverlay } from "./components/ReconciliationFeedback.jsx";
import ReconciliationInputPanel from "./components/ReconciliationForm.jsx";
import ReconciliationHistory from "./components/ReconciliationHistory.jsx";

const INITIAL_FORM = Object.freeze({ account_id: "", actual_balance: "", notes: "" });
const EMPTY_ACCOUNTS = Object.freeze([]);

const formatReconciledAt = (value) => formatDateTimeJakarta(value, { fallback: "Waktu tidak tersedia" });
const accountSystemBalance = (account) => {
  const balance = Number(account?.balance || 0);
  return Number.isSafeInteger(balance) ? balance : 0;
};

const parseActualBalance = (value, allowNegative) => {
  const raw = String(value || "").trim();
  const negative = raw.startsWith("-");
  let amount = parseRupiah(negative ? raw.slice(1) : raw);
  if (negative) amount *= -1;
  if (amount < 0 && !allowNegative) throw new RangeError("Saldo aktual rekening ini tidak boleh negatif.");
  return amount;
};

const getDifferencePreview = (selectedAccount, actualBalance) => {
  if (!selectedAccount || actualBalance === "" || actualBalance === null || actualBalance === undefined) return null;
  try {
    const actual = parseActualBalance(actualBalance, selectedAccount.allow_negative);
    const system = accountSystemBalance(selectedAccount);
    return { system, actual, difference: actual - system };
  } catch {
    return null;
  }
};

const useReconciliationData = () => {
  const accountsResource = useApiResource("accounts.list");
  const historyResource = useApiResource("reconciliations.list", { limit: 100 });
  const [historyAccountId, setHistoryAccountId] = useState("all");
  const accounts = Array.isArray(accountsResource.data?.items) ? accountsResource.data.items : EMPTY_ACCOUNTS;
  const reconcilableAccounts = useMemo(() => accounts.filter((account) => account.status === "active" && account.can_reconcile === true), [accounts]);
  const accountLookup = useMemo(() => Object.fromEntries(accounts.map((account) => [account.account_id, accountDisplayLabel(account)])), [accounts]);
  const historyItems = (historyResource.data?.items || []).filter((item) => historyAccountId === "all" || item.account_id === historyAccountId);
  return { accountsResource, historyResource, historyAccountId, setHistoryAccountId, accounts, reconcilableAccounts, accountLookup, historyItems };
};

const ReconciliationsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const navigate = useNavigate();
  const attentionHandled = useRef(false);
  const { refreshAll, invalidate } = useFinance();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [actualBalanceEdited, setActualBalanceEdited] = useState(false);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [message, setMessage] = useState(null);
  const [resultOverlay, setResultOverlay] = useState(null);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const selectedAccountId = selectedAccount?.account_id || "";
  const selectedSystemBalance = selectedAccount ? accountSystemBalance(selectedAccount) : null;
  const preview = useMemo(() => getDifferencePreview(selectedAccount, form.actual_balance), [selectedAccount, form.actual_balance]);
  const attentionAccountId = String(attention?.accountId || "");

  useEffect(() => {
    if (!selectedAccountId || actualBalanceEdited || selectedSystemBalance === null) return;
    setForm((current) => current.account_id === selectedAccountId && current.actual_balance !== selectedSystemBalance
      ? { ...current, actual_balance: selectedSystemBalance }
      : current);
  }, [actualBalanceEdited, selectedAccountId, selectedSystemBalance]);

  useEffect(() => {
    if (attentionHandled.current || !attentionAccountId || data.accountsResource.status !== "ready") return;
    attentionHandled.current = true;
    const attentionAccount = data.reconcilableAccounts.find((account) => account.account_id === attentionAccountId) || null;
    if (!form.account_id && attentionAccount) {
      setActualBalanceEdited(false);
      setForm((current) => ({ ...current, account_id: attentionAccountId, actual_balance: accountSystemBalance(attentionAccount) }));
    }
    consumeAttention();
  }, [attentionAccountId, consumeAttention, data.accountsResource.status, data.reconcilableAccounts, form.account_id]);

  const submitReconciliation = async (event) => {
    event.preventDefault();
    if (["submitting", "syncing"].includes(submitState.status)) return;
    setMessage(null);
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat direkonsiliasi.") }); return; }
    let actualBalance;
    try { actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative); } catch (error) { setSubmitState({ status: "error", error }); return; }
    const accountLabel = accountDisplayLabel(selectedAccount);
    setSubmitState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({ account_id: selectedAccount.account_id, actual_balance: actualBalance, notes: form.notes }, {});
      const difference = Number(result.difference || 0);
      const matched = difference === 0;
      if (!matched) {
        const differenceLabel = `Rp ${Math.abs(difference).toLocaleString("id-ID")}`;
        setMessage({ type: "warning", text: `Pencocokan tersimpan dengan selisih ${differenceLabel}. Periksa transaksi tertinggal sebelum membuat penyesuaian.`, accountId: selectedAccount.account_id });
      }
      setActualBalanceEdited(false);
      setForm((current) => ({ ...current, actual_balance: Number(result.system_balance ?? selectedAccount.balance ?? 0), notes: "" }));
      setSubmitState({ status: "syncing", error: null });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]);
      const refreshOutcomes = await Promise.allSettled([data.historyResource.reload(), refreshAll()]);
      const refreshIncomplete = refreshOutcomes.some((outcome) => outcome.status === "rejected");
      setResultOverlay({
        matched,
        accountLabel,
        actualBalance: Number(result.actual_balance ?? actualBalance),
        systemBalance: Number(result.system_balance ?? selectedAccount.balance ?? 0),
        difference,
        refreshIncomplete,
      });
      setSubmitState({ status: "idle", error: null });
    } catch (error) {
      setSubmitState({ status: "error", error });
    }
  };

  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <LoadingScreen label="Memuat pencocokan saldo..." />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;
  const attentionFromDashboard = ["reconciliation_difference", "reconciliation_stale"].includes(attention?.attentionType);
  return (
    <div className={`page-stack ${styles.page}`}>
      <RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} />
      <RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} />
      <PageHeader title="Cocokkan Saldo" help="Bandingkan saldo rekening dengan catatan aplikasi." />
      {attentionFromDashboard ? <CompactNotice tone="info" title="Periksa saldo aktual." role="status">{selectedAccount?.account_id === attentionAccountId ? "Rekening sudah dipilih otomatis. Sistem membandingkan dengan saldo tercatat." : "Pilih rekening yang ingin diperiksa."}</CompactNotice> : null}
      {message ? <div className={`notice notice--${message.type}`} role="status"><span>{message.text}</span>{message.accountId ? <div className="form-actions"><Button type="button" onClick={() => navigate("/transaksi", { state: { accountId: message.accountId, period: currentMonthInJakarta() } })}>Lihat transaksi rekening</Button></div> : null}</div> : null}
      <ReconciliationInputPanel
        accountSystemBalance={accountSystemBalance}
        getDifferencePreview={getDifferencePreview}
        parseActualBalance={parseActualBalance}
        accounts={data.reconcilableAccounts}
        selectedAccount={selectedAccount}
        form={form}
        setForm={setForm}
        submitState={submitState}
        setSubmitState={setSubmitState}
        setActualBalanceEdited={setActualBalanceEdited}
        onSubmit={submitReconciliation}
        preview={preview}
        onRefreshAccounts={data.accountsResource.reload}
        accountsRefreshing={data.accountsResource.isRefreshing || ["submitting", "syncing"].includes(submitState.status)}
      />
      <ReconciliationHistory formatReconciledAt={formatReconciledAt} accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} />
      <ReconciliationResultOverlay result={resultOverlay} onClose={() => setResultOverlay(null)} />
    </div>
  );
};

export default ReconciliationsPage;
