import { TRANSACTION_LABELS } from "../../../shared/presentation/transaction.js";

const CHART_COLORS = [
  "var(--dashboard-chart-1)",
  "var(--dashboard-chart-2)",
  "var(--dashboard-chart-3)",
  "var(--dashboard-chart-4)",
  "var(--dashboard-chart-5)",
];

const percentage = (value, maximum) => maximum > 0
  ? Math.max(0, Math.round((Number(value || 0) / Number(maximum)) * 100))
  : 0;

const accountTransactionDelta = (transaction, accountId) => {
  if (transaction.status && transaction.status !== "active") return 0;
  const amount = Number(transaction.amount || 0);
  if (transaction.transaction_type === "transfer") {
    if (transaction.destination_account_id === accountId) return amount;
    if (transaction.source_account_id === accountId) return -amount;
    return 0;
  }
  if (["income", "refund"].includes(transaction.transaction_type)) {
    return transaction.destination_account_id === accountId ? amount : 0;
  }
  if (transaction.transaction_type === "expense") {
    return transaction.source_account_id === accountId ? -amount : 0;
  }
  if (transaction.transaction_type === "adjustment") {
    return transaction.source_account_id === accountId ? amount : 0;
  }
  if (transaction.destination_account_id === accountId) return amount;
  return transaction.source_account_id === accountId ? -amount : 0;
};

const matchesAccount = (transaction, accountId) => (
  transaction.source_account_id === accountId || transaction.destination_account_id === accountId
);

export const compactDate = (value) => {
  if (!value) return "Tanggal belum tersedia";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(parsed);
};

const filterAccountTransactions = ({ transactions, categoryFilter, typeFilter, searchTerm, categoryLookup }) => {
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  return transactions.filter((item) => {
    if (categoryFilter !== "all" && item.category_id !== categoryFilter) return false;
    if (typeFilter !== "all" && item.transaction_type !== typeFilter) return false;
    if (!query) return true;
    return [
      item.description,
      item.merchant,
      categoryLookup[item.category_id]?.name,
      TRANSACTION_LABELS[item.transaction_type],
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("id-ID")
      .includes(query);
  });
};

const transactionRowsFor = (transactions, selectedAccount) => {
  let runningBalance = Number(selectedAccount?.balance || 0);
  const lookup = new Map();
  for (const item of transactions) {
    lookup.set(item.transaction_id, runningBalance);
    runningBalance -= accountTransactionDelta(item, selectedAccount?.account_id);
  }
  return (items) => items.map((item) => ({
    item,
    delta: accountTransactionDelta(item, selectedAccount?.account_id),
    balanceAfter: lookup.get(item.transaction_id) ?? Number(selectedAccount?.balance || 0),
  }));
};

const categoryStatistics = (expenseByCategory) => {
  const categoryTotal = expenseByCategory.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = expenseByCategory.length > 5
    ? [
      ...expenseByCategory.slice(0, 4),
      {
        category_id: "other-categories",
        name: "Lainnya",
        amount: expenseByCategory.slice(4).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      },
    ]
    : expenseByCategory.slice(0, 5);
  let cursor = 0;
  const segments = categories.map((item, index) => {
    const share = categoryTotal > 0 ? (Number(item.amount || 0) / categoryTotal) * 100 : 0;
    const start = cursor;
    cursor += share;
    return `${CHART_COLORS[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return {
    categoryTotal,
    categories: categories.map((item) => ({
      ...item,
      percentage: percentage(item.amount, categoryTotal),
    })),
    donutStyle: {
      background: segments.length ? `conic-gradient(${segments.join(",")})` : "var(--surface-soft)",
    },
  };
};

const planningSummary = (overview, expenseByCategory) => {
  const budgets = (overview.budgets || []).filter((item) => item.status !== "archived");
  const totalBudget = budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const usedBudget = budgets.reduce((sum, item) => sum + Number(item.used_amount || 0), 0);
  const biggestExpense = expenseByCategory.reduce(
    (largest, item) => Number(item.amount || 0) > Number(largest?.amount || 0) ? item : largest,
    null,
  );
  const recurringItems = (overview.recurring || [])
    .filter((item) => !["paid", "cancelled", "archived"].includes(item.occurrence_status || item.status))
    .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
    .slice(0, 3);
  return {
    budgets,
    totalBudget,
    remainingBudget: Math.max(0, totalBudget - usedBudget),
    biggestExpense,
    recurringItems,
    goals: (overview.goals || []).filter((item) => item.status === "active").slice(0, 3),
    alerts: overview.alerts || [],
  };
};

export const buildDesktopModel = ({
  overview,
  viewModel,
  selectedAccountId,
  categoryFilter,
  typeFilter,
  searchTerm,
  selectedTransactionId,
}) => {
  const { accountBalances, categoryLookup, recentTransactions, expenseByCategory, transactionCreatorLabel } = viewModel;
  const selectedAccount = accountBalances.find((item) => item.account_id === selectedAccountId)
    || accountBalances[0]
    || null;
  const selectedAccountTransactions = selectedAccount
    ? recentTransactions.filter((item) => matchesAccount(item, selectedAccount.account_id))
    : [];
  const accountTransactions = filterAccountTransactions({
    transactions: selectedAccountTransactions,
    categoryFilter,
    typeFilter,
    searchTerm,
    categoryLookup,
  });
  const transactionRows = transactionRowsFor(selectedAccountTransactions, selectedAccount)(accountTransactions);
  const selectedTransaction = accountTransactions.find((item) => item.transaction_id === selectedTransactionId)
    || accountTransactions[0]
    || null;
  return {
    overview,
    accountBalances,
    categoryLookup,
    expenseByCategory,
    selectedAccount,
    selectedAccountTransactions,
    transactionRows,
    selectedTransaction,
    transactionCreatorLabel,
    ...categoryStatistics(expenseByCategory),
    ...planningSummary(overview, expenseByCategory),
  };
};

