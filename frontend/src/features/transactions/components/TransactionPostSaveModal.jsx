import FinancialSuccessOverlay from "../../../components/feedback/FinancialSuccessOverlay.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { investmentContinuationState } from "../../../shared/workflows/investmentContinuation.js";

const postSaveAccount = (accounts, accountId) => accounts.find((item) => item.account_id === accountId) || null;
const snapshotAccount = (postSave, accountId) => (postSave.snapshot?.accounts || []).find((item) => item.account_id === accountId) || null;

const postSaveAccountLabel = (accounts, accountId, fallback) => {
  const account = postSaveAccount(accounts, accountId);
  return account ? accountDisplayLabel(account) : fallback;
};

const investmentTransferContinuation = ({ type, sourceAccount, destinationAccount, explicitContinuation, onClose, navigate }) => {
  if (type !== TRANSACTION_TYPES.TRANSFER) return null;
  if (explicitContinuation?.source === "investment" && explicitContinuation?.action) {
    return {
      label: explicitContinuation.action === "buy" ? "Kembali ke pembelian" : "Kembali ke Investasi",
      onClick: () => {
        onClose();
        navigate(explicitContinuation.returnTo || "/investasi", { state: investmentContinuationState({
          action: explicitContinuation.action,
          returnTo: explicitContinuation.returnTo || "/investasi",
          payload: explicitContinuation.payload || {},
        }) });
      },
    };
  }
  const destinationIsInvestment = destinationAccount?.account_type === "investment";
  const sourceIsInvestment = sourceAccount?.account_type === "investment";
  const investmentAccount = destinationIsInvestment ? destinationAccount : sourceIsInvestment ? sourceAccount : null;
  if (!investmentAccount) return null;
  const action = destinationIsInvestment ? "buy" : "view-investment";
  return {
    label: destinationIsInvestment ? "Catat pembelian" : "Buka investasi",
    onClick: () => {
      onClose();
      navigate("/investasi", { state: investmentContinuationState({ action, payload: { rdnAccountId: investmentAccount.account_id, ensureSetup: true } }) });
    },
  };
};

const authoritativeRows = ({ postSave, sourceLabel, destinationLabel }) => {
  if (!postSave.snapshot) return [{ label: "Status", value: "Berhasil", tone: "positive" }];
  const source = snapshotAccount(postSave, postSave.sourceAccountId);
  const destination = snapshotAccount(postSave, postSave.destinationAccountId);
  const rows = [];
  if ([TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.TRANSFER].includes(postSave.transactionType) && source) {
    rows.push({ label: `Saldo ${sourceLabel}`, value: formatRupiah(source.balance || 0) });
  }
  if ([TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND, TRANSACTION_TYPES.TRANSFER].includes(postSave.transactionType) && destination) {
    rows.push({ label: `Saldo ${destinationLabel}`, value: formatRupiah(destination.balance || 0) });
  }
  rows.push({ label: "Dana Tersedia", value: formatRupiah(postSave.snapshot.safeToSpend || 0) });
  if (postSave.snapshot.budget) {
    const budget = postSave.snapshot.budget;
    rows.push({ label: `Sisa ${budget.name || "Kebutuhan"}`, value: formatRupiah(Math.max(0, Number(budget.amount || 0) - Number(budget.used_amount || 0))) });
  }
  return rows;
};

const TransactionPostSaveModal = ({ open, postSave, accounts, onClose, navigate, onAddAnother }) => {
  const type = postSave.transactionType;
  const sourceAccount = postSaveAccount(accounts, postSave.sourceAccountId);
  const destinationAccount = postSaveAccount(accounts, postSave.destinationAccountId);
  const sourceLabel = postSaveAccountLabel(accounts, postSave.sourceAccountId, "rekening sumber");
  const destinationLabel = postSaveAccountLabel(accounts, postSave.destinationAccountId, "rekening tujuan");
  const investmentContinuation = investmentTransferContinuation({ type, sourceAccount, destinationAccount, explicitContinuation: postSave.continuation, onClose, navigate });
  const closeAction = investmentContinuation?.onClick || onClose;
  const doneLabel = investmentContinuation?.label || "Selesai";
  const allocate = () => {
    const state = { workflowSource: "transaction-income", workflowAction: "fund", sourceAccountId: postSave.destinationAccountId, suggestedAmount: postSave.amount };
    onClose();
    navigate("/perencanaan/kantong", { state });
  };
  const summaryRows = authoritativeRows({ postSave, sourceLabel, destinationLabel });

  const presentation = type === TRANSACTION_TYPES.INCOME
    ? {
      title: "Pemasukan berhasil",
      description: "Dana sudah masuk ke rekening. Anda dapat mengalokasikannya sekarang atau nanti.",
      summaryRows,
      secondaryActions: [
        ...(onAddAnother ? [{ label: "Tambah pemasukan lagi", onClick: onAddAnother }] : []),
        { label: "Alokasikan dana", onClick: allocate },
      ],
    }
    : type === TRANSACTION_TYPES.TRANSFER
      ? {
        title: "Transfer berhasil",
        description: investmentContinuation
          ? "Dana sudah dipindahkan dan kondisi rekening telah disegarkan. Transfer ke/dari RDN tetap netral terhadap pemasukan dan pengeluaran."
          : "Dana sudah dipindahkan dan kondisi rekening telah disegarkan. Transfer antar rekening tidak dihitung sebagai pemasukan atau pengeluaran.",
        summaryRows,
        secondaryActions: [...(!postSave.continuation ? [{ label: "Tambah lagi", onClick: onAddAnother }] : [])],
      }
      : type === TRANSACTION_TYPES.REFUND
        ? {
          title: "Refund berhasil",
          description: "Refund sudah tercatat.",
          summaryRows,
          secondaryActions: [],
        }
        : {
          title: "Pengeluaran berhasil",
          description: "Pengeluaran sudah tercatat.",
          summaryRows,
          secondaryActions: onAddAnother ? [{ label: "Tambah lagi", onClick: onAddAnother }] : [],
        };

  return <FinancialSuccessOverlay
    open={open}
    title={presentation.title}
    amount={postSave.amount}
    description={presentation.description}
    summaryRows={presentation.summaryRows}
    secondaryActions={presentation.secondaryActions}
    onClose={closeAction}
    doneLabel={doneLabel}
    footerNote={postSave.snapshot ? undefined : "Transaksi tersimpan."}
  />;
};

export default TransactionPostSaveModal;
