import { apiClient } from "../../services/api/client.js";

export const runSettingsAction = (action, payload, options) => apiClient.request(action, payload, options);
export const downloadFinanceExcel = () => apiClient.downloadExcel();
export const deactivateUser = (payload, options) => apiClient.request("users.deactivate", payload, options);
export const reactivateUser = (payload, options) => apiClient.request("users.reactivate", payload, options);
export const reopenPeriod = (payload, options) => apiClient.request("periods.reopen", payload, options);
