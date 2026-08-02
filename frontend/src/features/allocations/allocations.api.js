import { apiClient } from "../../services/api/client.js";

export const createEnvelope = (payload, options) => apiClient.request("envelopes.create", payload, options);
export const closeEnvelope = (payload, options) => apiClient.request("envelopes.close", payload, options);
export const moveEnvelope = (payload, options) => apiClient.request("envelopes.move", payload, options);
