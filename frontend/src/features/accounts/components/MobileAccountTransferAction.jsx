import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { FiArrowRight, FiCheck, FiChevronRight, FiRepeat } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { filterByOwnership } from "../../../domain/ownership.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import styles from "./MobileAccountTransferAction.module.css";

const TransactionForm = lazy(() => import("../../transactions/TransactionForm.jsx"));

const activeTransactableAccounts = (bootstrap) => (bootstrap?.accounts || [])
  .filter((account) => account.status === "active" && account.can_transact !== false);

const transactionPeriod = (transaction) => {
  const date = String(transaction?.transaction_date || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : undefined;
};

const resetSuccessMotionPointer = (element) => {
  element?.style.setProperty("--success-motion-x", "50%");
  element?.style.setProperty("--success-motion-y", "50%");
  element?.style.setProperty("--success-motion-rx", "0deg");
  element?.style.setProperty("--success-motion-ry", "0deg");
};

const updateSuccessMotionPointer = (event) => {
  const element = event.currentTarget;
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
  const horizontal = x / bounds.width;
  const vertical = y / bounds.height;
  element.style.setProperty("--success-motion-x", `${horizontal * 100}%`);
  element.style.setProperty("--success-motion-y", `${vertical * 100}%`);
  element.style.setProperty("--success-motion-rx", `${(0.5 - vertical) * 7}deg`);
  element.style.setProperty("--success-motion-ry", `${(horizontal - 0.5) * 7}deg`);
};

const MobileTransferSuccess = ({ transaction, bootstrap, onClose, onViewTransactions }) => {
  const [motionIteration, setMotionIteration] = useState(0);
  const accounts = bootstrap?.accounts || [];
  const source = accounts.find((account) => account.account_id === transaction?.source_account_id) || null;
  const destination = accounts.find((account) => account.account_id === transaction?.destination_account_id) || null;
  const sourceLabel = source ? accountDisplayLabel(source, { includeOwner: false }) : "Rekening asal";
  const destinationLabel = destination ? accountDisplayLabel(destination, { includeOwner: false }) : "Rekening tujuan";
  const period = transactionPeriod(transaction);

  return (
    <Modal
      open={Boolean(transaction)}
      onClose={onClose}
      title="Transfer berhasil"
      description="Server telah mengonfirmasi transaksi. Aplikasi sudah memicu penyegaran data rekening sebelum menampilkan ringkasan ini."
      size="sm"
      footer={<>
        <Button type="button" onClick={() => onViewTransactions?.(source || { account_id: transaction?.source_account_id }, period)}>Lihat transaksi</Button>
        <Button type="button" variant="primary" onClick={onClose}>Selesai</Button>
      </>}
    >
      <div className={styles.mobileTransferSuccess}>
        <button
          key={motionIteration}
          type="button"
          className={styles.mobileTransferSuccessVisual}
          aria-label="Ulangi animasi transfer berhasil"
          title="Ulangi animasi sukses"
          onClick={() => setMotionIteration((current) => current + 1)}
          onPointerMove={updateSuccessMotionPointer}
          onPointerLeave={(event) => resetSuccessMotionPointer(event.currentTarget)}
        >
          <span className={styles.mobileTransferSuccessAmbient} aria-hidden="true" />
          <span className={styles.mobileTransferSuccessLogo} aria-hidden="true">
            <img src="/brand/saldo-bersama-mark.png" alt="" />
            <span className={styles.mobileTransferSuccessLogoEnergy} />
            <span className={styles.mobileTransferSuccessLogoSweep} />
            <span className={styles.mobileTransferSuccessFlow} />
          </span>
          <span className={styles.mobileTransferSuccessCheck} aria-hidden="true"><FiCheck /></span>
          <span className={styles.mobileTransferSuccessRipple} aria-hidden="true" />
        </button>
        <div className={styles.mobileTransferSuccessCopy} role="status" aria-live="polite" aria-atomic="true">
          <small>TRANSFER BERHASIL</small>
          <strong><Money value={transaction?.amount || 0} /></strong>
          <p>Dana berhasil dipindahkan ke <b>{destinationLabel}</b>.</p>
        </div>
        <div className={styles.mobileTransferSuccessRoute}>
          <span><small>Dari</small><strong>{sourceLabel}</strong></span>
          <FiArrowRight aria-hidden="true" />
          <span><small>Ke</small><strong>{destinationLabel}</strong></span>
        </div>
        <div className={styles.mobileTransferSuccessStatus}>
          <span>Status transaksi</span>
          <strong><i aria-hidden="true" />Berhasil</strong>
        </div>
      </div>
    </Modal>
  );
};

const MobileAccountTransferAction = ({ bootstrap, selectedAccount, onTransferSaved, onViewTransactions }) => {
  const [transferOpen, setTransferOpen] = useState(false);
  const [successTransaction, setSuccessTransaction] = useState(null);
  const pendingSavedRef = useRef(null);
  const compatibleDestinations = useMemo(() => {
    if (!selectedAccount) return [];
    const accounts = activeTransactableAccounts(bootstrap);
    return filterByOwnership(accounts, selectedAccount)
      .filter((account) => account.account_id !== selectedAccount.account_id);
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
        className={styles.mobileTransferQuickAction}
        onClick={() => setTransferOpen(true)}
        disabled={!canTransfer}
        aria-describedby={!canTransfer ? "mobile-transfer-unavailable" : undefined}
      >
        <span className={styles.mobileTransferQuickIcon}><FiRepeat aria-hidden="true" /></span>
        <span className={styles.mobileTransferQuickCopy}>
          <strong>Transfer</strong>
          <small>{canTransfer ? "Pindahkan saldo ke rekening lain" : "Tidak ada rekening tujuan yang kompatibel"}</small>
        </span>
        <FiChevronRight className={styles.mobileTransferQuickChevron} aria-hidden="true" />
      </button>
      {!canTransfer ? <span id="mobile-transfer-unavailable" className="sr-only">Transfer memerlukan rekening sumber aktif dan rekening tujuan aktif dengan ruang kepemilikan yang sama.</span> : null}

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
