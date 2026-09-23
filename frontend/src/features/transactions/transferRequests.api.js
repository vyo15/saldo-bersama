import { apiClient } from "../../services/api/client.js";

export const reviewTransferApproval = (payload, options) => apiClient.request("transferRequests.review", payload, options);
