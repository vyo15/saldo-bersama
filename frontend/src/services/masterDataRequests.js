import { apiClient } from "./api/client.js";

export const reviewMasterDataRequest = (payload, options = {}) => apiClient.request("masterDataRequests.review", payload, options);
export const withdrawMasterDataRequest = (payload, options = {}) => apiClient.request("masterDataRequests.withdraw", payload, options);
