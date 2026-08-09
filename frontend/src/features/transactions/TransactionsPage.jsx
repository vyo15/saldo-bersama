import { useState } from "react";
import { useLocation } from "react-router";
import { FiChevronLeft, FiChevronRight, FiEdit2, FiPlus, FiSearch, FiTrash2, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { cancelTransaction as requestCancelTransaction, restoreTransaction as requestRestoreTransaction } from "./transactions.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import TransactionForm from "./TransactionForm.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { formatTransactionDate, transactionCategoryIcon, TRANSACTION_LABELS, transactionTone } from "../../shared/presentation/transaction.js";

const PAGE_SIZE = 100;
const refreshKeys = Object.freeze(["transactions.list", "accounts.list", "envelopes.list", "reports.monthly", "dashboard.overview", "app.initialState", "archive.list"]);
const defaultFilterOptions = Object.freeze({ accounts: [], categories: [], creators: [] });

const initialFilters = (state) => ({
  period: typeof state?.period === "string" && /^\d{4}-\d{2}$/.test(state.period) ? state.period : currentMonthInJakarta(),
  query: "",
  type: "all",
  allocation: "all",
  account: typeof state?.accountId === "string" && state.accountId ? state.accountId : "all",
  category: "all",
  creator: typeof state?.creatorId === "string" && state.creatorId.trim() ? state.creatorId.trim() : "all",
  offset: 0,
});

const transactionQuery = (filters) => ({ period: filters.period, limit: PAGE_SIZE, offset: filters.offset, query: filters.query, transaction_type: filters.type, allocation: filters.allocation, account_id: filters.account, category_id: filters.category, created_by: filters.creator });
const accountLabelFor = (lookup, item) => item.transaction_type === "transfer" ? `${lookup[item.source_account_id] || "Rekening asal"} → ${lookup[item.destination_account_id] || "Rekening tujuan"}` : lookup[item.source_account_id] || lookup[item.destination_account_id] || "Rekening tidak tersedia";
const categoryLabelFor = (lookup, item) => lookup[item.category_id]?.name || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan");
const managedModule = (item) => ({ recurring: "Jadwal rutin", goal: "Target" }[item.managed_by] || "");

const TransactionActions = ({ item, linkedModule, openEdit, openCancel, openRestore }) => {
  if (item.status === "cancelled") return item.can_restore ? <Button type="button" icon={FiRotateCcw} onClick={() => openRestore(item)}>Pulihkan</Button> : null;
  if (item.status !== "active") return null;
  if (linkedModule) return <small className="managed-transaction-note">Kelola dari menu {linkedModule}</small>;
  return <div className="button-group transaction-actions">{item.can_edit ? <Button type="button" icon={FiEdit2} onClick={() => openEdit(item)}>Edit</Button> : null}{item.can_cancel ? <Button type="button" variant="danger" icon={FiTrash2} onClick={() => openCancel(item)}>Batalkan</Button> : null}</div>;
};

const TransactionFilters = ({ draftQuery, setDraftQuery, filters, setFilters, filterOptions, updateFilter, submitSearch, filtersActive }) => (
  <form className="toolbar transaction-toolbar" aria-label="Filter transaksi" onSubmit={submitSearch}>
    <div className="transaction-search-row"><label className="search-field"><FiSearch aria-hidden="true" /><input type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /><span className="sr-only">Cari transaksi</span></label><Button type="submit">Cari</Button></div>
    <div className="transaction-filter-row">
      <label className="field field--compact"><span className="sr-only">Periode transaksi</span><input type="month" max={currentMonthInJakarta()} value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} aria-label="Periode transaksi" /></label>
      <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} aria-label="Filter jenis transaksi"><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Penyesuaian</option></select>
      <select value={filters.allocation} onChange={(event) => updateFilter("allocation", event.target.value)} aria-label="Filter alokasi"><option value="all">Semua alokasi</option><option value="unallocated">Belum dialokasikan</option><option value="allocated">Sudah dialokasikan</option></select>
      <select value={filters.account} onChange={(event) => updateFilter("account", event.target.value)} aria-label="Filter rekening"><option value="all">Semua rekening</option>{filterOptions.accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item)}</option>)}</select>
      <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)} aria-label="Filter kategori"><option value="all">Semua kategori</option>{filterOptions.categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select>
      <select value={filters.creator} onChange={(event) => updateFilter("creator", event.target.value)} aria-label="Filter pencatat"><option value="all">Semua pencatat</option>{filterOptions.creators.map((item) => <option key={item.user_id} value={item.user_id}>{item.name}</option>)}</select>
      {filtersActive ? <Button type="button" onClick={() => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); }}>Reset filter</Button> : null}
    </div>
  </form>
);

const TransactionTableRow = ({ item, categoryLookup, accountLabel, categoryLabel, actions }) => { const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type); return <tr><td><time>{item.transaction_date}</time></td><td><div className="transaction-table-primary"><span className={`transaction-category-icon transaction-category-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span><span><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small></span></div></td><td>{accountLabel(item)}</td><td>{categoryLabel(item)}</td><td><StatusBadge status={item.status} /></td><td className="align-right"><Money value={item.amount} tone={transactionTone(item.transaction_type)} /></td><td><TransactionActions item={item} linkedModule={managedModule(item)} {...actions} /></td></tr>; };
const TransactionTable = (p) => <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Tanggal</th><th>Transaksi</th><th>Rekening</th><th>Kategori</th><th>Status</th><th className="align-right">Nominal</th><th><span className="sr-only">Aksi</span></th></tr></thead><tbody>{p.items.map((item) => <TransactionTableRow key={item.transaction_id} item={item} categoryLookup={p.categoryLookup} accountLabel={p.accountLabel} categoryLabel={p.categoryLabel} actions={p.actions} />)}</tbody></table></div>;

const TransactionMobileCard = ({ item, categoryLookup, accountLabel, categoryLabel, actions }) => { const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type); return <article className="mobile-data-card transaction-mobile-card"><div className="transaction-mobile-card__main"><span className={`transaction-mobile-card__icon transaction-mobile-card__icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span><div className="transaction-mobile-card__copy"><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{formatTransactionDate(item.transaction_date)} · {accountLabel(item)}</small></div><Money value={item.amount} tone={transactionTone(item.transaction_type)} /></div><div className="transaction-mobile-card__meta"><span>{categoryLabel(item)}</span><StatusBadge status={item.status} /></div><div className="transaction-mobile-card__footer"><small>{TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small><TransactionActions item={item} linkedModule={managedModule(item)} {...actions} /></div></article>; };
const TransactionMobileList = (p) => <div className="mobile-data-list transaction-mobile-list" aria-label="Daftar transaksi">{p.items.map((item) => <TransactionMobileCard key={item.transaction_id} item={item} categoryLookup={p.categoryLookup} accountLabel={p.accountLabel} categoryLabel={p.categoryLabel} actions={p.actions} />)}</div>;

const Pagination = ({ resource, filters, setFilters, itemCount }) => <div className="pagination-bar" aria-label="Navigasi halaman transaksi"><span>Menampilkan {Number(resource.data?.offset || 0) + 1}–{Number(resource.data?.offset || 0) + itemCount} dari {resource.data?.total || itemCount}</span><div className="button-group"><Button icon={FiChevronLeft} disabled={!filters.offset || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}>Sebelumnya</Button><Button icon={FiChevronRight} disabled={!resource.data?.hasMore || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: resource.data?.nextOffset || current.offset + PAGE_SIZE }))}>Berikutnya</Button></div></div>;
const TransactionResults = (p) => p.items.length ? <><TransactionTable {...p} /><TransactionMobileList {...p} /><Pagination resource={p.resource} filters={p.filters} setFilters={p.setFilters} itemCount={p.items.length} /></> : null;

const TransactionLifecycleModals = ({ cancelTarget, cancelState, setCancelTarget, cancelTransaction, restoreTarget, restoreState, setRestoreTarget, restoreCancelledTransaction, accountLabel, categoryLabel }) => <><ConfirmationModal open={Boolean(cancelTarget)} title="Batalkan transaksi?" description={cancelTarget ? `${cancelTarget.description || "Transaksi"} tidak dihapus permanen. Status berubah menjadi cancelled dan saldo dihitung ulang.` : ""} confirmLabel={cancelTarget ? `Batalkan transaksi Rp${Number(cancelTarget.amount || 0).toLocaleString("id-ID")}` : "Batalkan transaksi"} reasonLabel="Alasan pembatalan" requireReason busy={cancelState.status === "submitting"} error={cancelState.error} onCancel={() => cancelState.status !== "submitting" && setCancelTarget(null)} onConfirm={cancelTransaction}>{cancelTarget ? <div className="notice notice--warning"><span>{cancelTarget.transaction_date} · {accountLabel(cancelTarget)} · {categoryLabel(cancelTarget)}</span></div> : null}</ConfirmationModal><ConfirmationModal open={Boolean(restoreTarget)} title="Pulihkan transaksi yang dibatalkan?" description={restoreTarget ? `${restoreTarget.description || "Transaksi"} akan aktif kembali dan kembali memengaruhi saldo. Backend akan memeriksa periode, rekening, kategori, duplikasi, dan saldo terbaru.` : ""} confirmLabel="Pulihkan transaksi" reasonLabel="Alasan pemulihan" requireReason tone="primary" busy={restoreState.status === "submitting"} error={restoreState.error} onCancel={() => restoreState.status !== "submitting" && setRestoreTarget(null)} onConfirm={restoreCancelledTransaction}>{restoreTarget ? <div className="notice notice--warning"><span>Rp{Number(restoreTarget.amount || 0).toLocaleString("id-ID")} · {restoreTarget.transaction_date} · {accountLabel(restoreTarget)}</span></div> : null}</ConfirmationModal></>;

const useTransactionLifecycle = ({ resource, refreshOverview, invalidate }) => {
  const [cancelTarget, setCancelTarget] = useState(null); const [cancelState, setCancelState] = useState({ status: "idle", error: null }); const [restoreTarget, setRestoreTarget] = useState(null); const [restoreState, setRestoreState] = useState({ status: "idle", error: null });
  const refresh = async () => { invalidate(refreshKeys); await Promise.allSettled([resource.reload(), refreshOverview()]); };
  const cancelTransaction = async (reason) => { if (!cancelTarget) return; setCancelState({ status: "submitting", error: null }); try { await requestCancelTransaction({ transactionId: cancelTarget.transaction_id, rowVersion: cancelTarget.row_version, reason }, { rowVersion: cancelTarget.row_version }); setCancelTarget(null); setCancelState({ status: "idle", error: null }); await refresh(); } catch (error) { setCancelState({ status: "error", error }); } };
  const restoreCancelledTransaction = async (reason) => { if (!restoreTarget) return; setRestoreState({ status: "submitting", error: null }); try { await requestRestoreTransaction({ transaction_id: restoreTarget.transaction_id, row_version: restoreTarget.row_version, reason }, { rowVersion: restoreTarget.row_version }); setRestoreTarget(null); setRestoreState({ status: "idle", error: null }); await refresh(); } catch (error) { setRestoreState({ status: "error", error }); } };
  const openCancel = (item) => { setCancelTarget(item); setCancelState({ status: "idle", error: null }); }; const openRestore = (item) => { setRestoreTarget(item); setRestoreState({ status: "idle", error: null }); };
  return { cancelTarget, setCancelTarget, cancelState, restoreTarget, setRestoreTarget, restoreState, cancelTransaction, restoreCancelledTransaction, openCancel, openRestore };
};

const TransactionsPage = () => {
  const location = useLocation(); const { bootstrap, refreshOverview, invalidate } = useFinance(); const [draftQuery, setDraftQuery] = useState(""); const [filters, setFilters] = useState(() => initialFilters(location.state)); const [formOpen, setFormOpen] = useState(false); const [editingTransaction, setEditingTransaction] = useState(null); const resource = useApiResource("transactions.list", transactionQuery(filters)); const lifecycle = useTransactionLifecycle({ resource, refreshOverview, invalidate });
  const accountLookup = Object.fromEntries((bootstrap?.accounts || []).map((item) => [item.account_id, accountDisplayLabel(item)])); const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])); const items = resource.data?.items || []; const filterOptions = resource.data?.filterOptions || defaultFilterOptions; const filtersActive = filters.query || [filters.type, filters.allocation, filters.account, filters.category, filters.creator].some((value) => value !== "all");
  const submitSearch = (event) => { event.preventDefault(); setFilters((current) => ({ ...current, query: draftQuery.trim(), offset: 0 })); }; const updateFilter = (key, value) => setFilters((current) => key === "period" ? { ...current, period: value, account: "all", category: "all", creator: "all", offset: 0 } : { ...current, [key]: value, offset: 0 }); const accountLabel = (item) => accountLabelFor(accountLookup, item); const categoryLabel = (item) => categoryLabelFor(categoryLookup, item);
  const openEdit = (item) => { setEditingTransaction(item); setFormOpen(true); }; const actions = { openEdit, openCancel: lifecycle.openCancel, openRestore: lifecycle.openRestore }; const resultProps = { items, categoryLookup, accountLabel, categoryLabel, actions, resource, filters, setFilters }; const modalProps = { ...lifecycle, accountLabel, categoryLabel };
  return <div className="page-stack transactions-page"><RefreshWarning error={resource.refreshError} onRetry={resource.reload} /><PageHeader title="Transaksi" description="Pemasukan, pengeluaran, transfer, dan koreksi tercatat dalam satu ledger." actions={<Button variant="primary" icon={FiPlus} onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>Tambah transaksi</Button>} /><TransactionFilters draftQuery={draftQuery} setDraftQuery={setDraftQuery} filters={filters} setFilters={setFilters} filterOptions={filterOptions} updateFilter={updateFilter} submitSearch={submitSearch} filtersActive={filtersActive} />{resource.data?.periodLocked ? <div className="notice notice--warning" role="status">Periode ini dikunci karena periode ini atau periode setelahnya sudah ditutup. Owner harus membuka kembali seluruh periode pengunci sebelum transaksi dapat diubah.</div> : null}{resource.status === "loading" ? <LoadingScreen label="Memuat transaksi..." /> : null}{resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}{resource.status === "ready" && !items.length ? <EmptyState title="Transaksi tidak ditemukan" description="Ubah filter atau catat transaksi pertama." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Tambah transaksi</Button>} /> : null}<TransactionResults {...resultProps} /><TransactionForm open={formOpen} transaction={editingTransaction} onClose={() => { setFormOpen(false); setEditingTransaction(null); }} onSaved={resource.reload} /><TransactionLifecycleModals {...modalProps} /></div>;
};

export default TransactionsPage;
