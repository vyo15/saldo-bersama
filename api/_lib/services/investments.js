// Stable investment-service facade. Implementation is grouped by state/read, setup, trading, and correction responsibilities.
export { listInvestmentInstruments, investmentOverview } from "./investments/investmentQueries.js";
export { createInvestmentPortfolio, upsertInvestmentInstrument, createInvestmentAssetPosition } from "./investments/investmentSetup.js";
export { buyInvestment, sellInvestment, updateInvestmentValuation, reconcileInvestment } from "./investments/investmentTrading.js";
export { createOpeningPosition, correctInvestment } from "./investments/investmentCorrections.js";
export { holdingStateFromEvents as investmentHoldingStateFromEvents } from "./investments/investmentState.js";
