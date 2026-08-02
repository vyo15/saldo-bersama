import { apiClient } from "../../services/api/client.js";

export const createAccount = (payload, options) => apiClient.request("accounts.create", payload, options);
export const updateAccount = (payload, options) => apiClient.request("accounts.update", payload, options);
export const archiveAccount = (payload, options) => apiClient.request("accounts.archive", payload, options);
export const createCategory = (payload, options) => apiClient.request("categories.create", payload, options);
export const updateCategory = (payload, options) => apiClient.request("categories.update", payload, options);
export const archiveCategory = (payload, options) => apiClient.request("categories.archive", payload, options);
export const createReconciliation = (payload, options) => apiClient.request("reconciliations.create", payload, options);
