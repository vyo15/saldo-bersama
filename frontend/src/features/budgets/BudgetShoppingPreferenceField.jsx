import { FiShoppingCart } from "react-icons/fi";
import styles from "./BudgetShoppingPreferenceField.module.css";

const disabledHelper = (openItems) => openItems > 0
  ? `${openItems} barang belum selesai. Selesaikan atau hapus barang tersebut sebelum menonaktifkan daftar belanja.`
  : "";

const BudgetShoppingPreferenceField = ({ checked = false, onChange, disabled = false, openItems = 0, compact = false }) => {
  const lockDisable = checked && openItems > 0;
  const inputDisabled = disabled || lockDisable;
  const helper = disabledHelper(openItems);
  return <label className={`${styles.field} ${compact ? styles.compact : ""} ${inputDisabled ? styles.disabled : ""}`}>
    <span className={styles.icon}><FiShoppingCart aria-hidden="true" /></span>
    <span className={styles.copy}>
      <strong>Gunakan daftar belanja</strong>
      <small>{helper || "Cocok untuk kebutuhan yang terdiri dari beberapa barang, seperti belanja bulanan atau perlengkapan rumah."}</small>
    </span>
    <span className={styles.switch}>
      <input
        type="checkbox"
        role="switch"
        checked={Boolean(checked)}
        disabled={inputDisabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span aria-hidden="true" />
    </span>
  </label>;
};

export default BudgetShoppingPreferenceField;
