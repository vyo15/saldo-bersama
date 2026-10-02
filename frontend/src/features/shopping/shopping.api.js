import { apiClient } from "../../services/api/client.js";

export const getShoppingSuggestions = (payload, options) => apiClient.request("shopping.suggestions", payload, options);
export const createShoppingList = (payload, options) => apiClient.request("shopping.create", payload, options);
export const createShoppingItem = (payload, options) => apiClient.request("shopping.itemCreate", payload, options);
export const updateShoppingItem = (payload, options) => apiClient.request("shopping.itemUpdate", payload, options);
export const setShoppingItemState = (payload, options) => apiClient.request("shopping.itemState", payload, options);
export const removeShoppingItem = (payload, options) => apiClient.request("shopping.itemRemove", payload, options);
export const checkoutShoppingList = (payload, options) => apiClient.request("shopping.checkout", payload, options);
export const invalidateShopping = () => apiClient.invalidate(["shopping.detail", "shopping.suggestions", "shopping.byTransaction", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
