import { apiClient, isOutcomeUnknownError } from "../../services/api/client.js";

export const createWishlist = (payload) => apiClient.request("wishlist.create", payload);
export const updateWishlist = (payload) => apiClient.request("wishlist.update", payload, { rowVersion: payload.row_version });
export const changeWishlistState = (payload) => apiClient.request("wishlist.state", payload, { rowVersion: payload.row_version });
export const purchaseWishlist = (payload) => apiClient.request("wishlist.purchase", payload, { rowVersion: payload.row_version });
export const reopenWishlist = (payload) => apiClient.request("wishlist.reopen", payload, { rowVersion: payload.row_version });
export const invalidateWishlist = () => apiClient.invalidate(["wishlist.list", "transactions.list", "accounts.list", "dashboard.overview", "reports.monthly", "app.initialState"]);
export { isOutcomeUnknownError };
