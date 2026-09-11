const ACTION_LOADERS = Object.freeze({
  transaction: () => import("../features/transactions/TransactionForm.jsx"),
  accountEditor: () => import("../features/accounts/components/AccountEditorDialogs.jsx"),
  investmentDialog: () => import("../features/investments/InvestmentDialog.jsx"),
  investmentSetup: () => import("../features/investments/InvestmentSetupDialog.jsx"),
  investmentValuation: () => import("../features/investments/InvestmentValuationDialog.jsx"),
  goalDialog: () => import("../features/goals/components/GoalDialogLayer.jsx"),
  recurringDialog: () => import("../features/recurring/RecurringDialogLayer.jsx"),
  allocationOverlay: () => import("../features/allocations/AllocationOverlayLayer.jsx"),
});

const loadedActions = new Map();

export const loadActionModule = (action) => {
  const key = String(action || "");
  const loader = ACTION_LOADERS[key];
  if (!loader) return Promise.resolve(null);
  if (!loadedActions.has(key)) loadedActions.set(key, loader().catch((error) => { loadedActions.delete(key); throw error; }));
  return loadedActions.get(key);
};

export const preloadAction = (action) => loadActionModule(action).catch(() => null);

export const preloadFrequentActions = () => Promise.allSettled([preloadAction("transaction")]);

