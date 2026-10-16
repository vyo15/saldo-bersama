import { apiClient } from "./api/client.js";

export const setItemVisibility = (entityKind, entityId, hidden) => apiClient.request("visibility.set", {
  entity_kind: entityKind, entity_id: entityId, hidden,
});
