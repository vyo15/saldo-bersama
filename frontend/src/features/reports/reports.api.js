import { apiClient } from "../../services/api/client.js";

export const downloadFinancialReport = (options) => apiClient.downloadReport(options);
