import { FiClock } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../../components/feedback/ErrorState.jsx";
import { currentMonthInJakarta } from "../../../domain/dates.js";
import {
  formatTransactionDate,
  TRANSACTION_LABELS,
  transactionCategoryIcon,
  transactionTone,
} from "../../../shared/presentation/transaction.js";
import { accountDisplayLabel } from "../accountPresentation.js";
import styles from "../AccountsPage.module.css";
import AccountFinancialCard from "./AccountFinancialCard.jsx";

const MobileAccountSheets = ({
  sheet,
  accounts,
  bootstrap,
  selectedAccount,
  ownerMode,
  paymentHistoryPeriod,
  paymentHistoryResource,
  onClose,
  onSelectAccount,
  onViewTransactions,
  onEditAccount,
  onArchiveAccount,
  onPaymentHistoryPeriodChange,
}) => {
  if (!sheet) return null;

  const accountLookup = Object.fromEntries(
    (bootstrap?.accounts?.length ? bootstrap.accounts : accounts)
      .map((account) => [account.account_id, accountDisplayLabel(account)]),
  );
  const categoryLookup = Object.fromEntries(
    (bootstrap?.categories || []).map((category) => [category.category_id, category]),
  );
  const paymentHistoryItems = (paymentHistoryResource.data?.items || []).filter((item) => (
    item.source_account_id === selectedAccount?.account_id
    && ["expense", "transfer"].includes(item.transaction_type)
  ));

  return (
    <>
      <Modal
        open={sheet === "accounts"}
        onClose={onClose}
        title="Daftar rekening"
        description="Pilih rekening untuk menampilkannya sebagai kartu aktif."
        size="sm"
      >
        <div className={styles.mobileAccountList} aria-label="Daftar rekening aktif">
          {accounts.map((account) => (
            <button
              key={`mobile-account-list-${account.account_id}`}
              type="button"
              className={styles.mobileAccountListItem}
              aria-pressed={account.account_id === selectedAccount?.account_id}
              onClick={() => onSelectAccount(account.account_id)}
            >
              <span>
                <strong>{accountDisplayLabel(account)}</strong>
                <small>{account.owner_scope === "shared" ? "Rekening bersama" : `Rekening pribadi${account.owner_name ? ` · ${account.owner_name}` : ""}`}</small>
              </span>
              <Money value={account.balance || 0} />
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={sheet === "detail" && Boolean(selectedAccount)}
        onClose={onClose}
        title={selectedAccount?.name || "Detail rekening"}
        description="Detail rekening hanya ditampilkan setelah kartu aktif ditekan."
        size="sm"
      >
        {selectedAccount ? (
          <AccountFinancialCard
            account={selectedAccount}
            variant="mobileDetail"
            embedded
            ownerMode={ownerMode}
            onViewTransactions={onViewTransactions}
            onEdit={onEditAccount}
            onArchive={onArchiveAccount}
          />
        ) : null}
      </Modal>

      <Modal
        open={sheet === "history" && Boolean(selectedAccount)}
        onClose={onClose}
        title="Pembayaran keluar"
        description={selectedAccount ? `Pengeluaran dan transfer keluar yang menggunakan ${selectedAccount.name}.` : "Pembayaran keluar rekening."}
        size="sm"
        footer={<Button onClick={() => onViewTransactions(selectedAccount)}>Lihat semua transaksi rekening</Button>}
      >
        <div className={styles.paymentHistoryToolbar}>
          <label>
            <span>Periode</span>
            <input
              type="month"
              max={currentMonthInJakarta()}
              value={paymentHistoryPeriod}
              onChange={(event) => onPaymentHistoryPeriodChange(event.target.value)}
              aria-label="Periode riwayat pembayaran"
            />
          </label>
          <p>Riwayat dimuat saat dibuka dan difilter berdasarkan rekening aktif.</p>
        </div>

        {paymentHistoryResource.refreshError ? <RefreshWarning error={paymentHistoryResource.refreshError} onRetry={paymentHistoryResource.reload} /> : null}
        {["loading", "refreshing"].includes(paymentHistoryResource.status) ? (
          <p className={styles.paymentHistoryState}>Memuat riwayat pembayaran...</p>
        ) : paymentHistoryResource.status === "error" ? (
          <ErrorState error={paymentHistoryResource.error} onRetry={paymentHistoryResource.reload} />
        ) : paymentHistoryItems.length ? (
          <div className={styles.paymentHistoryList} aria-label={`Pembayaran keluar ${selectedAccount?.name || "rekening"}`}>
            {paymentHistoryItems.map((item) => {
              const category = categoryLookup[item.category_id];
              const HistoryIcon = transactionCategoryIcon(category, item.transaction_type);
              const tone = transactionTone(item.transaction_type);
              const destination = item.transaction_type === "transfer"
                ? accountLookup[item.destination_account_id] || "Rekening tujuan"
                : category?.name || TRANSACTION_LABELS[item.transaction_type] || "Pembayaran";
              const title = item.description || item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Pembayaran";
              const inactive = Boolean(item.status && item.status !== "active");
              return (
                <article className={styles.paymentHistoryItem} key={item.transaction_id}>
                  <span className={styles.paymentHistoryIcon} data-tone={inactive ? "neutral" : tone}><HistoryIcon aria-hidden="true" /></span>
                  <div className={styles.paymentHistoryCopy}>
                    <strong>{title}</strong>
                    <small>{item.transaction_type === "transfer" ? `Transfer ke ${destination}` : destination}</small>
                    <span>{formatTransactionDate(item.transaction_date)}</span>
                  </div>
                  <div className={styles.paymentHistoryMeta}>
                    <strong data-tone={inactive ? "neutral" : tone}>{inactive ? null : "− "}<Money value={item.amount || 0} /></strong>
                    {inactive ? <StatusBadge status={item.status} /> : <small>Tercatat</small>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.paymentHistoryEmpty}>
            <FiClock aria-hidden="true" />
            <strong>Belum ada pembayaran pada periode ini</strong>
            <p>Pilih periode lain atau buka seluruh transaksi untuk melihat aktivitas rekening.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export default MobileAccountSheets;
