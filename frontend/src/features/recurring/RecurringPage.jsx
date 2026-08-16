import { lazy, Suspense, useState } from "react";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { filterByAssigneeAccess, filterByOwnership } from "../../domain/ownership.js";
import {
  useRecurringAttention,
  useRecurringOccurrenceRecovery,
  useRecurringPaymentActions,
  useRecurringRuleActions,
} from "./useRecurringActions.js";
import { SchedulePeriodSection, ScheduleSummary } from "./RecurringSchedule.jsx";
import { scheduleMatchesFilter } from "./recurringPresentation.js";
import styles from "./RecurringPage.module.css";

const RecurringDialogLayer = lazy(() => import("./RecurringDialogLayer.jsx"));

const activeAccounts = (bootstrap) => bootstrap?.accounts?.filter((item) => item.status === "active") || [];
const activeCategories = (bootstrap, kind) => bootstrap?.categories?.filter((item) => item.status === "active" && item.transaction_type === kind) || [];

const eligiblePaymentEnvelopes = (items, payment, account, user) => {
  if (payment.item?.kind !== "expense" || !account?.account_id) return [];
  const active = (items || []).filter((item) => item.status === "active"
    && payment.transaction_date >= item.period_start
    && payment.transaction_date <= item.period_end
    && (!item.source_account_id || item.source_account_id === account.account_id));
  return filterByAssigneeAccess(filterByOwnership(active, account), user);
};

const recurringViewData = ({ resource, filter, bootstrap, rules, payments, envelopeResource, user }) => {
  const allItems = resource.data?.items || [];
  const accounts = activeAccounts(bootstrap);
  const paymentAccounts = filterByOwnership(accounts, payments.payment.item);
  const selectedPaymentAccount = paymentAccounts.find((item) => item.account_id === payments.payment.account_id) || null;
  return {
    allItems,
    filteredItems: allItems.filter((item) => scheduleMatchesFilter(item, filter)),
    accounts,
    categories: activeCategories(bootstrap, rules.form.kind),
    editCategories: activeCategories(bootstrap, rules.editRule?.kind),
    paymentAccounts,
    paymentEnvelopes: eligiblePaymentEnvelopes(envelopeResource.data?.items || [], payments.payment, selectedPaymentAccount, bootstrap?.user || user),
  };
};

const recurringDialogOpen = ({ rules, payments, recovery }) => Boolean(
  rules.createOpen
  || rules.editRule
  || rules.archiveRuleTarget
  || payments.payment.item
  || payments.reverseTarget
  || recovery.skipTarget
  || recovery.restoreOccurrenceTarget,
);

const RecurringPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("expense");
  const [expandedId, setExpandedId] = useState(null);
  const resource = useApiResource("recurring.list", { period });
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const shared = { resource, refreshOverview, invalidate, notify };
  const rules = useRecurringRuleActions(shared);
  const payments = useRecurringPaymentActions(shared);
  const { openPayment } = payments;
  const recovery = useRecurringOccurrenceRecovery(shared);
  const envelopeResource = useApiResource("envelopes.list", { period }, { enabled: payments.payment.item?.kind === "expense" });
  const view = recurringViewData({ resource, filter, bootstrap, rules, payments, envelopeResource, user });
  const attentionOccurrenceId = useRecurringAttention({ attention, consumeAttention, resource, setFilter, setKind, setExpandedId, openPayment });

  if (resource.status === "loading") return <LoadingScreen label="Memuat jadwal rutin..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const { allItems, filteredItems, accounts, categories, editCategories, paymentAccounts, paymentEnvelopes } = view;
  const actions = { openPayment: payments.openPayment, openReverse: payments.openReverse, openSkip: recovery.openSkip, openRestore: recovery.openRestore, openRuleEditor: rules.openRuleEditor, openArchive: rules.openArchive };
  const headerActions = <div className={styles.headerActions}><label className="field field--compact"><span>Periode</span><input type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setFilter("all"); setKind("expense"); setExpandedId(null); }} /></label>{user?.role === "owner" ? <Button variant="primary" icon={FiPlus} onClick={rules.openCreate}>Tambah jadwal</Button> : null}</div>;

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Jadwal rutin" actions={headerActions} />{attentionOccurrenceId ? <div className="notice notice--info attention-guidance" role="status"><strong>Selesaikan jadwal yang dipilih.</strong><span>Jika transaksi sudah terjadi, catat nominal aktual dan rekeningnya. Saldo baru berubah setelah Anda menyimpan pembayaran/penerimaan.</span></div> : null}
      <ScheduleSummary items={allItems} onAttention={() => {
        const attentionItem = allItems.find((item) => scheduleMatchesFilter(item, "attention"));
        setFilter("attention");
        if (attentionItem) setKind(attentionItem.kind === "income" ? "income" : "expense");
        setExpandedId(null);
      }} />
      <SchedulePeriodSection
        items={filteredItems}
        allItems={allItems}
        kind={kind}
        setKind={setKind}
        filter={filter}
        setFilter={setFilter}
        actions={actions}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        accounts={bootstrap?.accounts || []}
        categories={bootstrap?.categories || []}
      />
      {recurringDialogOpen({ rules, payments, recovery }) ? (
        <Suspense fallback={null}>
          <RecurringDialogLayer rules={rules} payments={payments} recovery={recovery} categories={categories} editCategories={editCategories} accounts={accounts} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeResource.status} />
        </Suspense>
      ) : null}
    </div>
  );
};

export default RecurringPage;
