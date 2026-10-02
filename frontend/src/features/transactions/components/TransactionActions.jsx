import { FiCopy, FiEdit2, FiMoreHorizontal, FiRotateCcw, FiTrash2 } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import { transactionDisplayTitle } from "../../../shared/presentation/transaction.js";
import styles from "../TransactionsPage.module.css";
import { canRepeatTransaction } from "./transactionActionPresentation.js";

const closeTransactionActionMenu = (event, action) => {
  event.currentTarget.closest("details")?.removeAttribute("open");
  action();
};

const TransactionActionMenu = ({ item, openEdit, openCancel, openRepeat }) => (
  <details className={styles.actionMenu}>
    <summary aria-label={`Kelola transaksi ${transactionDisplayTitle(item)}`} title="Kelola transaksi"><FiMoreHorizontal aria-hidden="true" /></summary>
    <div className={styles.actionMenuItems}>
      {canRepeatTransaction(item) ? <button type="button" onClick={(event) => closeTransactionActionMenu(event, () => openRepeat(item))}><FiCopy aria-hidden="true" />Pakai lagi</button> : null}
      {item.can_edit ? <button type="button" onClick={(event) => closeTransactionActionMenu(event, () => openEdit(item))}><FiEdit2 aria-hidden="true" />Edit transaksi</button> : null}
      {item.can_cancel ? <button type="button" className={styles.actionMenuDanger} onClick={(event) => closeTransactionActionMenu(event, () => openCancel(item))}><FiTrash2 aria-hidden="true" />Batalkan transaksi</button> : null}
    </div>
  </details>
);

const TransactionActions = ({ item, linkedModule, openEdit, openCancel, openRestore, openRepeat, menuOnly = false }) => {
  if (item.status === "cancelled") return item.can_restore ? <Button type="button" icon={FiRotateCcw} onClick={() => openRestore(item)}>Pulihkan</Button> : null;
  if (item.status !== "active") return null;
  if (linkedModule) return menuOnly ? null : <small className={styles.managedNote}>Kelola dari menu {linkedModule}</small>;
  if (menuOnly) return <TransactionActionMenu item={item} openEdit={openEdit} openCancel={openCancel} openRepeat={openRepeat} />;
  return <div className={`button-group ${styles.actions}`}>{canRepeatTransaction(item) ? <Button type="button" icon={FiCopy} onClick={() => openRepeat(item)}>Pakai lagi</Button> : null}{item.can_edit ? <Button type="button" icon={FiEdit2} onClick={() => openEdit(item)}>Edit</Button> : null}{item.can_cancel ? <Button type="button" variant="danger" icon={FiTrash2} onClick={() => openCancel(item)}>Batalkan</Button> : null}</div>;
};

export default TransactionActions;
