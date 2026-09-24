import { Link } from "react-router";
import { formatTransactionDate, transactionCategoryIcon, TRANSACTION_LABELS, transactionTone } from "../../../shared/presentation/transaction.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const TransactionRow = ({ row, categoryLookup, transactionCreatorLabel, balanceVisible }) => {
  const { item, delta } = row;
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const creatorLabel = typeof transactionCreatorLabel === "function"
    ? transactionCreatorLabel(item)
    : "Anggota keluarga";
  const categoryLabel = category?.name || TRANSACTION_LABELS[item.transaction_type] || "Lainnya";
  const tone = transactionTone(item.transaction_type);

  return (
    <li className={dashboardClass("desktop-activity-row")}>
      <span className={dashboardClass(`shared-transaction-icon shared-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
      <span className={dashboardClass("desktop-activity-row__copy")}>
        <strong>{title}</strong>
        <small>{formatTransactionDate(item.transaction_date)} · dicatat {creatorLabel}</small>
      </span>
      <span className={dashboardClass(`shared-category-chip shared-category-chip--${tone}`)}>{categoryLabel}</span>
      <strong className={dashboardClass(`desktop-activity-row__amount money--${tone}`)}>
        {delta < 0 ? "−" : delta > 0 ? "+" : ""}<SensitiveMoney visible={balanceVisible} value={Math.abs(delta)} tone={delta < 0 ? "negative" : delta > 0 ? "positive" : "default"} />
      </strong>
    </li>
  );
};

export const AccountTransactions = ({ model, balanceVisible }) => (
  <section className={dashboardClass("shared-panel shared-transactions desktop-activity-panel")} aria-labelledby="selected-account-transactions-title">
    <div className={dashboardClass("shared-transactions__header desktop-activity-header")}>
      <div>
        <p>Terbaru</p>
        <h2 id="selected-account-transactions-title">Aktivitas rekening</h2>
        <span>{model.selectedAccount ? (model.selectedAccount.account_name || model.selectedAccount.name) : "Semua rekening"}</span>
      </div>
      <Link to="/transaksi">Lihat semua transaksi</Link>
    </div>
    {model.transactionRows.length ? (
      <ul className={dashboardClass("desktop-activity-list")}>
        {model.transactionRows.slice(0, 4).map((row) => (
          <TransactionRow
            key={row.item.transaction_id}
            row={row}
            categoryLookup={model.categoryLookup}
            transactionCreatorLabel={model.transactionCreatorLabel}
            balanceVisible={balanceVisible}
          />
        ))}
      </ul>
    ) : (
      <div className={dashboardClass("shared-empty-state shared-empty-state--transactions")}>
        <strong>Belum ada aktivitas rekening</strong>
        <span>Aktivitas terbaru rekening terpilih akan muncul di sini.</span>
      </div>
    )}
  </section>
);
