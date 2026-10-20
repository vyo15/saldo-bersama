import { apiClient } from "../../services/api/client.js";

export const requestGoalDeletion = (payload, options) => apiClient.request("goalDeletionRequests.request", payload, options);
export const reviewGoalDeletion = (payload, options) => apiClient.request("goalDeletionRequests.review", payload, options);
export const withdrawGoalDeletion = (payload, options) => apiClient.request("goalDeletionRequests.withdraw", payload, options);
