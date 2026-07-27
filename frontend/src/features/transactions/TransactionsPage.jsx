import { useMemo, useState } from "react";
import { FiEdit2, FiPlus, FiSearch, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
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

const TransactionsPage = () => {
  const resource = useApiResource("transactions.list", { period: "current", limit: 100 });
  const { bootstrap, refresh } = useFinance();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [allocationFilter, setAllocationFilter] = useState("all");
  const accountLookup = Object.fromEntries((bootstrap?.accounts || []).map((item) => [item.account_id, item.name]));
  const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item.name]));

  const items = useMemo(() => (resource.data?.items || []).filter((item) => {
    if (type !== "all" && item.transaction_type !== type) return false;
    if (allocationFilter === "unallocated" && !(item.transaction_type === "expense" && !item.envelope_period_id)) return false;
    if (allocationFilter === "allocated" && item.transaction_type === "expense" && !item.envelope_period_id) return false;
    const haystack = `${item.description || ""} ${item.merchant || ""} ${categoryLookup[item.category_id] || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [allocationFilter, categoryLookup, query, resource.data?.items, type]);

  const cancelTransaction = async (item) => {
    const reason = window.prompt("Alasan pembatalan transaksi (wajib):");
    if (!reason?.trim()) return;
    await apiClient.request("transactions.cancel", { transactionId: item.transaction_id, rowVersion: item.row_version, reason: reason.trim() }, { rowVersion: item.row_version });
    await Promise.all([resource.reload(), refresh()]);
  };

  return (
    <div className="page-stack">
      <PageHeader title="Transaksi" description="Pemasukan, pengeluaran, transfer, dan koreksi tercatat dalam satu ledger." actions={<Button variant="primary" icon={FiPlus} onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>Tambah transaksi</Button>} />
      <section className="toolbar" aria-label="Filter transaksi">
        <label className="search-field"><FiSearch aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari keterangan atau kategori" /></label>
        <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter jenis transaksi"><option value="all">Semua jenis</option><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option><option value="transfer">Transfer</option><option value="refund">Refund</option></select>
        <select value={allocationFilter} onChange={(event) => setAllocationFilter(event.target.value)} aria-label="Filter alokasi"><option value="all">Semua alokasi</option><option value="unallocated">Belum dialokasikan</option><option value="allocated">Sudah dialokasikan</option></select>
      </section>

      {resource.status === "loading" ? <LoadingScreen label="Memuat transaksi..." /> : null}
      {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
      {resource.status === "ready" && !items.length ? <EmptyState title="Transaksi tidak ditemukan" description="Ubah filter atau catat transaksi pertama." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Tambah transaksi</Button>} /> : null}
      {items.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Tanggal</th><th>Transaksi</th><th>Rekening</th><th>Kategori</th><th>Status</th><th className="align-right">Nominal</th><th><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.transaction_id}>
                <td><time>{item.transaction_date}</time></td>
                <td><strong>{item.description || item.merchant || "Tanpa keterangan"}</strong><small>{item.transaction_type}</small></td>
                <td>{accountLookup[item.source_account_id] || accountLookup[item.destination_account_id] || "-"}</td>
                <td>{categoryLookup[item.category_id] || (item.transaction_type === "transfer" ? "Transfer internal" : "Belum dialokasikan")}</td>
                <td><StatusBadge status={item.status} /></td>
                <td className="align-right"><Money value={item.amount} tone={item.transaction_type === "expense" ? "negative" : item.transaction_type === "income" ? "positive" : "default"} /></td>
                <td>{item.status === "active" ? <div className="button-group"><button type="button" className="icon-button" onClick={() => { setEditingTransaction(item); setFormOpen(true); }} aria-label={`Edit ${item.description || "transaksi"}`}><FiEdit2 /></button><button type="button" className="icon-button icon-button--danger" onClick={() => cancelTransaction(item)} aria-label={`Batalkan ${item.description || "transaksi"}`}><FiTrash2 /></button></div> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      <TransactionForm open={formOpen} transaction={editingTransaction} onClose={() => { setFormOpen(false); setEditingTransaction(null); }} onSaved={resource.reload} />
    </div>
  );
};

export default TransactionsPage;
