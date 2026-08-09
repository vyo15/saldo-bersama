import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "../AccountsPage.module.css";
import AccountFinancialCard from "./AccountFinancialCard.jsx";

const MobileAccountSheets = ({
  sheet,
  accounts,
  selectedAccount,
  ownerMode,
  onClose,
  onSelectAccount,
  onViewTransactions,
  onEditAccount,
  onArchiveAccount,
}) => {
  if (!sheet) return null;

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

    </>
  );
};

export default MobileAccountSheets;
