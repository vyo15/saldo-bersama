import { apiClient } from "../../services/api/client.js";

export const createTransaction = (payload, options) => apiClient.request("transactions.create", payload, options);
export const updateTransaction = (payload, options) => apiClient.request("transactions.update", payload, options);
export const cancelTransaction = (payload, options) => apiClient.request("transactions.cancel", payload, options);
export const restoreTransaction = (payload, options) => apiClient.request("transactions.restore", payload, options);
