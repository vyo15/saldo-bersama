import { useState } from "react";
import { FiChevronLeft, FiChevronRight, FiEdit2, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { apiClient } from "../../services/api/client.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import TransactionForm from "./TransactionForm.jsx";
import { createIdempotencyKey } from "../../domain/security.js";

const PAGE_SIZE = 100;

const TransactionsPage = () => {
  const { bootstrap, refresh } = useFinance();
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState({ query: "", type: "all", allocation: "all", offset: 0 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelState, setCancelState] = useState({ status: "idle", error: null });
  const resource = useApiResource("transactions.list", {
    period: "current",
    limit: PAGE_SIZE,
    offset: filters.offset,
    query: filters.query,
    transaction_type: filters.type,
    allocation: filters.allocation,
  });
  const accountLookup = Object.fromEntries((bootstrap?.accounts || []).map((item) => [item.account_id, item.name]));
  const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item.name]));
  const items = resource.data?.items || [];

  const submitSearch = (event) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, query: draftQuery.trim(), offset: 0 }));
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, offset: 0 }));

  const cancelTransaction = async (reason) => {
    if (!cancelTarget) return;
    setCancelState({ status: "submitting", error: null });
    try {
      await apiClient.request("transactions.cancel", {
        transactionId: cancelTarget.transaction_id,
        rowVersion: cancelTarget.row_version,
        reason,
      }, { rowVersion: cancelTarget.row_version, idempotencyKey: createIdempotencyKey() });
      setCancelTarget(null);
      setCancelState({ status: "idle", error: null });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) {
      setCancelState({ status: "error", error });
    }
  };

  return (
    <div className="page-stack">
      <PageHeader title="Transaksi" description="Pemasukan, pengeluaran, transfer, dan koreksi tercatat dalam satu ledger." actions={<Button variant="primary" icon={FiPlus} onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>Tambah transaksi</Button>} />
      <form className="toolbar" aria-label="Filter transaksi" onSubmit={submitSearch}>
        <label className="search-field"><FiSearch aria-hidden="true" /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /><span className="sr-only">Cari transaksi</span></label>
        <Button type="submit">Cari</Button>
        <select value={filters.type} onChange={(event) => updateFilter("type", event.target.value)} aria-label="Filter jenis transaksi"><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option><option value="adjustment">Penyesuaian</option></select>
        <select value={filters.allocation} onChange={(event) => updateFilter("allocation", event.target.value)} aria-label="Filter alokasi"><option value="all">Semua alokasi</option><option value="unallocated">Belum dialokasikan</option><option value="allocated">Sudah dialokasikan</option></select>
      </form>

      {resource.status === "loading" ? <LoadingScreen label="Memuat transaksi..." /> : null}
      {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
      {resource.status === "ready" && !items.length ? <EmptyState title="Transaksi tidak ditemukan" description="Ubah filter atau catat transaksi pertama." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Tambah transaksi</Button>} /> : null}
      {items.length ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Tanggal</th><th>Transaksi</th><th>Rekening</th><th>Kategori</th><th>Status</th><th className="align-right">Nominal</th><th><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>{items.map((item) => {
                const linkedModule = item.managed_by === "recurring" ? "Tagihan" : item.managed_by === "goal" ? "Target" : "";
                return (
                  <tr key={item.transaction_id}>
                    <td><time>{item.transaction_date}</time></td>
                    <td><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{item.transaction_type}</small></td>
                    <td>{accountLookup[item.source_account_id] || accountLookup[item.destination_account_id] || "-"}</td>
                    <td>{categoryLookup[item.category_id] || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan")}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="align-right"><Money value={item.amount} tone={item.transaction_type === "expense" ? "negative" : item.transaction_type === "income" ? "positive" : "default"} /></td>
                    <td>{item.status === "active" ? linkedModule ? <small>Kelola dari menu {linkedModule}</small> : <div className="button-group">{item.can_edit ? <button type="button" className="icon-button" onClick={() => { setEditingTransaction(item); setFormOpen(true); }} aria-label={`Edit ${item.description || "transaksi"}`}><FiEdit2 /></button> : null}{item.can_cancel ? <button type="button" className="icon-button icon-button--danger" onClick={() => { setCancelTarget(item); setCancelState({ status: "idle", error: null }); }} aria-label={`Batalkan ${item.description || "transaksi"}`}><FiTrash2 /></button> : null}</div> : null}</td>
                  </tr>
                );
              })}</tbody>
            </table>
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
