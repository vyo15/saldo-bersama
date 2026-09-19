import { FiTag } from "react-icons/fi";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { frequentCategories } from "./transactionFormSmartDefaults.js";

const categoryOption = (item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) });

const categoryGroups = ({ recentTransactions, sourceAccountId, destinationAccountId, transactionType, visibleCategories, label }) => {
  const grouped = visibleCategories.length > 6;
  if (!grouped) return [{ key: "all", label: "", options: visibleCategories.map(categoryOption) }];

  const frequent = frequentCategories({ recentTransactions, sourceAccountId, destinationAccountId, transactionType, visibleCategories });
  const frequentIds = new Set(frequent.map((item) => item.category_id));
  const remaining = visibleCategories.filter((item) => !frequentIds.has(item.category_id));
  return [
    frequent.length ? { key: "frequent", label: "Sering dipakai", options: frequent.map(categoryOption) } : null,
    { key: "all", label: label === "Sumber" ? "Semua sumber" : "Semua kategori", options: remaining.map(categoryOption) },
  ].filter((group) => group?.options.length);
};

const MobileTransactionCategoryField = ({ form, update, visibleCategories, recentTransactions, errors, outcomeUnknown, label = "Kategori" }) => {
  const groups = categoryGroups({
    recentTransactions,
    sourceAccountId: form.source_account_id,
    destinationAccountId: form.destination_account_id,
    transactionType: form.transaction_type,
    visibleCategories,
    label,
  });
  return (
    <InlineSelectionPicker
      label={label}
      required
      value={form.category_id}
      onChange={(categoryId) => update("category_id", categoryId)}
      groups={groups}
      placeholder={label === "Sumber" ? "Pilih sumber" : "Pilih kategori"}
      placeholderOption={{ icon: FiTag }}
      searchable={visibleCategories.length > 6}
      searchPlaceholder={label === "Sumber" ? "Cari sumber…" : "Cari kategori…"}
      emptyText={label === "Sumber" ? "Belum ada sumber pemasukan yang dapat dipilih." : "Belum ada kategori yang dapat dipilih."}
      error={errors.category_id}
      disabled={outcomeUnknown}
    />
  );
};

export default MobileTransactionCategoryField;
