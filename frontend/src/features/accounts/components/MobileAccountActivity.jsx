import { APP_MEDIA } from "../../../config/layout.js";
import { useMemo } from "react";
import { FiActivity, FiAlertCircle } from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { useMediaQuery } from "../../../hooks/useMediaQuery.js";
import {
  accountTransactionDirection,
  formatTransactionDate,
  TRANSACTION_LABELS,
  transactionCategoryIcon,
} from "../../../shared/presentation/transaction.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "./MobileAccountActivity.module.css";

const HISTORY_LIMIT = 4;

const useMobileAccountActivityEnabled = () => useMediaQuery(APP_MEDIA.mobile, { fallback: true });

const longPeriodLabel = (period) => {
  const value = String(period || "");
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("id-ID", {
    ...(day ? { day: "numeric" } : {}),
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || 1))));
};

const useAccountHistory = ({ bootstrap, currentPeriod, mobileEnabled, selectedAccountId }) => {
  const historyResource = useApiResource("transactions.list", {
    period: currentPeriod,
    limit: HISTORY_LIMIT,
    offset: 0,
    query: "",
    transaction_type: "all",
    allocation: "all",
    account_id: selectedAccountId || "all",
    category_id: "all",
    created_by: "all",
  }, { enabled: mobileEnabled && Boolean(selectedAccountId) });
  const categoryLookup = useMemo(() => Object.fromEntries(
    (bootstrap?.categories || []).map((category) => [category.category_id, category]),
  ), [bootstrap?.categories]);
  const accountLookup = useMemo(() => Object.fromEntries(
    (bootstrap?.accounts || []).map((account) => [account.account_id, accountDisplayLabel(account)]),
  ), [bootstrap?.accounts]);
  return { accountLookup, categoryLookup, historyResource };
};

const MobileTransactionItem = ({ accountLookup, categoryLookup, item, selectedAccountId }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const direction = accountTransactionDirection(item, selectedAccountId);
  const inactive = Boolean(item.status && item.status !== "active");
  let counterparty = category?.name || TRANSACTION_LABELS[item.transaction_type] || "Transaksi";
  if (item.transaction_type === "transfer") {
    counterparty = item.source_account_id === selectedAccountId
      ? `Ke ${accountLookup[item.destination_account_id] || "rekening tujuan"}`
      : `Dari ${accountLookup[item.source_account_id] || "rekening asal"}`;
  }
  const title = item.description || item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Transaksi";
  return (
    <article className={styles.mobileTransactionItem}>
      <span className={styles.mobileTransactionIcon} data-tone={inactive ? "neutral" : direction.tone}><Icon aria-hidden="true" /></span>
      <span className={styles.mobileTransactionCopy}><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {counterparty}</small></span>
      <span className={styles.mobileTransactionMeta}>
        <strong data-tone={inactive ? "neutral" : direction.tone}>
          {inactive || !direction.prefix ? null : <span aria-hidden="true">{direction.prefix} </span>}
          <Money value={item.amount || 0} tone={inactive ? "default" : direction.tone} />
        </strong>
        {inactive ? <StatusBadge status={item.status} /> : null}
      </span>
    </article>
  );
};

const MobileHistoryBody = ({ accountLookup, categoryLookup, historyItems, historyResource, selectedAccount }) => {
  if (["loading", "refreshing"].includes(historyResource.status) && !historyItems.length) {
    return <div className={styles.mobileActivityState}><FiActivity aria-hidden="true" /><span>Memuat transaksi terbaru...</span></div>;
  }
  if (historyResource.status === "error") {
    return <div className={styles.mobileActivityState} role="alert"><FiAlertCircle aria-hidden="true" /><span>Transaksi terbaru belum dapat dimuat.</span><button type="button" onClick={historyResource.reload}>Coba lagi</button></div>;
  }
  if (!historyItems.length) {
    return <div className={styles.mobileActivityState}><FiActivity aria-hidden="true" /><strong>Belum ada transaksi</strong><span>Aktivitas terbaru rekening ini akan tampil di sini.</span></div>;
  }
  return (
    <div className={styles.mobileTransactionList} aria-label={`Transaksi terbaru ${selectedAccount.name}`}>
      {historyItems.map((item) => <MobileTransactionItem key={item.transaction_id} item={item} selectedAccountId={selectedAccount.account_id} accountLookup={accountLookup} categoryLookup={categoryLookup} />)}
    </div>
  );
};

const MobileRecentActivity = ({ accountLookup, categoryLookup, currentPeriod, historyResource, onViewTransactions, selectedAccount }) => {
  const historyItems = historyResource.data?.items || [];
  return (
    <section className={styles.mobileRecentActivity} aria-labelledby="mobile-account-recent-title">
      <header className={styles.mobileRecentHeading}>
        <div><h2 id="mobile-account-recent-title">Transaksi terbaru</h2><span>{longPeriodLabel(currentPeriod)}</span></div>
        <button type="button" onClick={() => onViewTransactions(selectedAccount, currentPeriod)}>Lihat semua</button>
      </header>
      {historyResource.refreshError ? <div className={styles.mobileActivityNotice} role="status">Data lama tetap ditampilkan. Penyegaran gagal.<button type="button" onClick={historyResource.reload}>Coba lagi</button></div> : null}
      <MobileHistoryBody historyItems={historyItems} historyResource={historyResource} selectedAccount={selectedAccount} accountLookup={accountLookup} categoryLookup={categoryLookup} />
    </section>
  );
};

const MobileAccountActivity = ({ selectedAccount, bootstrap, onViewTransactions }) => {
  const mobileEnabled = useMobileAccountActivityEnabled();
  const currentPeriod = currentMonthInJakarta();
  const selectedAccountId = selectedAccount?.account_id || "";
  const history = useAccountHistory({ bootstrap, currentPeriod, mobileEnabled, selectedAccountId });

  if (!selectedAccount) return null;
  return (
    <div className={styles.mobileAccountActivity} aria-label={`Aktivitas rekening ${selectedAccount.name}`}>
      <MobileRecentActivity accountLookup={history.accountLookup} categoryLookup={history.categoryLookup} currentPeriod={currentPeriod} historyResource={history.historyResource} onViewTransactions={onViewTransactions} selectedAccount={selectedAccount} />
    </div>
  );
};

export default MobileAccountActivity;
