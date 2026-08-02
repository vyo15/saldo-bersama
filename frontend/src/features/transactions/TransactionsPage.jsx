import { useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiPlus,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { cancelTransaction as requestCancelTransaction } from "./transactions.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import TransactionForm from "./TransactionForm.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { formatTransactionDate, transactionIcon, TRANSACTION_LABELS, transactionTone } from "./transactionPresentation.js";

const PAGE_SIZE = 100;

const TransactionsPage = () => {
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState({
    period: currentMonthInJakarta(),
    query: "",
    type: "all",
    allocation: "all",
    account: "all",
    category: "all",
    creator: "all",
    offset: 0,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelState, setCancelState] = useState({ status: "idle", error: null });
  const resource = useApiResource("transactions.list", {
    period: filters.period,
    limit: PAGE_SIZE,
    offset: filters.offset,
    query: filters.query,
    transaction_type: filters.type,
    allocation: filters.allocation,
    account_id: filters.account,
    category_id: filters.category,
    created_by: filters.creator,
  });
  const accountLookup = Object.fromEntries((bootstrap?.accounts || []).map((item) => [item.account_id, item.name]));
  const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item.name]));
  const items = resource.data?.items || [];
  const filterOptions = resource.data?.filterOptions || { accounts: [], categories: [], creators: [] };
  const filtersActive = filters.query || [filters.type, filters.allocation, filters.account, filters.category, filters.creator].some((value) => value !== "all");

  const submitSearch = (event) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, query: draftQuery.trim(), offset: 0 }));
  };

  const updateFilter = (key, value) => setFilters((current) => key === "period"
    ? { ...current, period: value, account: "all", category: "all", creator: "all", offset: 0 }
    : { ...current, [key]: value, offset: 0 });

  const accountLabel = (item) => {
    if (item.transaction_type === "transfer") {
      const source = accountLookup[item.source_account_id] || "Rekening asal";
      const destination = accountLookup[item.destination_account_id] || "Rekening tujuan";
      return `${source} → ${destination}`;
    }
    return accountLookup[item.source_account_id] || accountLookup[item.destination_account_id] || "Rekening tidak tersedia";
  };

  const categoryLabel = (item) => categoryLookup[item.category_id]
    || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan");

  const cancelTransaction = async (reason) => {
    if (!cancelTarget) return;
    setCancelState({ status: "submitting", error: null });
    try {
      await requestCancelTransaction({
        transactionId: cancelTarget.transaction_id,
        rowVersion: cancelTarget.row_version,
        reason,
      }, { rowVersion: cancelTarget.row_version, idempotencyKey: createIdempotencyKey() });
      setCancelTarget(null);
      setCancelState({ status: "idle", error: null });
      invalidate(["transactions.list", "envelopes.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) {
      setCancelState({ status: "error", error });
    }
  };

  const renderActions = (item, linkedModule) => {
    if (item.status !== "active") return null;
    if (linkedModule) return <small className="managed-transaction-note">Kelola dari menu {linkedModule}</small>;
    return (
      <div className="button-group transaction-actions">
        {item.can_edit ? <button type="button" className="icon-button" onClick={() => { setEditingTransaction(item); setFormOpen(true); }} aria-label={`Edit ${item.description || "transaksi"}`}><FiEdit2 aria-hidden="true" /></button> : null}
        {item.can_cancel ? <button type="button" className="icon-button icon-button--danger" onClick={() => { setCancelTarget(item); setCancelState({ status: "idle", error: null }); }} aria-label={`Batalkan ${item.description || "transaksi"}`}><FiTrash2 aria-hidden="true" /></button> : null}
      </div>
    );
  };

  return (
    <div className="page-stack transactions-page">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Transaksi" description="Pemasukan, pengeluaran, transfer, dan koreksi tercatat dalam satu ledger." actions={<Button variant="primary" icon={FiPlus} onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>Tambah transaksi</Button>} />
      <form className="toolbar transaction-toolbar" aria-label="Filter transaksi" onSubmit={submitSearch}>
        <div className="transaction-search-row">
          <label className="search-field"><FiSearch aria-hidden="true" /><input type="search" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /><span className="sr-only">Cari transaksi</span></label>
          <Button type="submit">Cari</Button>
        </div>
        <div className="transaction-filter-row">
          <label className="field field--compact"><span className="sr-only">Periode transaksi</span><input type="month" max={currentMonthInJakarta()} value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} aria-label="Periode transaksi" /></label>
          <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} aria-label="Filter jenis transaksi"><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Penyesuaian</option></select>
          <select value={filters.allocation} onChange={(event) => updateFilter("allocation", event.target.value)} aria-label="Filter alokasi"><option value="all">Semua alokasi</option><option value="unallocated">Belum dialokasikan</option><option value="allocated">Sudah dialokasikan</option></select>
          <select value={filters.account} onChange={(event) => updateFilter("account", event.target.value)} aria-label="Filter rekening"><option value="all">Semua rekening</option>{filterOptions.accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.name}</option>)}</select>
          <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)} aria-label="Filter kategori"><option value="all">Semua kategori</option>{filterOptions.categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select>
          <select value={filters.creator} onChange={(event) => updateFilter("creator", event.target.value)} aria-label="Filter pencatat"><option value="all">Semua pencatat</option>{filterOptions.creators.map((item) => <option key={item.user_id} value={item.user_id}>{item.name}</option>)}</select>
          {filtersActive ? <Button type="button" onClick={() => { setDraftQuery(""); setFilters((current) => ({ ...current, query: "", type: "all", allocation: "all", account: "all", category: "all", creator: "all", offset: 0 })); }}>Reset filter</Button> : null}
        </div>
      </form>
      {resource.data?.periodLocked ? <div className="notice notice--warning" role="status">Periode ini dikunci karena periode ini atau periode setelahnya sudah ditutup. Owner harus membuka kembali seluruh periode pengunci sebelum transaksi dapat diubah.</div> : null}

      {resource.status === "loading" ? <LoadingScreen label="Memuat transaksi..." /> : null}
      {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
      {resource.status === "ready" && !items.length ? <EmptyState title="Transaksi tidak ditemukan" description="Ubah filter atau catat transaksi pertama." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Tambah transaksi</Button>} /> : null}
      {items.length ? (
        <>
          <div className="data-table-wrap desktop-data-table">
            <table className="data-table">
              <thead><tr><th>Tanggal</th><th>Transaksi</th><th>Rekening</th><th>Kategori</th><th>Status</th><th className="align-right">Nominal</th><th><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>{items.map((item) => {
                const linkedModule = item.managed_by === "recurring" ? "Tagihan" : item.managed_by === "goal" ? "Target" : "";
                return (
                  <tr key={item.transaction_id}>
                    <td><time>{item.transaction_date}</time></td>
                    <td><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small></td>
                    <td>{accountLabel(item)}</td>
                    <td>{categoryLabel(item)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="align-right"><Money value={item.amount} tone={transactionTone(item.transaction_type)} /></td>
                    <td>{renderActions(item, linkedModule)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>

          <div className="mobile-data-list transaction-mobile-list" aria-label="Daftar transaksi">
            {items.map((item) => {
              const linkedModule = item.managed_by === "recurring" ? "Tagihan" : item.managed_by === "goal" ? "Target" : "";
              const Icon = transactionIcon(item.transaction_type);
              return (
                <article className="mobile-data-card transaction-mobile-card" key={item.transaction_id}>
                  <div className="transaction-mobile-card__main">
                    <span className={`transaction-mobile-card__icon transaction-mobile-card__icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                    <div className="transaction-mobile-card__copy">
                      <strong>{item.description || item.merchant || "Tanpa keterangan"}</strong>
                      <small>{formatTransactionDate(item.transaction_date)} · {accountLabel(item)}</small>
                    </div>
                    <Money value={item.amount} tone={transactionTone(item.transaction_type)} />
                  </div>
                  <div className="transaction-mobile-card__meta">
                    <span>{categoryLabel(item)}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="transaction-mobile-card__footer">
                    <small>{TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small>
                    {renderActions(item, linkedModule)}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="pagination-bar" aria-label="Navigasi halaman transaksi">
            <span>Menampilkan {Number(resource.data?.offset || 0) + 1}–{Number(resource.data?.offset || 0) + items.length} dari {resource.data?.total || items.length}</span>
            <div className="button-group">
              <Button icon={FiChevronLeft} disabled={!filters.offset || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}>Sebelumnya</Button>
              <Button icon={FiChevronRight} disabled={!resource.data?.hasMore || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: resource.data?.nextOffset || current.offset + PAGE_SIZE }))}>Berikutnya</Button>
            </div>
          </div>
        </>
      ) : null}
      <TransactionForm open={formOpen} transaction={editingTransaction} onClose={() => { setFormOpen(false); setEditingTransaction(null); }} onSaved={resource.reload} />
      <ConfirmationModal
        open={Boolean(cancelTarget)}
        title="Batalkan transaksi?"
        description={cancelTarget ? `${cancelTarget.description || "Transaksi"} · pembatalan tidak menghapus audit dan akan menghitung ulang saldo.` : ""}
        confirmLabel="Batalkan transaksi"
        reasonLabel="Alasan pembatalan"
        requireReason
        busy={cancelState.status === "submitting"}
        error={cancelState.error}
        onCancel={() => cancelState.status !== "submitting" && setCancelTarget(null)}
        onConfirm={cancelTransaction}
      />
    </div>
  );
};

export default TransactionsPage;
