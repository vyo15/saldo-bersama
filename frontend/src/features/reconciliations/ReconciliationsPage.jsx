import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ContextBack from "../../components/navigation/ContextBack.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { currentMonthInJakarta, formatDateTimeJakarta } from "../../domain/dates.js";
import { contextualNavigationParent, navigationLabelForPath, safeInternalNavigationTarget } from "../../config/navigation.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { parseRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { createReconciliation, isReconciliationOutcomeUnknownError } from "./reconciliations.api.js";

import styles from "./ReconciliationsPage.module.css";
import ReconciliationInputPanel from "./components/ReconciliationForm.jsx";
const ReconciliationHistory = lazy(() => import("./components/ReconciliationHistory.jsx"));
const ReconciliationResolution = lazy(() => import("./components/ReconciliationResolution.jsx"));

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

const useRequestedAccountPrefill = ({ requestedAccountId, resourceStatus, reconcilableAccounts, formAccountId, consumeAttention, shouldConsumeAttention, setForm }) => {
  useEffect(() => {
    if (!requestedAccountId || resourceStatus !== "ready") return;
    const requestedAccount = reconcilableAccounts.find((account) => account.account_id === requestedAccountId) || null;
    if (!formAccountId && requestedAccount) setForm({ account_id: requestedAccountId, actual_balance: "", notes: "" });
    if (shouldConsumeAttention) consumeAttention();
  }, [consumeAttention, formAccountId, reconcilableAccounts, requestedAccountId, resourceStatus, setForm, shouldConsumeAttention]);
};

const useReconciliationSubmission = ({ selectedAccount, form, setForm, data, refreshAll, invalidate }) => {
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [resultOverlay, setResultOverlay] = useState(null);

  const persistBalance = useCallback(async ({ actualBalance, notes, resolvedFromDifference = 0 }) => {
    if (["submitting", "syncing"].includes(submitState.status)) return;
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat diperiksa.") }); return; }
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
        reconciliationId: String(result.reconciliation_id || ""),
        accountId: selectedAccount.account_id,
        accountLabel,
        actualBalance: Number(result.actual_balance ?? actualBalance),
        systemBalance: Number(result.system_balance ?? selectedAccount.balance ?? 0),
        difference,
        resolvedFromDifference: Number(resolvedFromDifference || 0),
        refreshIncomplete: refreshOutcomes.some((outcome) => outcome.status === "rejected"),
      });
      setSubmitState({ status: "completed", error: null });
    } catch (error) {
      setSubmitState({ status: isReconciliationOutcomeUnknownError(error) ? "unknown" : "error", error });
    }
  }, [data.historyResource, invalidate, refreshAll, selectedAccount, setForm, submitState.status]);

  const recheckDifference = useCallback(() => {
    if (!resultOverlay?.accountId || selectedAccount?.account_id !== resultOverlay.accountId) return;
    return persistBalance({
      actualBalance: resultOverlay.actualBalance,
      notes: "Pemeriksaan ulang setelah penyelesaian selisih.",
      resolvedFromDifference: resultOverlay.difference,
    });
  }, [persistBalance, resultOverlay, selectedAccount?.account_id]);

  const submitDifference = useCallback((event) => {
    event.preventDefault();
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat diperiksa.") }); return; }
    try {
      const actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative);
      return persistBalance({ actualBalance, notes: form.notes });
    } catch (error) {
      setSubmitState({ status: "error", error });
    }
  }, [form.actual_balance, form.notes, persistBalance, selectedAccount]);

  return { submitState, setSubmitState, resultOverlay, setResultOverlay, submitDifference, recheckDifference };
};


const reconciliationReturnTarget = (locationState, attentionSource) => {
  const accountEntry = locationState?.reconciliationSource === "account";
  const parent = contextualNavigationParent("/rekonsiliasi") || { to: "/rekening", label: "Rekening" };
  const fallback = accountEntry
    ? parent.to
    : attentionSource === "notification-center"
      ? "/notifikasi"
      : attentionSource === "dashboard"
        ? "/"
        : parent.to;
  const to = safeInternalNavigationTarget(locationState?.returnTo, fallback);
  const fallbackLabel = to === "/notifikasi" ? "Notifikasi" : to === parent.to ? parent.label : "Beranda";
  const label = String(locationState?.returnLabel || navigationLabelForPath(to, fallbackLabel));
  return { to, label };
};

const requestedReconciliationAccountId = (attention, locationState) => String(attention?.accountId || locationState?.accountId || "");

const reconciliationContextLocked = (requestedAccountId, selectedAccount) => Boolean(requestedAccountId)
  && Boolean(selectedAccount?.account_id)
  && selectedAccount.account_id === requestedAccountId;

const reconciliationPageTitle = (selectedAccount) => selectedAccount
  ? `Pastikan saldo ${accountDisplayLabel(selectedAccount)} sesuai`
  : "Pastikan Saldo Sesuai";

const reconciliationAccountsRefreshing = (accountsResource, submitStatus) => accountsResource.isRefreshing
  || ["submitting", "syncing"].includes(submitStatus);

const ReconciliationAttentionNotice = ({ attentionType, contextLocked }) => {
  const relevant = ["reconciliation_difference", "reconciliation_stale"].includes(attentionType);
  if (!relevant || contextLocked) return null;
  return <CompactNotice tone="warning" title="Rekening pengingat tidak tersedia." role="status">Pilih rekening yang masih aktif dan dapat diperiksa.</CompactNotice>;
};

const useMatchedReconciliationFeedback = ({ resultOverlay, setResultOverlay, notify, navigate, returnPathRef, accountEntry }) => {
  useEffect(() => {
    if (!resultOverlay?.matched || resultOverlay.resolvedFromDifference) return;
    const { accountId, accountLabel } = resultOverlay;
    notify({ message: `Saldo ${accountLabel} sudah sesuai.`, tone: "success", dedupeKey: `reconciliation:matched:${accountId}` });
    setResultOverlay(null);
    navigate(returnPathRef.current.to, {
      replace: accountEntry,
      state: accountEntry ? { accountId } : undefined,
    });
  }, [accountEntry, navigate, notify, resultOverlay, returnPathRef, setResultOverlay]);
};

const useReconciliationResultActions = ({ resultOverlay, accountEntry, requestedAccountId, returnPathRef, navigate, openTransactionComposer }) => {
  const finishReconciliation = useCallback(() => navigate(returnPathRef.current.to, {
    replace: accountEntry,
    state: accountEntry && requestedAccountId ? { accountId: requestedAccountId } : undefined,
  }), [accountEntry, navigate, requestedAccountId, returnPathRef]);

  const recordMissingTransaction = useCallback((transactionType, suggestedAmount = 0) => {
    if (!resultOverlay?.accountId || !resultOverlay.difference) return;
    const supported = new Set([TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.REFUND]);
    if (!supported.has(transactionType)) return;
    const amount = Math.abs(Number(suggestedAmount || resultOverlay.difference || 0));
    const outgoing = transactionType === TRANSACTION_TYPES.EXPENSE;
    const incoming = [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND].includes(transactionType);
    const labels = { expense: "pengeluaran", income: "pemasukan", transfer: "transfer", refund: "refund" };
    openTransactionComposer({
      initialType: transactionType,
      lockType: true,
      initialSourceAccountId: outgoing ? resultOverlay.accountId : "",
      initialDraft: {
        transaction_type: transactionType,
        source_account_id: outgoing ? resultOverlay.accountId : "",
        destination_account_id: incoming ? resultOverlay.accountId : "",
        amount,
      },
      title: `Catat ${labels[transactionType]} yang belum masuk`,
      description: "Jenis aktivitas dipilih oleh Anda. Nominal selisih hanya dipakai sebagai bantuan awal dan tetap dapat diperiksa sebelum disimpan.",
    });
  }, [openTransactionComposer, resultOverlay]);

  const reviewReconciliationTransactions = useCallback(() => {
    if (!resultOverlay?.accountId) return finishReconciliation();
    return navigate("/transaksi", { state: { accountId: resultOverlay.accountId, period: currentMonthInJakarta() } });
  }, [finishReconciliation, navigate, resultOverlay]);

  const openDiagnosisCandidate = useCallback((candidate) => {
    if (candidate?.kind === "recurring" && candidate.occurrence_id) {
      navigate("/perencanaan/jadwal", { state: { workflowSource: "reconciliation", workflowAction: "pay-recurring", occurrenceId: candidate.occurrence_id, period: candidate.period || currentMonthInJakarta() } });
      return;
    }
    reviewReconciliationTransactions();
  }, [navigate, reviewReconciliationTransactions]);

  return { finishReconciliation, recordMissingTransaction, reviewReconciliationTransactions, openDiagnosisCandidate };
};

const ReconciliationHistoryDisclosure = ({ expanded, setExpanded, data }) => <section className={styles.historyDisclosure} aria-label="Riwayat pemeriksaan saldo">
  <button
    type="button"
    className={styles.historyDisclosureButton}
    aria-expanded={expanded}
    aria-controls="reconciliation-history-content"
    onClick={() => setExpanded((current) => !current)}
  >
    <span><strong>Riwayat pemeriksaan</strong><small>{data.historyItems.length} hasil pada filter saat ini</small></span>
    <FiChevronDown className={styles.historyDisclosureChevron} data-expanded={expanded ? "true" : "false"} aria-hidden="true" />
  </button>
  <div id="reconciliation-history-content" className={`${styles.historyDisclosureContent}${expanded ? ` ${styles.isExpanded}` : ""}`}>
    <Suspense fallback={<div className={styles.historyLoading} role="status">Memuat riwayat pemeriksaan…</div>}>
      <ReconciliationHistory formatReconciledAt={formatReconciledAt} accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} />
    </Suspense>
  </div>
</section>;

const ReconciliationsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useFeedback();
  const { openTransactionComposer } = useTransactionComposer();
  const accountEntry = location.state?.reconciliationSource === "account";
  const returnTarget = reconciliationReturnTarget(location.state, attention?.attentionSource);
  const returnTargetRef = useRef(returnTarget);
  returnTargetRef.current = returnTarget;
  const { refreshAll, invalidate } = useFinance();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const preview = useMemo(() => getDifferencePreview(selectedAccount, form.actual_balance), [selectedAccount, form.actual_balance]);
  const attentionAccountId = String(attention?.accountId || "");
  const requestedAccountId = requestedReconciliationAccountId(attention, location.state);
  const submission = useReconciliationSubmission({ selectedAccount, form, setForm, data, refreshAll, invalidate });

  useRequestedAccountPrefill({ requestedAccountId, resourceStatus: data.accountsResource.status, reconcilableAccounts: data.reconcilableAccounts, formAccountId: form.account_id, consumeAttention, shouldConsumeAttention: Boolean(attentionAccountId), setForm });
  useMatchedReconciliationFeedback({ resultOverlay: submission.resultOverlay, setResultOverlay: submission.setResultOverlay, notify, navigate, returnPathRef: returnTargetRef, accountEntry });
  const resultActions = useReconciliationResultActions({ resultOverlay: submission.resultOverlay, accountEntry, requestedAccountId, returnPathRef: returnTargetRef, navigate, openTransactionComposer });

  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <NativePageSkeleton kind="reconciliations" label="Memuat pemeriksaan saldo…" />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;

  const contextLocked = reconciliationContextLocked(requestedAccountId, selectedAccount);
  const pageTitle = reconciliationPageTitle(selectedAccount);
  const accountsRefreshing = reconciliationAccountsRefreshing(data.accountsResource, submission.submitState.status);

  return <div className={`page-stack ${styles.page}`}>
    <ContextBack className={styles.contextBack} to={returnTarget.to} label={returnTarget.label} state={accountEntry && requestedAccountId ? { accountId: requestedAccountId } : undefined} />
    <RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} />
    <RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} />
    <PageHeader title={pageTitle} help="Bandingkan saldo yang tercatat dengan saldo yang Anda lihat saat ini." />
    <ReconciliationAttentionNotice attentionType={attention?.attentionType} contextLocked={contextLocked} />
    <div className={styles.workspace}>
      <ReconciliationInputPanel
        accountSystemBalance={accountSystemBalance}
        contextLocked={contextLocked}
        accounts={data.reconcilableAccounts}
        selectedAccount={selectedAccount}
        form={form}
        setForm={setForm}
        submitState={submission.submitState}
        setSubmitState={submission.setSubmitState}
        onSubmitDifference={submission.submitDifference}
        preview={preview}
        onRefreshAccounts={data.accountsResource.reload}
        accountsRefreshing={accountsRefreshing}
      />
      {submission.resultOverlay ? <Suspense fallback={<div className={styles.analysisPlaceholder} role="status"><strong>Menyiapkan bantuan…</strong><small>Membaca hasil pemeriksaan saldo.</small></div>}>
        <ReconciliationResolution
          result={submission.resultOverlay}
          currentSystemBalance={selectedAccount ? accountSystemBalance(selectedAccount) : submission.resultOverlay.systemBalance}
          onClose={resultActions.finishReconciliation}
          onRecordTransaction={resultActions.recordMissingTransaction}
          onReviewTransactions={resultActions.reviewReconciliationTransactions}
          onOpenCandidate={resultActions.openDiagnosisCandidate}
          onRecheck={submission.recheckDifference}
        />
      </Suspense> : <div className={styles.analysisPlaceholder} aria-hidden="true"><span className={styles.analysisBadge}>Bantuan otomatis</span><strong>Jika ada selisih, kami bantu mencari penyebabnya.</strong><small>Jadwal rutin, transaksi serupa, dan aktivitas terbaru dianalisis tanpa mengubah saldo otomatis.</small></div>}
    </div>
    <ReconciliationHistoryDisclosure expanded={historyExpanded} setExpanded={setHistoryExpanded} data={data} />
  </div>;
};

export default ReconciliationsPage;
