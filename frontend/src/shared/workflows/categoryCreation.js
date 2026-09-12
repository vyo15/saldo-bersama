import { apiClient } from "../../services/api/client.js";

/**
 * Application boundary for creating/requesting a category from another feature.
 * Category feature internals stay encapsulated behind canonical API actions.
 */
export const createSharedCategory = (payload, options) => apiClient.request("categories.create", payload, options);
export const requestSharedCategoryCreation = (payload, options) => apiClient.request("categories.requestCreate", payload, options);
