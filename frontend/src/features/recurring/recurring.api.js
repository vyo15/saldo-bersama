import { apiClient } from "../../services/api/client.js";

export const createRecurringRule = (payload, options) => apiClient.request("recurring.createRule", payload, options);
export const updateRecurringRule = (payload, options) => apiClient.request("recurring.updateRule", payload, options);
export const cancelRecurringOccurrence = (payload, options) => apiClient.request("recurring.cancelOccurrence", payload, options);
export const restoreRecurringOccurrence = (payload, options) => apiClient.request("recurring.restoreOccurrence", payload, options);
export const payRecurringOccurrence = (payload, options) => apiClient.request("recurring.payOccurrence", payload, options);
export const reverseRecurringPayment = (payload, options) => apiClient.request("recurring.reversePayment", payload, options);

export const previewRecurringRuleLifecycle = (payload, options) => apiClient.request("recurring.previewRuleLifecycle", payload, options);
export const archiveRecurringRule = (payload, options) => apiClient.request("recurring.archiveRule", payload, options);
export const deleteUnusedRecurringRule = (payload, options) => apiClient.request("recurring.deleteUnusedRule", payload, options);
export const restoreRecurringRule = (payload, options) => apiClient.request("recurring.restoreRule", payload, options);
