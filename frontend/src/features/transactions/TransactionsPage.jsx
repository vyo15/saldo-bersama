import "./TransactionsPage.css";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiCopy, FiEdit2, FiPlus, FiRotateCcw, FiSearch, FiSliders, FiTrash2, FiX } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { cancelTransaction as requestCancelTransaction, restoreTransaction as requestRestoreTransaction } from "./transactions.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import TransactionForm from "./TransactionForm.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { formatTransactionDate, transactionCategoryIcon, transactionDisplayTitle, TRANSACTION_LABELS, transactionSign, transactionTone } from "../../shared/presentation/transaction.js";

const MobileTransactionHistory = lazy(() => import("./components/MobileTransactionHistory.jsx"));

const PAGE_SIZE = 50;
const MOBILE_TRANSACTIONS_QUERY = "(max-width: 820px)";
const useMobileTransactionsLayout = () => useMediaQuery(MOBILE_TRANSACTIONS_QUERY);
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
const managedModule = (item) => ({ recurring: "Jadwal rutin", goal: "Target" }[item.managed_by] || "");
const transactionTitle = (item, categoryLookup = {}) => transactionDisplayTitle(item, categoryLookup[item.category_id]);
const canRepeatTransaction = (item) => item.status === "active" && ["expense", "income", "transfer"].includes(item.transaction_type);
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

const TransactionActions = ({ item, linkedModule, openEdit, openCancel, openRestore, openRepeat }) => {
  if (item.status === "cancelled") return item.can_restore ? <Button type="button" icon={FiRotateCcw} onClick={() => openRestore(item)}>Pulihkan</Button> : null;
  if (item.status !== "active") return null;
  if (linkedModule) return <small className="managed-transaction-note">Kelola dari menu {linkedModule}</small>;
  return <div className="button-group transaction-actions">{canRepeatTransaction(item) ? <Button type="button" icon={FiCopy} onClick={() => openRepeat(item)}>Pakai lagi</Button> : null}{item.can_edit ? <Button type="button" icon={FiEdit2} onClick={() => openEdit(item)}>Edit</Button> : null}{item.can_cancel ? <Button type="button" variant="danger" icon={FiTrash2} onClick={() => openCancel(item)}>Batalkan</Button> : null}</div>;
};

const advancedFilterState = (filters) => ({ allocation: filters.allocation, account: filters.account, category: filters.category, creator: filters.creator });
const advancedFilterCount = (filters) => [filters.allocation, filters.account, filters.category, filters.creator].filter((value) => value !== "all").length;
const filterOptionLabel = (items, id, idKey, fallback) => items.find((item) => item[idKey] === id)?.name || fallback;

const TransactionFilters = ({ draftQuery, setDraftQuery, filters, setFilters, filterOptions, updateFilter, submitSearch, filtersActive }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState(() => advancedFilterState(filters));
  const activeAdvancedCount = advancedFilterCount(filters);
  const chips = [
    filters.allocation !== "all" ? { key: "allocation", label: filters.allocation === "allocated" ? "Menggunakan Alokasi Dana" : "Belum masuk Alokasi Dana" } : null,
    filters.account !== "all" ? { key: "account", label: `Rekening: ${filterOptionLabel(filterOptions.accounts, filters.account, "account_id", "Terpilih")}` } : null,
    filters.category !== "all" ? { key: "category", label: `Kategori: ${filterOptionLabel(filterOptions.categories, filters.category, "category_id", "Terpilih")}` } : null,
    filters.creator !== "all" ? { key: "creator", label: `Pencatat: ${filterOptionLabel(filterOptions.creators, filters.creator, "user_id", "Terpilih")}` } : null,
  ].filter(Boolean);
  const resetAll = () => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); };
  const openAdvanced = () => { setAdvancedDraft(advancedFilterState(filters)); setAdvancedOpen(true); };
  const resetAdvancedDraft = () => setAdvancedDraft({ allocation: "all", account: "all", category: "all", creator: "all" });
  const applyAdvanced = () => { setFilters((current) => ({ ...current, ...advancedDraft, offset: 0 })); setAdvancedOpen(false); };
  const clearChip = (key) => setFilters((current) => ({ ...current, [key]: "all", offset: 0 }));

  return (
    <>
      <form className="toolbar transaction-toolbar" aria-label="Filter transaksi" onSubmit={submitSearch}>
        <div className="transaction-search-row"><label className="search-field"><FiSearch aria-hidden="true" /><input type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /><span className="sr-only">Cari transaksi</span></label><Button type="submit">Cari</Button></div>
        <div className="transaction-filter-row">
          <label className="field field--compact"><span className="sr-only">Periode transaksi</span><input type="month" max={currentMonthInJakarta()} value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} aria-label="Periode transaksi" /></label>
          <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} aria-label="Filter jenis transaksi"><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Penyesuaian</option></select>
          <Button type="button" className="transaction-filter-more" icon={FiSliders} onClick={openAdvanced} aria-label={`Buka filter lainnya${activeAdvancedCount ? `, ${activeAdvancedCount} aktif` : ""}`}>
            Filter lainnya{activeAdvancedCount ? <span className="transaction-filter-count" aria-hidden="true">{activeAdvancedCount}</span> : null}
          </Button>
        </div>
        {chips.length || filtersActive ? <div className="transaction-filter-summary" aria-label="Filter transaksi aktif">
          <div className="transaction-filter-chips">{chips.map((chip) => <button key={chip.key} type="button" className="transaction-filter-chip" onClick={() => clearChip(chip.key)} aria-label={`Hapus filter ${chip.label}`}><span>{chip.label}</span><FiX aria-hidden="true" /></button>)}</div>
          {filtersActive ? <button type="button" className="transaction-filter-reset" onClick={resetAll}>Reset</button> : null}
        </div> : null}
      </form>
      <Modal open={advancedOpen} onClose={() => setAdvancedOpen(false)} title="Filter lainnya" description="Gunakan saat Anda perlu menyaring transaksi lebih spesifik." size="sm" footer={<><Button type="button" onClick={resetAdvancedDraft}>Reset pilihan</Button><Button type="button" variant="primary" onClick={applyAdvanced}>Terapkan filter</Button></>}>
        <div className="transaction-advanced-filter-grid">
          <label className="field"><span>Alokasi Dana</span><select value={advancedDraft.allocation} onChange={(event) => setAdvancedDraft((current) => ({ ...current, allocation: event.target.value }))} aria-label="Filter Alokasi Dana"><option value="all">Semua Alokasi</option><option value="unallocated">Belum masuk Alokasi</option><option value="allocated">Menggunakan Alokasi</option></select></label>
          <label className="field"><span>Rekening</span><select value={advancedDraft.account} onChange={(event) => setAdvancedDraft((current) => ({ ...current, account: event.target.value }))} aria-label="Filter rekening"><option value="all">Semua rekening</option>{filterOptions.accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item)}</option>)}</select></label>
          <label className="field"><span>Kategori</span><select value={advancedDraft.category} onChange={(event) => setAdvancedDraft((current) => ({ ...current, category: event.target.value }))} aria-label="Filter kategori"><option value="all">Semua kategori</option>{filterOptions.categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></label>
          <label className="field"><span>Pencatat</span><select value={advancedDraft.creator} onChange={(event) => setAdvancedDraft((current) => ({ ...current, creator: event.target.value }))} aria-label="Filter pencatat"><option value="all">Semua pencatat</option>{filterOptions.creators.map((item) => <option key={item.user_id} value={item.user_id}>{item.name}</option>)}</select></label>
        </div>
      </Modal>
    </>
  );
};

const TransactionTableRow = ({ item, categoryLookup, accountLabel, categoryLabel, actions }) => { const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type); return <tr><td><time>{item.transaction_date}</time></td><td><div className="transaction-table-primary"><span className={`transaction-category-icon transaction-category-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span><span><strong>{transactionTitle(item, categoryLookup)}</strong><small>{TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small></span></div></td><td>{accountLabel(item)}</td><td>{categoryLabel(item)}</td><td><StatusBadge status={item.status} /></td><td className="align-right"><Money value={item.amount} tone={transactionTone(item.transaction_type)} /></td><td><TransactionActions item={item} linkedModule={managedModule(item)} {...actions} /></td></tr>; };
const TransactionTable = (p) => <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Tanggal</th><th>Transaksi</th><th>Rekening</th><th>Kategori</th><th>Status</th><th className="align-right">Nominal</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>{p.items.map((item) => <TransactionTableRow key={item.transaction_id} item={item} categoryLookup={p.categoryLookup} accountLabel={p.accountLabel} categoryLabel={p.categoryLabel} actions={p.actions} />)}</tbody></table></div>;

const TransactionDetailModal = ({ target, onClose, accountLabel, categoryLabel, creatorLabel, actions }) => {
  if (!target) return <Modal open={false} onClose={onClose} title="Detail transaksi" />;
  const tone = transactionTone(target.transaction_type);
  const sign = transactionSign(target.transaction_type);
  const linkedModule = managedModule(target);
  const allocationLabel = target.transaction_type === "expense" ? (target.envelope_period_id ? "Menggunakan Alokasi Dana" : "Belum masuk Alokasi Dana") : "Tidak berlaku";
  const sourceLabel = linkedModule || "Transaksi manual";
  const hasActions = target.status === "cancelled" ? Boolean(target.can_restore) : target.status === "active" && Boolean(linkedModule || canRepeatTransaction(target) || target.can_edit || target.can_cancel);
  return <Modal open title="Detail transaksi" description={`${TRANSACTION_LABELS[target.transaction_type] || target.transaction_type} · ${formatTransactionDate(target.transaction_date)}`} onClose={onClose} size="sm" className="transaction-detail-modal" footer={hasActions ? <TransactionActions item={target} linkedModule={linkedModule} {...actions} /> : null}><article className="transaction-history-detail"><header className="transaction-history-detail__amount"><div><span>Nominal</span><span className={`transaction-history-detail__money money--${tone}`}>{sign}<Money value={target.amount} tone={tone} /></span></div><StatusBadge status={target.status} /></header><dl><div><dt>Deskripsi</dt><dd>{transactionDisplayTitle(target)}</dd></div><div><dt>Jenis</dt><dd>{TRANSACTION_LABELS[target.transaction_type] || target.transaction_type}</dd></div><div><dt>Kategori</dt><dd>{categoryLabel(target)}</dd></div><div><dt>Rekening</dt><dd>{accountLabel(target)}</dd></div><div><dt>Alokasi Dana</dt><dd>{allocationLabel}</dd></div><div><dt>Pencatat</dt><dd>{creatorLabel(target)}</dd></div><div><dt>Tanggal</dt><dd>{formatTransactionDate(target.transaction_date)}<small>Zona waktu Asia/Jakarta</small></dd></div><div><dt>Sumber</dt><dd>{sourceLabel}</dd></div></dl></article></Modal>;
};

const Pagination = ({ resource, filters, setFilters, itemCount }) => {
  if (!filters.offset && !resource.data?.hasMore) return null;
  return <div className="pagination-bar" aria-label="Navigasi halaman transaksi"><span>Menampilkan {Number(resource.data?.offset || 0) + 1}–{Number(resource.data?.offset || 0) + itemCount} dari {resource.data?.total || itemCount}</span><div className="button-group"><Button icon={FiChevronLeft} disabled={!filters.offset || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}>Sebelumnya</Button><Button icon={FiChevronRight} disabled={!resource.data?.hasMore || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: resource.data?.nextOffset || current.offset + PAGE_SIZE }))}>Berikutnya</Button></div></div>;
};
const TransactionResults = (p) => {
  if (!p.items.length) return null;
  return <><TransactionTable {...p} /><Pagination resource={p.resource} filters={p.filters} setFilters={p.setFilters} itemCount={p.items.length} /></>;
};

const TransactionLifecycleModals = ({ cancelTarget, cancelState, setCancelTarget, cancelTransaction, restoreTarget, restoreState, setRestoreTarget, restoreCancelledTransaction, accountLabel, categoryLabel }) => <><ConfirmationModal open={Boolean(cancelTarget)} title="Batalkan transaksi?" description={cancelTarget ? `${cancelTarget.description || "Transaksi"} tidak dihapus permanen. Status menjadi dibatalkan dan saldo dihitung ulang.` : ""} confirmLabel={cancelTarget ? `Batalkan transaksi Rp${Number(cancelTarget.amount || 0).toLocaleString("id-ID")}` : "Batalkan transaksi"} reasonLabel="Alasan pembatalan" requireReason busy={cancelState.status === "submitting"} error={cancelState.error} onCancel={() => cancelState.status !== "submitting" && setCancelTarget(null)} onConfirm={cancelTransaction}>{cancelTarget ? <div className="notice notice--warning"><span>{cancelTarget.transaction_date} · {accountLabel(cancelTarget)} · {categoryLabel(cancelTarget)}</span></div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(restoreTarget)} title="Pulihkan transaksi yang dibatalkan?" description={restoreTarget ? `${restoreTarget.description || "Transaksi"} akan aktif kembali dan kembali memengaruhi saldo. Backend akan memeriksa periode, rekening, kategori, duplikasi, dan saldo terbaru.` : ""} confirmLabel="Pulihkan transaksi" reasonLabel="Alasan pemulihan" requireReason tone="primary" busy={restoreState.status === "submitting"} error={restoreState.error} onCancel={() => restoreState.status !== "submitting" && setRestoreTarget(null)} onConfirm={restoreCancelledTransaction}>{restoreTarget ? <div className="notice notice--warning"><span>Rp{Number(restoreTarget.amount || 0).toLocaleString("id-ID")} · {restoreTarget.transaction_date} · {accountLabel(restoreTarget)}</span></div> : null}</ConfirmationModal></>;

const useTransactionLifecycle = ({ resource, refreshOverview, invalidate }) => {
  const [cancelTarget, setCancelTarget] = useState(null); const [cancelState, setCancelState] = useState({ status: "idle", error: null }); const [restoreTarget, setRestoreTarget] = useState(null); const [restoreState, setRestoreState] = useState({ status: "idle", error: null });
  const refresh = async () => { invalidate(refreshKeys); await Promise.allSettled([resource.reload(), refreshOverview()]); };
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
  const title = editableTarget ? "Pilih Alokasi Dana pada transaksi yang dibuka." : "Pilih Alokasi Dana untuk pengeluaran di bawah.";
  const description = editableTarget
    ? "Transaksi pertama yang dapat diedit dibuka otomatis. Pilih Alokasi Dana pada form, lalu simpan setelah memastikan rekening dan nominal sudah benar."
    : "Daftar sudah difilter ke pengeluaran yang belum dialokasikan. Buka transaksi yang dapat diedit, lalu pilih Alokasi Dana pada form.";
  return <CompactNotice tone="info" title={title} role="status">{description}{Number.isFinite(remaining) ? ` ${remaining} transaksi masih perlu ditinjau.` : ""}</CompactNotice>;
};

const TransactionResourceStates = ({ resource, items, filtersActive, openTransactionComposer, resetFilters }) => <>
  {resource.data?.periodLocked ? <div className="notice notice--warning" role="status">Periode ini dikunci karena periode ini atau periode setelahnya sudah ditutup. Administrator harus membuka kembali seluruh periode pengunci sebelum transaksi dapat diubah.</div> : null}
  {resource.status === "loading" ? <LoadingScreen variant="panel" label="Memuat transaksi..." /> : null}
  {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
  {resource.status === "ready" && !items.length ? <EmptyState title={filtersActive ? "Transaksi tidak ditemukan" : "Belum ada transaksi"} description={filtersActive ? "Ubah atau reset filter untuk melihat transaksi lain." : "Tambahkan transaksi pertama untuk mulai mencatat aktivitas keuangan."} action={filtersActive ? <Button icon={FiRotateCcw} onClick={resetFilters}>Reset filter</Button> : <Button variant="primary" onClick={openTransactionComposer}>Tambah transaksi</Button>} /> : null}
</>;

const useTransactionReviewQueue = ({ attention, attentionFromDashboard, attentionEditableTarget, consumeAttention, resource, items, mobileLayout, reportResource, setEditingTransaction }) => {
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
    const [nextData] = await Promise.all([resource.reload(), ...(mobileLayout ? [reportResource.reload()] : [])]);
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

const TransactionsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { openTransactionComposer } = useTransactionComposer();
  const mobileLayout = useMobileTransactionsLayout();
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState(() => initialFilters(attention));
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [detailTransaction, setDetailTransaction] = useState(null);
  const resource = useApiResource("transactions.list", transactionQuery(filters));
  const reportResource = useApiResource("reports.monthly", { period: filters.period, trend_months: 6 }, { enabled: mobileLayout });
  const lifecycle = useTransactionLifecycle({ resource, refreshOverview, invalidate });
  const { accountLookup, categoryLookup, creatorLookup, items, filterOptions } = transactionPageData(bootstrap, resource);
  const filtersActive = transactionFiltersActive(filters);
  const resetFilters = () => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); };
  const showHeaderCreate = resource.status !== "ready" || items.length > 0 || filtersActive;
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
  const openEdit = (item) => setEditingTransaction(item);
  const closeDetail = () => setDetailTransaction(null);
  const openRepeat = (item) => {
    closeDetail();
    openTransactionComposer({ initialType: item.transaction_type, initialSourceAccountId: item.source_account_id || "", initialDraft: repeatDraftFromTransaction(item) });
  };
  const actions = { openEdit, openCancel: lifecycle.openCancel, openRestore: lifecycle.openRestore, openRepeat };
  const detailActions = {
    openEdit: (item) => { closeDetail(); openEdit(item); },
    openCancel: (item) => { closeDetail(); lifecycle.openCancel(item); },
    openRestore: (item) => { closeDetail(); lifecycle.openRestore(item); },
    openRepeat,
  };
  const resultProps = { items, categoryLookup, accountLabel, categoryLabel, actions, resource, filters, setFilters };
  const modalProps = { ...lifecycle, accountLabel, categoryLabel };

  const reviewQueue = useTransactionReviewQueue({ attention, attentionFromDashboard, attentionEditableTarget, consumeAttention, resource, items, mobileLayout, reportResource, setEditingTransaction });
  const reviewQueueState = reviewQueue.state;
  const handleEditSaved = reviewQueue.handleSaved;

  return <div className="page-stack transactions-page">
    <RefreshWarning error={resource.refreshError || reportResource.refreshError} onRetry={() => Promise.all([resource.reload(), ...(mobileLayout ? [reportResource.reload()] : [])])} />
    <PageHeader title="Transaksi" description={mobileLayout ? undefined : "Semua transaksi dalam satu alur."} help="Catat pemasukan, pengeluaran, dan transfer di sini. Perubahan saldo baru dianggap selesai setelah server mengonfirmasi transaksi." actions={showHeaderCreate ? <Button variant="primary" icon={FiPlus} onClick={openTransactionComposer}>Tambah transaksi</Button> : null} />
    {mobileLayout ? (
      <Suspense fallback={null}>
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
          resourceStates={<TransactionResourceStates resource={resource} items={items} filtersActive={filtersActive} openTransactionComposer={openTransactionComposer} resetFilters={resetFilters} />}
        />
      </Suspense>
    ) : (
      <>
        <TransactionAttentionNotice active={reviewQueueState.active} editableTarget={attentionEditableTarget} remaining={reviewQueueState.remaining} done={reviewQueueState.done} />
        <TransactionFilters draftQuery={draftQuery} setDraftQuery={setDraftQuery} filters={filters} setFilters={setFilters} filterOptions={filterOptions} updateFilter={updateFilter} submitSearch={submitSearch} filtersActive={filtersActive} />
        <TransactionResourceStates resource={resource} items={items} filtersActive={filtersActive} openTransactionComposer={openTransactionComposer} resetFilters={resetFilters} />
        <TransactionResults {...resultProps} />
      </>
    )}
    <TransactionDetailModal target={detailTransaction} onClose={closeDetail} accountLabel={accountLabel} categoryLabel={categoryLabel} creatorLabel={creatorLabel} actions={detailActions} />
    <TransactionForm open={Boolean(editingTransaction)} transaction={editingTransaction} onClose={() => setEditingTransaction(null)} onSaved={handleEditSaved} />
    <TransactionLifecycleModals {...modalProps} />
  </div>;
};

export default TransactionsPage;
