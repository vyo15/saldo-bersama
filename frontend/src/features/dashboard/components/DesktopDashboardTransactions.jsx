import { FiChevronRight } from "react-icons/fi";
import { Link } from "react-router";
import { formatTransactionDate, transactionCategoryIcon, TRANSACTION_LABELS } from "../../../shared/presentation/transaction.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const TransactionRow = ({ row, categoryLookup, transactionCreatorLabel, balanceVisible }) => {
  const { item, delta } = row;
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const categoryLabel = category?.name || TRANSACTION_LABELS[item.transaction_type] || "Lainnya";
  const creatorLabel = typeof transactionCreatorLabel === "function"
    ? transactionCreatorLabel(item)
    : "Anggota keluarga";

  return (
    <li className={dashboardClass("desktop-activity-row")}>
      <span className={dashboardClass(`shared-transaction-icon shared-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
      <span className={dashboardClass("desktop-activity-row__copy")}>
        <strong>{title}</strong>
        <small>{categoryLabel} · {formatTransactionDate(item.transaction_date)} · dicatat {creatorLabel}</small>
      </span>
      <strong className={dashboardClass(`desktop-activity-row__amount money--${delta < 0 ? "negative" : delta > 0 ? "positive" : "default"}`)}>
        {delta < 0 ? "−" : delta > 0 ? "+" : ""}<SensitiveMoney visible={balanceVisible} value={Math.abs(delta)} tone={delta < 0 ? "negative" : delta > 0 ? "positive" : "default"} />
      </strong>
      <FiChevronRight className={dashboardClass("desktop-activity-row__chevron")} aria-hidden="true" />
    </li>
  );
};

export const AccountTransactions = ({ model, balanceVisible }) => (
  <section className={dashboardClass("shared-panel desktop-reference-panel desktop-activity-panel")} aria-labelledby="selected-account-transactions-title">
    <div className={dashboardClass("desktop-reference-panel__heading desktop-activity-header")}>
      <div>
        <h2 id="selected-account-transactions-title">Aktivitas Terbaru</h2>
        <small>{model.selectedAccount ? (model.selectedAccount.account_name || model.selectedAccount.name) : "Semua rekening"}</small>
      </div>
      <Link to="/transaksi">Lihat semua <FiChevronRight aria-hidden="true" /></Link>
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
