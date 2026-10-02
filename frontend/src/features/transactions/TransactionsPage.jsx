import { APP_MEDIA } from "../../config/layout.js";
import styles from "./TransactionsPage.module.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiPlus, FiRotateCcw } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { cancelTransaction as requestCancelTransaction, restoreTransaction as requestRestoreTransaction } from "./transactions.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { collectionEmptyState, EMPTY_COLLECTION_STATE } from "../../shared/presentation/emptyState.js";

const TransferRequestsPanel = lazy(() => import("./TransferRequestsPanel.jsx"));
const MobileTransactionHistory = lazy(() => import("./components/MobileTransactionHistory.jsx"));
const DesktopTransactionWorkspace = lazy(() => import("./components/DesktopTransactionWorkspace.jsx"));
const TransactionFilters = lazy(() => import("./components/TransactionFilters.jsx"));
const TransactionLifecycleModals = lazy(() => import("./components/TransactionLifecycleModals.jsx"));
const TransactionDesktopResults = lazy(() => import("./components/TransactionDesktopResults.jsx"));
const TransactionDetailModal = lazy(() => import("./components/TransactionDetailModal.jsx"));
const TransactionForm = lazy(() => import("./TransactionForm.jsx"));

const PAGE_SIZE = 50;
const useMobileTransactionsLayout = () => useMediaQuery(APP_MEDIA.mobile);
const refreshKeys = Object.freeze(["transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState", "archive.list"]);
const defaultFilterOptions = Object.freeze({ accounts: [], categories: [], creators: [] });

const initialFilters = (state) => ({
  period: typeof state?.period === "string" && /^\d{4}-\d{2}$/.test(state.period) ? state.period : currentMonthInJakarta(),
  query: "",
  type: state?.allocation === "unallocated" ? "expense" : "all",
  allocation: ["allocated", "unallocated"].includes(state?.allocation) ? state.allocation : "all",
  account: typeof state?.accountId === "string" && state.accountId ? state.accountId : "all",
  category: "all",
  creator: typeof state?.creatorId === "string" && state.creatorId.trim() ? state.creatorId.trim() : "all",
  offset: 0,
});

const transactionQuery = (filters) => ({ period: filters.period, limit: PAGE_SIZE, offset: filters.offset, query: filters.query, transaction_type: filters.type, allocation: filters.allocation, account_id: filters.account, category_id: filters.category, created_by: filters.creator });
const accountLabelFor = (lookup, item) => item.transaction_type === "transfer" ? `${lookup[item.source_account_id] || "Rekening asal"} → ${lookup[item.destination_account_id] || "Rekening tujuan"}` : lookup[item.source_account_id] || lookup[item.destination_account_id] || "Rekening tidak tersedia";
const categoryLabelFor = (lookup, item) => lookup[item.category_id]?.name || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum masuk Alokasi Dana");
const repeatDraftFromTransaction = (item) => ({
  transaction_type: item.transaction_type,
  amount: String(item.amount || ""),
  source_account_id: item.source_account_id || "",
  destination_account_id: item.destination_account_id || "",
  category_id: item.category_id || "",
  payment_method: item.payment_method || "",
  merchant: item.merchant || "",
  description: item.description || "",
});

const useTransactionLifecycle = ({ resource, reportResource, refreshOverview, invalidate }) => {
  const [cancelTarget, setCancelTarget] = useState(null); const [cancelState, setCancelState] = useState({ status: "idle", error: null }); const [restoreTarget, setRestoreTarget] = useState(null); const [restoreState, setRestoreState] = useState({ status: "idle", error: null });
  const refresh = async () => { invalidate(refreshKeys); await Promise.allSettled([resource.reload(), reportResource.reload(), refreshOverview()]); };
  const cancelTransaction = async (reason) => { if (!cancelTarget) return; setCancelState({ status: "submitting", error: null }); try { await requestCancelTransaction({ transactionId: cancelTarget.transaction_id, rowVersion: cancelTarget.row_version, reason }, { rowVersion: cancelTarget.row_version }); setCancelTarget(null); setCancelState({ status: "idle", error: null }); await refresh(); } catch (error) { setCancelState({ status: "error", error }); } };
  const restoreCancelledTransaction = async (reason) => { if (!restoreTarget) return; setRestoreState({ status: "submitting", error: null }); try { await requestRestoreTransaction({ transaction_id: restoreTarget.transaction_id, row_version: restoreTarget.row_version, reason }, { rowVersion: restoreTarget.row_version }); setRestoreTarget(null); setRestoreState({ status: "idle", error: null }); await refresh(); } catch (error) { setRestoreState({ status: "error", error }); } };
  const openCancel = (item) => { setCancelTarget(item); setCancelState({ status: "idle", error: null }); }; const openRestore = (item) => { setRestoreTarget(item); setRestoreState({ status: "idle", error: null }); };
  return { cancelTarget, setCancelTarget, cancelState, restoreTarget, setRestoreTarget, restoreState, cancelTransaction, restoreCancelledTransaction, openCancel, openRestore };
};

const transactionPageData = (bootstrap, resource) => {
  const accounts = bootstrap?.accounts || [];
  const categories = bootstrap?.categories || [];
  const filterOptions = resource.data?.filterOptions || defaultFilterOptions;
  return {
    accountLookup: Object.fromEntries(accounts.map((item) => [item.account_id, accountDisplayLabel(item)])),
    categoryLookup: Object.fromEntries(categories.map((item) => [item.category_id, item])),
    creatorLookup: Object.fromEntries(filterOptions.creators.map((item) => [item.user_id, item.name || "Pengguna"])),
    items: resource.data?.items || [],
    filterOptions,
  };
};

const transactionFiltersActive = (filters) => Boolean(filters.query)
  || [filters.type, filters.allocation, filters.account, filters.category, filters.creator].some((value) => value !== "all");

const dashboardTransactionAttention = (attention, filters, items) => {
  const active = attention?.attentionType === "unallocated_expense" && filters.allocation === "unallocated";
  const editableTarget = active ? items.find((item) => item.status === "active" && item.can_edit) || null : null;
  return { active, editableTarget };
};

const TransactionAttentionNotice = ({ active, editableTarget, remaining = null, done = false }) => {
  if (done) return <CompactNotice tone="success" title="Review transaksi selesai." role="status">Semua pengeluaran yang dapat diperbaiki pada daftar ini sudah ditinjau.</CompactNotice>;
  if (!active) return null;
  const title = editableTarget ? "Hubungkan transaksi ke Kebutuhan yang sesuai." : "Rapikan pengeluaran yang belum masuk Kebutuhan.";
  const description = editableTarget
    ? "Transaksi pertama yang dapat diedit dibuka otomatis. Pilih Kebutuhan yang sesuai; jika tidak ada yang cocok, Alokasi Dana tetap dapat dipilih manual."
    : "Daftar sudah difilter ke pengeluaran yang belum masuk rencana. Buka transaksi yang dapat diedit, lalu pilih Kebutuhan yang sesuai.";
  return <CompactNotice tone="info" title={title} role="status">{description}{Number.isFinite(remaining) ? ` ${remaining} transaksi masih perlu ditinjau.` : ""}</CompactNotice>;
};

const memberTransferRequestsEnabled = (role) => Boolean(role) && role !== "owner";

const MemberTransferRequests = ({ role, resource, accounts }) => {
  if (!memberTransferRequestsEnabled(role)) return null;
  if (resource.status === "loading") return <NativePageSkeleton kind="transactions" variant="panel" label="Memuat pengajuan transfer…" />;
  if (resource.status === "error") return <RefreshWarning error={resource.error} onRetry={resource.reload} />;
  return <>
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    <Suspense fallback={<NativePageSkeleton kind="transactions" variant="panel" label="Menyiapkan pengajuan transfer…" />}><TransferRequestsPanel items={resource.data?.items || []} accounts={accounts || []} /></Suspense>
  </>;
};

const TransactionResourceStates = ({ resource, items, filtersActive, openTransactionComposer, resetFilters, mobileLayout }) => {
  const emptyState = collectionEmptyState({ visibleCount: items.length, totalCount: resource.data?.total, filtersActive });
  const filteredEmpty = emptyState === EMPTY_COLLECTION_STATE.FILTERED;
  return <>
    {resource.data?.periodLocked ? <div className="notice notice--warning" role="status">Periode ini dikunci karena periode ini atau periode setelahnya sudah ditutup. Administrator harus membuka kembali seluruh periode pengunci sebelum transaksi dapat diubah.</div> : null}
    {resource.status === "loading" ? <NativePageSkeleton kind="transactions" variant="panel" label="Memuat transaksi…" /> : null}
    {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
    {resource.status === "ready" && !items.length ? <EmptyState className={`${styles.emptyState} ${filteredEmpty ? styles.emptyStateFiltered : ""}`} title={filteredEmpty ? "Transaksi tidak ditemukan" : "Belum ada transaksi"} description={filteredEmpty ? "Ubah atau reset filter untuk melihat transaksi lain." : mobileLayout ? "Gunakan tombol Catat pada navigasi bawah untuk mencatat transaksi pertama." : "Catat transaksi pertama untuk mulai merekam aktivitas keuangan."} action={filteredEmpty ? <Button icon={FiRotateCcw} onClick={resetFilters}>Reset filter</Button> : mobileLayout ? null : <Button variant="primary" onClick={openTransactionComposer}>Catat transaksi</Button>} /> : null}
  </>;
};

const useTransactionReviewQueue = ({ attention, attentionFromDashboard, attentionEditableTarget, consumeAttention, resource, items, reportResource, setEditingTransaction }) => {
  const attentionHandled = useRef(false);
  const [state, setState] = useState(() => attention?.attentionType === "unallocated_expense" ? { active: true, remaining: null, done: false } : { active: false, remaining: null, done: false });
  useEffect(() => {
    if (attentionHandled.current || !attentionFromDashboard || resource.status !== "ready") return;
    attentionHandled.current = true;
    setState({ active: true, remaining: Number(resource.data?.total || items.length || 0), done: false });
    if (attentionEditableTarget) setEditingTransaction(attentionEditableTarget);
    consumeAttention();
  }, [attentionEditableTarget, attentionFromDashboard, consumeAttention, items.length, resource.data?.total, resource.status, setEditingTransaction]);
  const handleSaved = async () => {
    const [nextData] = await Promise.all([resource.reload(), reportResource.reload()]);
    if (!state.active) return;
    const nextItems = nextData?.items || [];
    const nextEditable = nextItems.find((item) => item.status === "active" && item.can_edit) || null;
    const remaining = Number(nextData?.total || nextItems.length || 0);
    if (!nextEditable) { setState({ active: false, remaining: 0, done: true }); return; }
    setState({ active: true, remaining, done: false });
    window.setTimeout(() => setEditingTransaction(nextEditable), 220);
  };
  return { state, handleSaved };
};


const useDirectTransactionDetail = ({ location, navigate, resourceStatus, items, setDetailTransaction }) => {
  const handled = useRef("");
  useEffect(() => {
    const transactionId = String(location.state?.transactionId || "");
    const key = transactionId ? `${location.key}:${transactionId}` : "";
    if (!transactionId || resourceStatus !== "ready" || handled.current === key) return;
    const target = items.find((item) => String(item.transaction_id) === transactionId);
    if (!target) return;
    handled.current = key;
    setDetailTransaction(target);
    navigate(location.pathname, { replace: true, state: null });
  }, [items, location.key, location.pathname, location.state, navigate, resourceStatus, setDetailTransaction]);
};

const transactionPageActions = ({ lifecycle, openTransactionComposer, setEditingTransaction, setDetailTransaction }) => {
  const openEdit = (item) => setEditingTransaction(item);
  const closeDetail = () => setDetailTransaction(null);
  const openRepeat = (item) => {
    closeDetail();
    openTransactionComposer({ initialType: item.transaction_type, initialSourceAccountId: item.source_account_id || "", initialDraft: repeatDraftFromTransaction(item) });
  };
  return {
    actions: { openEdit, openCancel: lifecycle.openCancel, openRestore: lifecycle.openRestore, openRepeat },
    detailActions: {
      openEdit: (item) => { closeDetail(); openEdit(item); },
      openCancel: (item) => { closeDetail(); lifecycle.openCancel(item); },
      openRestore: (item) => { closeDetail(); lifecycle.openRestore(item); },
      openRepeat,
    },
    closeDetail,
    openRepeat,
  };
};

const TransactionDetailOverlay = ({ target, ...props }) => {
  if (!target) return null;
  return <Suspense fallback={null}><TransactionDetailModal target={target} {...props} /></Suspense>;
};

const TransactionEditOverlay = ({ transaction, ...props }) => {
  if (!transaction) return null;
  return <Suspense fallback={null}><TransactionForm open transaction={transaction} {...props} /></Suspense>;
};

const TransactionsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { attention, consumeAttention } = useDashboardAttentionState();
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { openTransactionComposer } = useTransactionComposer();
  const mobileLayout = useMobileTransactionsLayout();
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState(() => initialFilters(location.state || attention));
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [detailTransaction, setDetailTransaction] = useState(null);
  const resource = useApiResource("transactions.list", transactionQuery(filters));
  const transferRequests = useApiResource("transferRequests.list", {}, { enabled: memberTransferRequestsEnabled(bootstrap?.user?.role) });
  const reportResource = useApiResource("reports.monthly", { period: filters.period, trend_months: 6 });
  const lifecycle = useTransactionLifecycle({ resource, reportResource, refreshOverview, invalidate });
  const { accountLookup, categoryLookup, creatorLookup, items, filterOptions } = transactionPageData(bootstrap, resource);
  useDirectTransactionDetail({ location, navigate, resourceStatus: resource.status, items, setDetailTransaction });
  const filtersActive = transactionFiltersActive(filters);
  const resetFilters = () => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); };
  const showHeaderCreate = !mobileLayout && (resource.status !== "ready" || items.length > 0 || filtersActive);
  const { active: attentionFromDashboard, editableTarget: attentionEditableTarget } = dashboardTransactionAttention(attention, filters, items);

  const submitSearch = (event) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, query: draftQuery.trim(), offset: 0 }));
  };
  const updateFilter = (key, value) => setFilters((current) => key === "period"
    ? { ...current, period: value, account: "all", category: "all", creator: "all", offset: 0 }
    : { ...current, [key]: value, offset: 0 });
  const accountLabel = (item) => accountLabelFor(accountLookup, item);
  const categoryLabel = (item) => categoryLabelFor(categoryLookup, item);
  const creatorLabel = (item) => creatorLookup[item.created_by] || "Pencatat tidak tersedia";
  const { actions, detailActions, closeDetail, openRepeat } = transactionPageActions({ lifecycle, openTransactionComposer, setEditingTransaction, setDetailTransaction });
  const resultProps = { items, categoryLookup, accountLabel, categoryLabel, actions, resource, filters, setFilters, onOpenDetail: setDetailTransaction };
  const modalProps = { ...lifecycle, accountLabel, categoryLabel };

  const reviewQueue = useTransactionReviewQueue({ attention, attentionFromDashboard, attentionEditableTarget, consumeAttention, resource, items, reportResource, setEditingTransaction });
  const reviewQueueState = reviewQueue.state;
  const handleEditSaved = reviewQueue.handleSaved;

  return <div className={`page-stack ${styles.page}`}>
    <RefreshWarning error={resource.refreshError || reportResource.refreshError} onRetry={() => Promise.all([resource.reload(), reportResource.reload()])} />
    <PageHeader title="Transaksi" description={mobileLayout ? undefined : "Analisis aktivitas dan telusuri seluruh pergerakan uang dalam satu workspace."} help="Catat pemasukan, pengeluaran, dan transfer di satu tempat." actions={showHeaderCreate ? <Button variant="primary" icon={FiPlus} onClick={openTransactionComposer}>Catat transaksi</Button> : null} />
    <MemberTransferRequests role={bootstrap?.user?.role} resource={transferRequests} accounts={bootstrap?.accounts} />
    {mobileLayout ? (
      <Suspense fallback={<NativePageSkeleton kind="transactions" variant="panel" label="Menyiapkan riwayat transaksi…" />}>
        <MobileTransactionHistory
          period={filters.period}
          periodLocked={Boolean(resource.data?.periodLocked)}
          onPeriodChange={(period) => updateFilter("period", period)}
          report={reportResource}
          total={resource.data?.total || 0}
          filtersActive={filtersActive}
          draftQuery={draftQuery}
          setDraftQuery={setDraftQuery}
          filters={filters}
          setFilters={setFilters}
          filterOptions={filterOptions}
          submitSearch={submitSearch}
          items={items}
          categoryLookup={categoryLookup}
          accountLabel={accountLabel}
          creatorLabel={creatorLabel}
          onOpenDetail={setDetailTransaction}
          resource={resource}
          pageSize={PAGE_SIZE}
          attentionNotice={<TransactionAttentionNotice active={reviewQueueState.active} editableTarget={attentionEditableTarget} remaining={reviewQueueState.remaining} done={reviewQueueState.done} />}
          resourceStates={<TransactionResourceStates resource={resource} items={items} filtersActive={filtersActive} openTransactionComposer={openTransactionComposer} resetFilters={resetFilters} mobileLayout />}
        />
      </Suspense>
    ) : (
      <Suspense fallback={<NativePageSkeleton kind="transactions" variant="panel" label="Menyiapkan workspace transaksi…" />}>
        <DesktopTransactionWorkspace
          report={reportResource}
          period={filters.period}
          total={resource.data?.total || 0}
          items={items}
          categoryLookup={categoryLookup}
          accountLabel={accountLabel}
          onQuickCreate={(initialType) => openTransactionComposer({ initialType })}
          onRepeat={openRepeat}
          attentionNotice={<TransactionAttentionNotice active={reviewQueueState.active} editableTarget={attentionEditableTarget} remaining={reviewQueueState.remaining} done={reviewQueueState.done} />}
          filters={<TransactionFilters draftQuery={draftQuery} setDraftQuery={setDraftQuery} filters={filters} setFilters={setFilters} filterOptions={filterOptions} updateFilter={updateFilter} submitSearch={submitSearch} filtersActive={filtersActive} />}
          resourceStates={<TransactionResourceStates resource={resource} items={items} filtersActive={filtersActive} openTransactionComposer={openTransactionComposer} resetFilters={resetFilters} mobileLayout={false} />}
          results={<TransactionDesktopResults {...resultProps} pageSize={PAGE_SIZE} />}
        />
      </Suspense>
    )}
    <TransactionDetailOverlay target={detailTransaction} onClose={closeDetail} accountLabel={accountLabel} categoryLabel={categoryLabel} creatorLabel={creatorLabel} actions={detailActions} desktop={!mobileLayout} />
    <TransactionEditOverlay transaction={editingTransaction} onClose={() => setEditingTransaction(null)} onSaved={handleEditSaved} />
    {lifecycle.cancelTarget || lifecycle.restoreTarget ? <Suspense fallback={null}><TransactionLifecycleModals {...modalProps} /></Suspense> : null}
  </div>;
};

export default TransactionsPage;
