import { FiCreditCard, FiExternalLink, FiShield } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Modal from "../../../components/common/Modal.jsx";
import { formatTransactionDate, TRANSACTION_LABELS, transactionTone } from "../../../shared/presentation/transaction.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const MobileTransactionDetail = ({
  open,
  onClose,
  transaction,
  title,
  category,
  accountLabel,
  envelope,
  envelopeNote,
  lastSyncedAt,
  balanceVisible,
  onOpenTransaction,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Detail transaksi"
    description={transaction ? `ID ${transaction.transaction_id}` : "Transaksi tidak tersedia."}
    size="sm"
    footer={transaction ? (
      <>
        <Link className="button button--secondary mobile-detail-link" to="/transaksi" onClick={onClose}><FiExternalLink aria-hidden="true" /><span>Lihat semua</span></Link>
        <Button variant="primary" icon={FiCreditCard} onClick={onOpenTransaction}>Tambah transaksi</Button>
      </>
    ) : null}
  >
    {transaction ? (
      <article className="mobile-dashboard-transaction-detail">
        <header>
          <div>
            <span>Nominal</span>
            <SensitiveMoney visible={balanceVisible} value={transaction.amount} tone={transactionTone(transaction.transaction_type)} />
          </div>
          <span className="status-badge status-badge--active"><FiShield aria-hidden="true" /> {transaction.status || "active"}</span>
        </header>
        <dl>
          <div><dt>Jenis</dt><dd>{TRANSACTION_LABELS[transaction.transaction_type] || transaction.transaction_type}</dd></div>
          <div><dt>Deskripsi</dt><dd>{title}</dd></div>
          <div><dt>Kategori</dt><dd>{category}</dd></div>
          <div><dt>Rekening</dt><dd>{accountLabel}</dd></div>
          <div><dt>Alokasi</dt><dd>{envelope}<small>{envelopeNote}</small></dd></div>
          <div><dt>Tanggal</dt><dd>{formatTransactionDate(transaction.transaction_date)}<small>Zona waktu Asia/Jakarta</small></dd></div>
          <div><dt>Sinkron terakhir</dt><dd>{lastSyncedAt}</dd></div>
        </dl>
      </article>
    ) : <p className="empty-inline-message">Transaksi yang dipilih tidak lagi tersedia pada hasil filter.</p>}
  </Modal>
);

export default MobileTransactionDetail;
