import { FiExternalLink, FiPlus } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import ButtonLink from "../../../components/common/ButtonLink.jsx";
import CompactTransactionDetail from "../../../components/common/CompactTransactionDetail.jsx";
import Modal from "../../../components/common/Modal.jsx";
import { formatTransactionDate, TRANSACTION_LABELS, transactionTone } from "../../../shared/presentation/transaction.js";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const MobileTransactionDetail = ({ open, onClose, transaction, title, category, accountLabel, envelope, envelopeNote, lastSyncedAt, balanceVisible, onOpenTransaction }) => (
  <Modal open={open} onClose={onClose} title="Detail transaksi" size="sm" footer={transaction ? <ButtonLink className={dashboardClass("mobile-detail-link")} to="/transaksi" onClick={onClose} icon={FiExternalLink}>Lihat transaksi</ButtonLink> : null}>
    {transaction ? <CompactTransactionDetail
      title={title}
      date={formatTransactionDate(transaction.transaction_date)}
      status={transaction.status}
      typeLabel={TRANSACTION_LABELS[transaction.transaction_type] || transaction.transaction_type}
      amount={<SensitiveMoney visible={balanceVisible} value={transaction.amount} tone={transactionTone(transaction.transaction_type)} />}
      category={category}
      account={accountLabel}
      allocation={envelope}
      allocationNote={envelopeNote}
      extraFacts={[{ label: "Sinkron terakhir", value: lastSyncedAt || "Belum tersedia" }]}
      technical={[{ label: "ID transaksi", value: transaction.transaction_id, copyable: true }]}
      detailsFooter={<div className={dashboardClass("mobile-detail-secondary-action")}><Button type="button" icon={FiPlus} onClick={onOpenTransaction}>Catat transaksi baru</Button></div>}
    />
      : <p className={dashboardClass("empty-inline-message")}>Transaksi yang dipilih tidak lagi tersedia pada hasil filter.</p>}
  </Modal>
);

export default MobileTransactionDetail;
