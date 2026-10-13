import { useNavigate } from "react-router";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import CompactTransactionDetail from "../../../components/common/CompactTransactionDetail.jsx";
import { useApiResource } from "../../../hooks/useApiResource.js";
import {
  formatTransactionDate,
  transactionDisplayTitle,
  transactionPlanningContext,
  TRANSACTION_LABELS,
  transactionSign,
  transactionTone,
} from "../../../shared/presentation/transaction.js";
import styles from "../TransactionsPage.module.css";
import TransactionActions from "./TransactionActions.jsx";
import { canRepeatTransaction, managedTransactionModule } from "./transactionActionPresentation.js";

const ShoppingTransactionDetail = ({ transactionId }) => {
  const navigate = useNavigate();
  const resource = useApiResource("shopping.byTransaction", { transaction_id: transactionId || "" }, { enabled: Boolean(transactionId) });
  if (resource.status !== "ready" || !resource.data?.checkout) return null;
  const { checkout, items = [] } = resource.data;
  return <section className={styles.shoppingDetail}>
    <header><div><strong>Daftar belanja</strong><span>{items.length} barang · {checkout.list_name}</span></div>{checkout.budget_id ? <button type="button" onClick={() => navigate(`/perencanaan/belanja/${checkout.budget_id}`)}>Lihat daftar</button> : null}</header>
    <div>{items.slice(0, 8).map((item) => <div key={`${item.name}-${item.quantity_milli}-${item.actual_amount}`}><span><strong>{item.name}</strong><small>{Number(item.quantity_milli || 1000) / 1000} {item.unit_key}</small></span>{Number(item.actual_amount || 0) > 0 ? <Money value={Number(item.actual_amount)} /> : <span>—</span>}</div>)}</div>
    {items.length > 8 ? <small className={styles.shoppingMore}>+{items.length - 8} barang lainnya</small> : null}
  </section>;
};

const TransactionDetailModal = ({ target, onClose, accountLabel, categoryLabel, creatorLabel, actions, desktop = false }) => {
  const tone = transactionTone(target.transaction_type);
  const sign = transactionSign(target.transaction_type);
  const linkedModule = managedTransactionModule(target);
  const planning = transactionPlanningContext(target);
  const allocationLabel = target.transaction_type === "expense"
    ? (target.envelope_period_id ? (target.allocation_name || "Menggunakan Alokasi Dana") : "Belum masuk Alokasi Dana")
    : "Tidak berlaku";
  const hasActions = target.status === "cancelled" ? Boolean(target.can_restore) : target.status === "active" && Boolean(linkedModule || canRepeatTransaction(target) || target.can_edit || target.can_cancel);
  return <Modal open title="Detail transaksi" onClose={onClose} size="sm" className={desktop ? styles.detailDrawer : styles.detailModal} mobileSwipeToClose={!desktop} footer={hasActions ? <TransactionActions item={target} linkedModule={linkedModule} {...actions} /> : null}>
    <CompactTransactionDetail
      title={transactionDisplayTitle(target)}
      date={formatTransactionDate(target.transaction_date)}
      status={target.status}
      typeLabel={TRANSACTION_LABELS[target.transaction_type] || target.transaction_type}
      amount={<span className={`${styles.detailMoney} money--${tone}`}>{sign}<Money value={target.amount} tone={tone} /></span>}
      category={categoryLabel(target)}
      account={accountLabel(target)}
      allocation={allocationLabel}
      extraFacts={[{ label: "Pencatat", value: creatorLabel(target) }, { label: "Sumber rencana", value: planning.label }]}
      technical={[{ label: "ID transaksi", value: target.transaction_id, copyable: true }]}
    ><ShoppingTransactionDetail transactionId={target.transaction_id} /></CompactTransactionDetail>
  </Modal>;
};

export default TransactionDetailModal;
