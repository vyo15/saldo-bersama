import Money from "../../../components/common/Money.jsx";
import Modal from "../../../components/common/Modal.jsx";
import { accountProviderLabel, formatAccountNumber } from "../../../shared/presentation/account.js";
import AccountFinancialCard from "./AccountFinancialCard.jsx";
import styles from "./MobileAccountSheets.module.css";

const MobileAccountPicker = ({ accounts, selectedAccount, onSelectAccount, onClose }) => (
  <Modal
    open
    onClose={onClose}
    title="Pilih rekening"
    description="Ganti rekening aktif dengan satu ketukan tanpa perlu melakukan gesture drag."
    size="sm"
  >
    <div className={styles.pickerList}>
      {accounts.map((account) => {
        const active = account.account_id === selectedAccount?.account_id;
        const meta = account.account_number
          ? formatAccountNumber(account.account_number, { placeholder: false })
          : accountProviderLabel(account);
        return (
          <button
            key={account.account_id}
            type="button"
            className={styles.pickerItem}
            aria-current={active ? "true" : undefined}
            onClick={() => {
              onSelectAccount?.(account);
              onClose?.();
            }}
          >
            <span className={styles.pickerCopy}>
              <strong>{account.name}</strong>
              <small>{meta || "Rekening"}</small>
            </span>
            <span className={styles.pickerValue}>
              <Money value={account.available_balance ?? account.balance ?? 0} />
              {active ? <small>Aktif</small> : null}
            </span>
          </button>
        );
      })}
    </div>
  </Modal>
);

const MobileAccountSheets = ({
  sheet,
  accounts = [],
  selectedAccount,
  ownerMode,
  onClose,
  onSelectAccount,
  onViewTransactions,
  onViewInvestment,
  onEditAccount,
  onArchiveAccount,
}) => {
  if (!sheet) return null;
  if (sheet === "picker") {
    return <MobileAccountPicker accounts={accounts} selectedAccount={selectedAccount} onSelectAccount={onSelectAccount} onClose={onClose} />;
  }

  return (
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
          onViewInvestment={onViewInvestment}
          onEdit={onEditAccount}
          onArchive={onArchiveAccount}
        />
      ) : null}
    </Modal>
  );
};

export default MobileAccountSheets;
