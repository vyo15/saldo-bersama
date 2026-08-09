import { apiClient } from "../../services/api/client.js";

export const upsertBudget = (payload, options) => apiClient.request("budgets.upsert", payload, options);
export const previewBudgetLifecycle = (payload, options) => apiClient.request("budgets.previewLifecycle", payload, options);
export const deleteUnusedBudget = (payload, options) => apiClient.request("budgets.deleteUnused", payload, options);
export const archiveBudget = (payload, options) => apiClient.request("budgets.archive", payload, options);
