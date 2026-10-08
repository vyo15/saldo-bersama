import { apiClient } from "../../services/api/client.js";

export const requestTransferApproval = (payload, options) => apiClient.request("transferRequests.request", payload, options);
export const reviewTransferApproval = (payload, options) => apiClient.request("transferRequests.review", payload, options);
