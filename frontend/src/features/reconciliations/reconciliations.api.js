import { apiClient, isOutcomeUnknownError } from "../../services/api/client.js";

export const createReconciliation = (payload, options) => apiClient.request("reconciliations.create", payload, options);

export const diagnoseReconciliation = (reconciliationId, options) => apiClient.request("reconciliations.diagnose", { reconciliation_id: reconciliationId }, options);

export const isReconciliationOutcomeUnknownError = (error) => isOutcomeUnknownError(error);
