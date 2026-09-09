import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { useNavigate } from "react-router";
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
  const reconcilableAccounts = useMemo(() => accounts.filter((account) => account.status === "active" && account.can_reconcile === true && account.account_type !== "investment"), [accounts]);
  const accountLookup = useMemo(() => Object.fromEntries(accounts.map((account) => [account.account_id, accountDisplayLabel(account)])), [accounts]);
  const historyItems = (historyResource.data?.items || []).filter((item) => historyAccountId === "all" || item.account_id === historyAccountId);
  return { accountsResource, historyResource, historyAccountId, setHistoryAccountId, accounts, reconcilableAccounts, accountLookup, historyItems };
};

const useDashboardAttentionPrefill = ({ attentionAccountId, resourceStatus, reconcilableAccounts, formAccountId, consumeAttention, setForm }) => {
  useEffect(() => {
    if (!attentionAccountId || resourceStatus !== "ready") return;
    const attentionAccount = reconcilableAccounts.find((account) => account.account_id === attentionAccountId) || null;
    if (!formAccountId && attentionAccount) setForm({ account_id: attentionAccountId, actual_balance: "", notes: "" });
    consumeAttention();
  }, [attentionAccountId, consumeAttention, formAccountId, reconcilableAccounts, resourceStatus, setForm]);
};

const useReconciliationSubmission = ({ selectedAccount, form, setForm, data, refreshAll, invalidate }) => {
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [resultOverlay, setResultOverlay] = useState(null);

  const persistBalance = useCallback(async ({ actualBalance, notes }) => {
    if (["submitting", "syncing", "completed"].includes(submitState.status)) return;
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat dicocokkan.") }); return; }
    const accountLabel = accountDisplayLabel(selectedAccount);
    setSubmitState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({ account_id: selectedAccount.account_id, actual_balance: actualBalance, notes }, {});
      const difference = Number(result.difference || 0);
      setForm((current) => ({ ...current, actual_balance: "", notes: "" }));
      setSubmitState({ status: "syncing", error: null });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]);
      const refreshOutcomes = await Promise.allSettled([data.historyResource.reload(), refreshAll()]);
      setResultOverlay({
        matched: difference === 0,
        accountId: selectedAccount.account_id,
        accountLabel,
        actualBalance: Number(result.actual_balance ?? actualBalance),
        systemBalance: Number(result.system_balance ?? selectedAccount.balance ?? 0),
        difference,
        refreshIncomplete: refreshOutcomes.some((outcome) => outcome.status === "rejected"),
      });
      setSubmitState({ status: "completed", error: null });
    } catch (error) {
      setSubmitState({ status: "error", error });
    }
  }, [data.historyResource, invalidate, refreshAll, selectedAccount, setForm, submitState.status]);

  const confirmSystemBalance = useCallback(() => {
    if (!selectedAccount) return;
    return persistBalance({ actualBalance: accountSystemBalance(selectedAccount), notes: "" });
  }, [persistBalance, selectedAccount]);

  const submitDifference = useCallback((event) => {
    event.preventDefault();
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat dicocokkan.") }); return; }
    try {
      const actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative);
      return persistBalance({ actualBalance, notes: form.notes });
    } catch (error) {
      setSubmitState({ status: "error", error });
    }
  }, [form.actual_balance, form.notes, persistBalance, selectedAccount]);

  return { submitState, setSubmitState, resultOverlay, setResultOverlay, confirmSystemBalance, submitDifference };
};

const ReconciliationsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const navigate = useNavigate();
  const attentionReturnPathRef = useRef(attention?.attentionSource === "notification-center" ? "/notifikasi" : "/");
  const { refreshAll, invalidate } = useFinance();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const preview = useMemo(() => getDifferencePreview(selectedAccount, form.actual_balance), [selectedAccount, form.actual_balance]);
  const attentionAccountId = String(attention?.accountId || "");
  const submission = useReconciliationSubmission({ selectedAccount, form, setForm, data, refreshAll, invalidate });

  useEffect(() => {
    if (attention?.attentionSource === "notification-center") attentionReturnPathRef.current = "/notifikasi";
    else if (attention?.attentionSource === "dashboard") attentionReturnPathRef.current = "/";
  }, [attention?.attentionSource]);

  useDashboardAttentionPrefill({ attentionAccountId, resourceStatus: data.accountsResource.status, reconcilableAccounts: data.reconcilableAccounts, formAccountId: form.account_id, consumeAttention, setForm });

  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <LoadingScreen label="Memuat pencocokan saldo..." />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;

  const reconciliationAttention = ["reconciliation_difference", "reconciliation_stale"].includes(attention?.attentionType);
  const contextLocked = reconciliationAttention && Boolean(selectedAccount?.account_id) && selectedAccount.account_id === attentionAccountId;
  const finishReconciliation = () => navigate(attentionReturnPathRef.current);
  const reviewReconciliationTransactions = () => submission.resultOverlay?.accountId
    ? navigate("/transaksi", { state: { accountId: submission.resultOverlay.accountId, period: currentMonthInJakarta() } })
    : finishReconciliation();

  return (
    <div className={`page-stack ${styles.page}`}>
      <RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} />
      <RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} />
      <PageHeader title="Cocokkan Saldo" help="Pastikan catatan aplikasi sama dengan saldo yang benar-benar Anda lihat." />
      {reconciliationAttention && !contextLocked ? <CompactNotice tone="warning" title="Rekening pengingat tidak tersedia." role="status">Pilih rekening yang masih aktif dan dapat Anda cocokkan.</CompactNotice> : null}
      <ReconciliationInputPanel
        accountSystemBalance={accountSystemBalance}
        contextLocked={contextLocked}
        accounts={data.reconcilableAccounts}
        selectedAccount={selectedAccount}
        form={form}
        setForm={setForm}
        submitState={submission.submitState}
        setSubmitState={submission.setSubmitState}
        onConfirmSystemBalance={submission.confirmSystemBalance}
        onSubmitDifference={submission.submitDifference}
        preview={preview}
        onRefreshAccounts={data.accountsResource.reload}
        accountsRefreshing={data.accountsResource.isRefreshing || ["submitting", "syncing"].includes(submission.submitState.status)}
      />
      <section className={styles.historyDisclosure} aria-label="Riwayat pencocokan saldo">
        <button
          type="button"
          className={styles.historyDisclosureButton}
          aria-expanded={historyExpanded}
          aria-controls="reconciliation-history-content"
          onClick={() => setHistoryExpanded((current) => !current)}
        >
          <span><strong>Riwayat pencocokan</strong><small>{data.historyItems.length} hasil pada filter saat ini</small></span>
          <FiChevronDown className={styles.historyDisclosureChevron} data-expanded={historyExpanded ? "true" : "false"} aria-hidden="true" />
        </button>
        <div id="reconciliation-history-content" className={`${styles.historyDisclosureContent}${historyExpanded ? ` ${styles.isExpanded}` : ""}`}>
          <ReconciliationHistory formatReconciledAt={formatReconciledAt} accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} />
        </div>
      </section>
      <ReconciliationResultOverlay result={submission.resultOverlay} onClose={finishReconciliation} onReviewTransactions={reviewReconciliationTransactions} />
    </div>
  );
};

export default ReconciliationsPage;
