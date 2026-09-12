import { FiSearch } from "react-icons/fi";
import { Link } from "react-router";
import SelectionField from "../../../components/common/SelectionField.jsx";
import { categoryOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { formatTransactionDate, transactionCategoryIcon, TRANSACTION_LABELS, transactionTone } from "../../../shared/presentation/transaction.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const TransactionTools = ({
  bootstrap,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
}) => (
  <div className={dashboardClass("shared-transaction-tools")}>
    <label>
      <span className={dashboardClass("sr-only")}>Cari transaksi rekening terpilih</span>
      <FiSearch aria-hidden="true" />
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Cari transaksi"
      />
    </label>
    <SelectionField
      label="Filter kategori"
      hideLabel
      compact
      value={categoryFilter}
      onChange={setCategoryFilter}
      searchable={(bootstrap?.categories || []).length > 8}
      options={[
        { value: "all", label: "Semua kategori" },
        ...(bootstrap?.categories || [])
          .filter((item) => item.status === "active")
          .map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) })),
      ]}
    />
    <SelectionField
      label="Filter jenis transaksi"
      hideLabel
      compact
      value={typeFilter}
      onChange={setTypeFilter}
      options={[
        { value: "all", label: "Semua jenis" },
        ...Object.entries(TRANSACTION_LABELS).map(([value, label]) => ({ value, label })),
      ]}
    />
    <Link to="/transaksi">Lihat semua</Link>
  </div>
);

const TransactionRow = ({ row, categoryLookup, transactionCreatorLabel, selectedTransaction, setSelectedTransactionId, balanceVisible }) => {
  const { item, delta, balanceAfter } = row;
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const active = selectedTransaction?.transaction_id === item.transaction_id;
  const creatorLabel = typeof transactionCreatorLabel === "function"
    ? transactionCreatorLabel(item)
    : "Anggota keluarga";
  return (
    <tr className={dashboardClass(active ? "is-selected" : "")}>
      <td><strong>{formatTransactionDate(item.transaction_date)}</strong><small>{item.status || "active"}</small></td>
      <td>
        <button
          type="button"
          className={dashboardClass("shared-transaction-select")}
          onClick={() => setSelectedTransactionId(item.transaction_id)}
          aria-pressed={active}
        >
          <span className={dashboardClass(`shared-transaction-icon shared-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
          <span><strong>{title}</strong><small>{item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Transaksi"} · dicatat {creatorLabel}</small></span>
        </button>
      </td>
      <td><span className={dashboardClass(`shared-category-chip shared-category-chip--${transactionTone(item.transaction_type)}`)}>{category?.name || TRANSACTION_LABELS[item.transaction_type] || "Lainnya"}</span></td>
      <td>{delta < 0 ? <SensitiveMoney visible={balanceVisible} value={Math.abs(delta)} tone="negative" /> : <span>—</span>}</td>
      <td>{delta > 0 ? <SensitiveMoney visible={balanceVisible} value={delta} tone="positive" /> : <span>—</span>}</td>
      <td><SensitiveMoney visible={balanceVisible} value={balanceAfter} /></td>
    </tr>
  );
};

export const AccountTransactions = ({
  model,
  bootstrap,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
  setSelectedTransactionId,
  balanceVisible,
}) => (
  <section className={dashboardClass("shared-panel shared-transactions")} aria-labelledby="selected-account-transactions-title">
    <div className={dashboardClass("shared-transactions__header")}>
      <div>
        <p>Aktivitas rekening</p>
        <h2 id="selected-account-transactions-title">Transaksi terbaru</h2>
        <span>{model.selectedAccount ? (model.selectedAccount.account_name || model.selectedAccount.name) : "Belum ada rekening"}</span>
      </div>
      <TransactionTools
        bootstrap={bootstrap}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />
    </div>
    {model.transactionRows.length ? (
      <div className={dashboardClass("shared-transaction-table-wrap")}>
        <table className={dashboardClass("shared-transaction-table")}>
          <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead>
          <tbody>
            {model.transactionRows.slice(0, 6).map((row) => (
              <TransactionRow
                key={row.item.transaction_id}
                row={row}
                categoryLookup={model.categoryLookup}
                transactionCreatorLabel={model.transactionCreatorLabel}
                selectedTransaction={model.selectedTransaction}
                setSelectedTransactionId={setSelectedTransactionId}
                balanceVisible={balanceVisible}
              />
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className={dashboardClass("shared-empty-state shared-empty-state--transactions")}>
        <FiSearch aria-hidden="true" />
        <strong>Tidak ada transaksi yang cocok</strong>
        <span>Ubah rekening atau filter untuk melihat aktivitas lain.</span>
      </div>
    )}
    {model.selectedTransaction ? (
      <div className={dashboardClass("shared-selected-transaction")}>
        <span>Transaksi dipilih</span>
        <strong>{model.selectedTransaction.description || model.selectedTransaction.merchant || "Transaksi"}</strong>
        <small>{model.categoryLookup[model.selectedTransaction.category_id]?.name || TRANSACTION_LABELS[model.selectedTransaction.transaction_type]} · {formatTransactionDate(model.selectedTransaction.transaction_date)}</small>
      </div>
    ) : null}
  </section>
);

