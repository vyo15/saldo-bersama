import { apiClient } from "../../services/api/client.js";

export const createEnvelope = (payload, options) => apiClient.request("envelopes.create", payload, options);
export const adjustEnvelopeAllocation = (payload, options) => apiClient.request("envelopes.adjustAllocation", payload, options);
export const closeEnvelope = (payload, options) => apiClient.request("envelopes.close", payload, options);
export const moveEnvelope = (payload, options) => apiClient.request("envelopes.move", payload, options);
export const previewEnvelopeRuleLifecycle = (payload, options) => apiClient.request("envelopes.previewRuleLifecycle", payload, options);
export const archiveEnvelopeRule = (payload, options) => apiClient.request("envelopes.archiveRule", payload, options);
export const deleteUnusedEnvelopeRule = (payload, options) => apiClient.request("envelopes.deleteUnusedRule", payload, options);
export const reverseEnvelopeMovement = (payload, options) => apiClient.request("envelopes.reverseMovement", payload, options);
