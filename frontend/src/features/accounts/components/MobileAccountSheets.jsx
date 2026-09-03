import Modal from "../../../components/common/Modal.jsx";
import AccountFinancialCard from "./AccountFinancialCard.jsx";

const MobileAccountSheets = ({
  sheet,
  selectedAccount,
  ownerMode,
  onClose,
  onViewTransactions,
  onViewInvestment,
  onEditAccount,
  onArchiveAccount,
}) => {
  if (!sheet) return null;

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
