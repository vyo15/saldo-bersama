export const createAllocationEstimateRow = (id) => ({ id, category_id: "", amount: "" });

export const createInitialAllocationEstimate = () => [createAllocationEstimateRow("need-0")];

export const allocationEstimateTotal = (rows = []) => rows.reduce((total, row) => {
  const amount = Number(row?.amount || 0);
  return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
}, 0);

export const availableAllocationCategoryOptions = (categories, rows, currentId) => {
  const used = new Set(rows.filter((row) => row.id !== currentId).map((row) => row.category_id).filter(Boolean));
  return categories
    .filter((category) => !used.has(category.category_id))
    .map((category) => ({ value: category.category_id, label: category.name }));
};
