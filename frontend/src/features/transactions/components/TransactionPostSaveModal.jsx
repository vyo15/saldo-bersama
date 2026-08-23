import FinancialSuccessOverlay from "../../../components/feedback/FinancialSuccessOverlay.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";

const postSaveAccountLabel = (accounts, accountId, fallback) => {
  const account = accounts.find((item) => item.account_id === accountId) || null;
  return account ? accountDisplayLabel(account) : fallback;
};

const TransactionPostSaveModal = ({ open, postSave, accounts, onClose, navigate, onAddAnother }) => {
  const type = postSave.transactionType;
  const sourceLabel = postSaveAccountLabel(accounts, postSave.sourceAccountId, "Rekening sumber");
  const destinationLabel = postSaveAccountLabel(accounts, postSave.destinationAccountId, "Rekening tujuan");
  const allocate = () => {
    const state = { workflowSource: "transaction-income", workflowAction: "fund", sourceAccountId: postSave.destinationAccountId, suggestedAmount: postSave.amount };
    onClose();
    navigate("/perencanaan/kantong", { state });
  };

  const presentation = type === TRANSACTION_TYPES.INCOME
    ? {
      title: "Pemasukan berhasil",
      description: "Dana sudah masuk ke rekening. Anda dapat membagi sebagian atau seluruh dana tersedia ke Alokasi Dana tanpa membuat transaksi baru.",
      summaryRows: [
        { label: "Rekening tujuan", value: destinationLabel },
        { label: "Status", value: "Berhasil", tone: "positive" },
      ],
      secondaryActions: [
        { label: "Tambah pemasukan lagi", onClick: onAddAnother },
        { label: "Bagi ke Alokasi Dana", onClick: allocate },
      ],
    }
    : type === TRANSACTION_TYPES.TRANSFER
      ? {
        title: "Transfer berhasil",
        description: "Dana sudah berhasil dipindahkan ke rekening tujuan dan server telah mengonfirmasi transaksi.",
        summaryRows: [
          { label: "Dari rekening", value: sourceLabel },
          { label: "Ke rekening", value: destinationLabel },
          { label: "Status", value: "Berhasil", tone: "positive" },
        ],
        secondaryActions: [{ label: "Tambah lagi", onClick: onAddAnother }],
      }
      : type === TRANSACTION_TYPES.REFUND
        ? {
          title: "Refund berhasil",
          description: "Refund sudah tercatat dan saldo rekening telah diperbarui oleh server.",
          summaryRows: [
            { label: "Rekening", value: sourceLabel },
            { label: "Status", value: "Berhasil", tone: "positive" },
          ],
          secondaryActions: [],
        }
        : {
          title: "Pengeluaran berhasil",
          description: "Pengeluaran sudah tercatat dan saldo rekening telah diperbarui oleh server.",
          summaryRows: [
            { label: "Rekening", value: sourceLabel },
            { label: "Status", value: "Berhasil", tone: "positive" },
          ],
          secondaryActions: [{ label: "Tambah lagi", onClick: onAddAnother }],
        };

  return <FinancialSuccessOverlay
    open={open}
    title={presentation.title}
    amount={postSave.amount}
    description={presentation.description}
    summaryRows={presentation.summaryRows}
    secondaryActions={presentation.secondaryActions}
    onClose={onClose}
    footerNote="Riwayat transaksi sudah diperbarui."
  />;
};


export default TransactionPostSaveModal;
