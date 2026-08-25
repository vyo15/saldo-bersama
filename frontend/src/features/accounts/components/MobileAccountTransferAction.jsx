import { lazy, Suspense, useMemo, useRef, useState } from "react";
import FinancialSuccessOverlay from "../../../components/feedback/FinancialSuccessOverlay.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { canRepresentAccountTransfer } from "../../../domain/ownership.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "./MobileAccountTransferAction.module.css";

const TransactionForm = lazy(() => import("../../transactions/TransactionForm.jsx"));

const TransferArrowsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h14" /><path d="m15 5 3 3-3 3" />
    <path d="M20 16H6" /><path d="m9 13-3 3 3 3" />
  </svg>
);

const activeReadableAccounts = (bootstrap) => (bootstrap?.accounts || [])
  .filter((account) => account.status === "active");

const transactionPeriod = (transaction) => {
  const date = String(transaction?.transaction_date || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : undefined;
};

const MobileTransferSuccess = ({ transaction, bootstrap, onClose, onViewTransactions }) => {
  if (!transaction) return null;
  const accounts = bootstrap?.accounts || [];
  const source = accounts.find((account) => account.account_id === transaction.source_account_id) || null;
  const destination = accounts.find((account) => account.account_id === transaction.destination_account_id) || null;
  const sourceLabel = source ? accountDisplayLabel(source, { includeOwner: false }) : "Rekening asal";
  const destinationLabel = destination ? accountDisplayLabel(destination, { includeOwner: false }) : "Rekening tujuan";
  const period = transactionPeriod(transaction);
  const viewTransactions = () => onViewTransactions?.(source || { account_id: transaction.source_account_id }, period);

  return <FinancialSuccessOverlay
    open
    title="Transfer berhasil"
    amount={transaction.amount || 0}
    description="Dana sudah berhasil dipindahkan ke rekening tujuan dan server telah mengonfirmasi transaksi."
    summaryRows={[
      { label: "Dari rekening", value: sourceLabel },
      { label: "Ke rekening", value: destinationLabel },
      { label: "Status", value: "Berhasil", tone: "positive" },
    ]}
    secondaryActions={[{ label: "Lihat transaksi", onClick: viewTransactions }]}
    onClose={onClose}
    footerNote="Riwayat transaksi sudah diperbarui."
  />;
};

const MobileAccountTransferAction = ({ bootstrap, selectedAccount, onTransferSaved, onViewTransactions }) => {
  const [transferOpen, setTransferOpen] = useState(false);
  const [successTransaction, setSuccessTransaction] = useState(null);
  const pendingSavedRef = useRef(null);
  const compatibleDestinations = useMemo(() => {
    if (!selectedAccount) return [];
    const accounts = activeReadableAccounts(bootstrap);
    return accounts.filter((account) => account.account_id !== selectedAccount.account_id
      && canRepresentAccountTransfer(selectedAccount, account));
  }, [bootstrap, selectedAccount]);
  const canTransfer = selectedAccount?.status === "active"
    && selectedAccount.can_transact !== false
    && compatibleDestinations.length > 0;

  const closeTransfer = () => {
    setTransferOpen(false);
    if (!pendingSavedRef.current) return;
    setSuccessTransaction(pendingSavedRef.current);
    pendingSavedRef.current = null;
  };

  const handleSaved = async (saved) => {
    pendingSavedRef.current = saved;
    await onTransferSaved?.(saved);
  };

  return (
    <>
      <button
        type="button"
        className={styles.mobileTransferHeaderAction}
        onClick={() => setTransferOpen(true)}
        disabled={!canTransfer}
        aria-describedby={!canTransfer ? "mobile-transfer-unavailable" : undefined}
      >
        <TransferArrowsIcon /><span>Transfer</span>
      </button>
      {!canTransfer ? <span id="mobile-transfer-unavailable" className="sr-only">Transfer memerlukan rekening sumber aktif dan rekening tujuan aktif yang kompatibel dengan ledger.</span> : null}

      {transferOpen ? <Suspense fallback={null}><TransactionForm
        open
        onClose={closeTransfer}
        initialType={TRANSACTION_TYPES.TRANSFER}
        initialSourceAccountId={selectedAccount?.account_id || ""}
        lockType
        onSaved={handleSaved}
        title="Transfer antar rekening"
        description="Pilih rekening tujuan dan nominal. Saldo baru berubah setelah server mengonfirmasi transfer."
        submitLabel="Transfer sekarang"
        submittingLabel="Memproses transfer..."
        notifyOnSuccess={false}
        presentation="mobile-transfer"
      /></Suspense> : null}

      <MobileTransferSuccess
        transaction={successTransaction}
        bootstrap={bootstrap}
        onClose={() => setSuccessTransaction(null)}
        onViewTransactions={(account, period) => {
          setSuccessTransaction(null);
          onViewTransactions?.(account, period);
        }}
      />
    </>
  );
};

export default MobileAccountTransferAction;
