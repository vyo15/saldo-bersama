import { FiTag } from "react-icons/fi";
import { SelectionControl } from "../../components/common/SelectionField.jsx";
import { frequentCategories } from "./transactionFormSmartDefaults.js";
import styles from "./MobileTransactionFields.module.css";

const categoryOption = (item) => ({ value: item.category_id, label: item.name });

const categoryGroups = ({ recentTransactions, sourceAccountId, visibleCategories }) => {
  const grouped = visibleCategories.length > 6;
  if (!grouped) return [{ key: "all", label: "", options: visibleCategories.map(categoryOption) }];

  const frequent = frequentCategories({ recentTransactions, sourceAccountId, visibleCategories });
  const frequentIds = new Set(frequent.map((item) => item.category_id));
  const remaining = visibleCategories.filter((item) => !frequentIds.has(item.category_id));
  return [
    frequent.length ? { key: "frequent", label: "Sering dipakai", options: frequent.map(categoryOption) } : null,
    { key: "all", label: "Semua kategori", options: remaining.map(categoryOption) },
  ].filter((group) => group?.options.length);
};

const MobileTransactionCategoryField = ({ form, update, visibleCategories, recentTransactions, errors, outcomeUnknown }) => {
  const groups = categoryGroups({
    recentTransactions,
    sourceAccountId: form.source_account_id,
    visibleCategories,
  });
  const error = errors.category_id;
  return (
    <div className={styles.categoryRow}>
      <span className={styles.detailIcon} aria-hidden="true"><FiTag /></span>
      <span className={styles.categoryCopy}>
        <span className={styles.detailKey}>Kategori</span>
        <SelectionControl
          id="category"
          className={styles.categoryControl}
          value={form.category_id}
          onChange={(categoryId) => update("category_id", categoryId)}
          groups={groups}
          placeholder="Pilih kategori"
          searchable={visibleCategories.length > 6}
          searchPlaceholder="Cari kategori…"
          ariaLabel="Kategori transaksi"
          required
          invalid={Boolean(error)}
          describedBy={error ? "category-error" : undefined}
          disabled={outcomeUnknown}
          embedded
        />
        {!form.category_id ? <span className={styles.detailMeta}>Kategori menyesuaikan jenis transaksi</span> : null}
        {error ? <span id="category-error" className={styles.detailError}>{error}</span> : null}
      </span>
    </div>
  );
};

export default MobileTransactionCategoryField;
