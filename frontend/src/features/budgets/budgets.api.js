import { apiClient } from "../../services/api/client.js";

export const upsertBudget = (payload, options) => apiClient.request("budgets.upsert", payload, options);
export const archiveBudget = (payload, options) => apiClient.request("budgets.archive", payload, options);
