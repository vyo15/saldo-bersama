import { apiClient } from "../../services/api/client.js";

export const createCommitment = (payload, options) => apiClient.request("commitments.create", payload, options);
export const updateCommitment = (payload, options) => apiClient.request("commitments.update", payload, options);
export const archiveCommitment = (payload, options) => apiClient.request("commitments.archive", payload, options);
export const recordCommitmentReceipt = (payload, options) => apiClient.request("commitments.recordReceipt", payload, options);
