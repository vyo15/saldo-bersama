import { FiCopy, FiEdit2, FiRotateCcw, FiXCircle } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import ActionOverflowMenu from "../../../components/common/ActionOverflowMenu.jsx";
import { transactionDisplayTitle } from "../../../shared/presentation/transaction.js";
import styles from "../TransactionsPage.module.css";
import { canRepeatTransaction } from "./transactionActionPresentation.js";

const TransactionActionMenu = ({ item, openEdit, openCancel, openRepeat }) => (
  <ActionOverflowMenu label={`Kelola transaksi ${transactionDisplayTitle(item)}`} className={styles.actionMenu} panelClassName={styles.actionMenuItems}>
    {(closeMenu) => <>
      {canRepeatTransaction(item) ? <button type="button" onClick={() => { closeMenu(); openRepeat(item); }}><FiCopy aria-hidden="true" />Pakai lagi</button> : null}
      {item.can_edit ? <button type="button" onClick={() => { closeMenu(); openEdit(item); }}><FiEdit2 aria-hidden="true" />Edit transaksi</button> : null}
      {item.can_cancel ? <button type="button" className={styles.actionMenuDanger} onClick={() => { closeMenu(); openCancel(item); }}><FiXCircle aria-hidden="true" />Batalkan transaksi</button> : null}
    </>}
  </ActionOverflowMenu>
);

const TransactionActions = ({ item, linkedModule, openEdit, openCancel, openRestore, openRepeat, menuOnly = false }) => {
  if (item.status === "cancelled") return item.can_restore ? <Button type="button" icon={FiRotateCcw} onClick={() => openRestore(item)}>Pulihkan</Button> : null;
  if (item.status !== "active") return null;
  if (linkedModule) return menuOnly ? null : <small className={styles.managedNote}>Kelola dari menu {linkedModule}</small>;
  if (menuOnly) return <TransactionActionMenu item={item} openEdit={openEdit} openCancel={openCancel} openRepeat={openRepeat} />;
  return <div className={`button-group ${styles.actions}`}>{canRepeatTransaction(item) ? <Button type="button" icon={FiCopy} onClick={() => openRepeat(item)}>Pakai lagi</Button> : null}{item.can_edit ? <Button type="button" icon={FiEdit2} onClick={() => openEdit(item)}>Edit</Button> : null}{item.can_cancel ? <Button type="button" variant="danger" icon={FiXCircle} onClick={() => openCancel(item)}>Batalkan transaksi</Button> : null}</div>;
};

export default TransactionActions;
