import { FiTag } from "react-icons/fi";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { frequentCategories } from "./transactionFormSmartDefaults.js";

const categoryOption = (item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) });

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
  return (
    <InlineSelectionPicker
      label="Kategori"
      required
      value={form.category_id}
      onChange={(categoryId) => update("category_id", categoryId)}
      groups={groups}
      placeholder="Pilih kategori"
      placeholderMeta="Kategori menyesuaikan jenis transaksi"
      placeholderOption={{ icon: FiTag }}
      searchable={visibleCategories.length > 6}
      searchPlaceholder="Cari kategori…"
      emptyText="Belum ada kategori yang dapat dipilih."
      error={errors.category_id}
      disabled={outcomeUnknown}
    />
  );
};

export default MobileTransactionCategoryField;
