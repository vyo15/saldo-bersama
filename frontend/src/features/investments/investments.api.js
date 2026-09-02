import { apiClient } from "../../services/api/client.js";

const mutate = (action, payload, rowVersion, options = {}) => apiClient.request(action, payload, { ...options, rowVersion });

export const createInvestmentPortfolio = (payload, options) => apiClient.request("investments.portfolios.create", payload, options);
export const upsertInvestmentInstrument = (payload, rowVersion, options) => mutate("investments.instruments.upsert", payload, rowVersion, options);
export const buyInvestment = (payload, rowVersion, options) => mutate("investments.trades.buy", payload, rowVersion, options);
export const sellInvestment = (payload, rowVersion, options) => mutate("investments.trades.sell", payload, rowVersion, options);
export const updateInvestmentValuation = (payload, rowVersion, options) => mutate("investments.valuations.update", payload, rowVersion, options);
export const reconcileInvestment = (payload, rowVersion, options) => mutate("investments.reconciliations.create", payload, rowVersion, options);
export const correctInvestment = (payload, rowVersion, options) => mutate("investments.corrections.create", payload, rowVersion, options);

export const invalidateInvestmentReads = () => apiClient.invalidate(["investments.overview", "accounts.list", "dashboard.overview", "app.initialState"]);
