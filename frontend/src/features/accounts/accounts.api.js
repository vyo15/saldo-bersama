import { apiClient } from "../../services/api/client.js";

export const createAccount = (payload, options) => apiClient.request("accounts.create", payload, options);
export const updateAccount = (payload, options) => apiClient.request("accounts.update", payload, options);
export const previewAccountLifecycle = (payload, options) => apiClient.request("accounts.previewLifecycle", payload, options);
export const archiveAccount = (payload, options) => apiClient.request("accounts.archive", payload, options);
export const restoreAccount = (payload, options) => apiClient.request("accounts.restore", payload, options);
export const deleteUnusedAccount = (payload, options) => apiClient.request("accounts.deleteUnused", payload, options);
export const createReconciliation = (payload, options) => apiClient.request("reconciliations.create", payload, options);
