import { apiClient } from "../../services/api/client.js";

export const createCategory = (payload, options) => apiClient.request("categories.create", payload, options);
export const updateCategory = (payload, options) => apiClient.request("categories.update", payload, options);
export const previewCategoryArchive = (payload, options) => apiClient.request("categories.previewArchive", payload, options);
export const deleteUnusedCategory = (payload, options) => apiClient.request("categories.deleteUnused", payload, options);
export const archiveCategory = (payload, options) => apiClient.request("categories.archive", payload, options);
