import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import { todayInJakarta } from "../../../domain/dates.js";
import {
  formatTransactionDate,
  transactionCategoryIcon,
  transactionDisplayTitle,
  transactionPlanningContext,
  TRANSACTION_LABELS,
  transactionSign,
  transactionTone,
} from "../../../shared/presentation/transaction.js";
import styles from "../TransactionsPage.module.css";
import TransactionActions from "./TransactionActions.jsx";
import { managedTransactionModule } from "./transactionActionPresentation.js";
const transactionTitle = (item, categoryLookup = {}) => transactionDisplayTitle(item, categoryLookup[item.category_id]);
const dateKeyInJakarta = (date) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" }).format(date);
const transactionTimeLabel = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(parsed).replace(".", ":");
};
const transactionWhenLabel = (item) => {
  const key = String(item.transaction_date || "").slice(0, 10);
  const today = todayInJakarta();
  const yesterday = dateKeyInJakarta(new Date(new Date(`${today}T12:00:00+07:00`).getTime() - 86400000));
  const day = key === today ? "Hari ini" : key === yesterday ? "Kemarin" : formatTransactionDate(key);
  const time = transactionTimeLabel(item.created_at);
  return time ? `${day} · ${time}` : day;
};

const TransactionLedgerRow = ({ item, categoryLookup, accountLabel, categoryLabel, actions, onOpenDetail }) => {
  const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type);
  const planning = transactionPlanningContext(item);
  const sign = transactionSign(item.transaction_type);
  return <div className={styles.ledgerRow} data-status={item.status}>
    <button type="button" className={styles.ledgerOpen} onClick={() => onOpenDetail(item)} aria-label={`Buka detail ${transactionTitle(item, categoryLookup)}`}>
      <span className={styles.ledgerTransaction}><span className={styles.categoryIcon} data-type={item.transaction_type || "default"}><Icon aria-hidden="true" /></span><span className={styles.tablePrimary}><strong>{transactionTitle(item, categoryLookup)}</strong><small>{categoryLabel(item)} · {TRANSACTION_LABELS[item.transaction_type] || item.transaction_type}</small></span></span>
      <span className={styles.ledgerContext}><strong>{accountLabel(item)}</strong><small data-tone={planning.tone}>↳ {planning.label}</small></span>
      <span className={styles.ledgerWhen}><strong>{transactionWhenLabel(item)}</strong>{item.status && item.status !== "active" ? <StatusBadge status={item.status} /> : null}</span>
      <span className={`${styles.ledgerAmount} money--${transactionTone(item.transaction_type)}`}>{sign}<Money value={item.amount} tone={transactionTone(item.transaction_type)} /></span>
    </button>
    <div className={styles.ledgerAction}><TransactionActions item={item} linkedModule={managedTransactionModule(item)} menuOnly {...actions} /></div>
  </div>;
};

const TransactionLedger = (props) => <div className={`${styles.ledger} desktop-data-table`} role="region" aria-label="Riwayat transaksi">
  <div className={styles.ledgerHeader} aria-hidden="true"><span>Transaksi</span><span>Konteks</span><span>Waktu &amp; status</span><span>Nominal</span><span /></div>
  <div className={styles.ledgerBody}>{props.items.map((item) => <TransactionLedgerRow key={item.transaction_id} item={item} categoryLookup={props.categoryLookup} accountLabel={props.accountLabel} categoryLabel={props.categoryLabel} actions={props.actions} onOpenDetail={props.onOpenDetail} />)}</div>
</div>;

const Pagination = ({ resource, filters, setFilters, itemCount, pageSize }) => {
  if (!filters.offset && !resource.data?.hasMore) return null;
  return <div className="pagination-bar" aria-label="Navigasi halaman transaksi"><span>Menampilkan {Number(resource.data?.offset || 0) + 1}–{Number(resource.data?.offset || 0) + itemCount} dari {resource.data?.total || itemCount}</span><div className="button-group"><Button icon={FiChevronLeft} disabled={!filters.offset || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - pageSize) }))}>Sebelumnya</Button><Button icon={FiChevronRight} disabled={!resource.data?.hasMore || resource.status === "loading"} onClick={() => setFilters((current) => ({ ...current, offset: resource.data?.nextOffset || current.offset + pageSize }))}>Berikutnya</Button></div></div>;
};

const TransactionDesktopResults = (props) => {
  if (!props.items.length) return null;
  return <><TransactionLedger {...props} /><Pagination resource={props.resource} filters={props.filters} setFilters={props.setFilters} itemCount={props.items.length} pageSize={props.pageSize} /></>;
};

export default TransactionDesktopResults;
