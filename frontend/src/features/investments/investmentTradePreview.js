import { isMutualFundInstrument } from "./investmentInstrumentType.js";

/** Keep half-Rupiah rounding identical to the backend integer cents contract. */
export const rupiahFromInvestmentUnits = (units, price) => {
  const quantityHundredths = Math.round(Number(units) * 100);
  const priceCents = Math.round(Number(price) * 100);
  if (!Number.isSafeInteger(quantityHundredths) || !Number.isSafeInteger(priceCents) || quantityHundredths < 0 || priceCents < 0) return NaN;
  const rounded = (BigInt(quantityHundredths) * BigInt(priceCents) + 5000n) / 10000n;
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : NaN;
};

/** Display-side investment preview: mirrors the server fee and cent-rounding contract. */
export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = Number(form.fee_amount || 0);
  const shares = lots * lotSize;
  const grossAmount = rupiahFromInvestmentUnits(shares, pricePerShare);
  const rdnAmount = mode === "sell" ? grossAmount - feeAmount : grossAmount + feeAmount;
  return { instrument, lotSize, lots, shares, pricePerShare, feeAmount, grossAmount, rdnAmount };
};

export const investmentProjectedAverage = (form = {}, instruments = [], portfolio = {}) => {
  const preview = investmentTradePreview("buy", form, instruments);
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === preview.instrument?.instrument_id) || null;
  const currentShares = Number(holding?.shares || 0);
  const currentCostBasis = Number(holding?.cost_basis || 0);
  const currentAverage = currentShares > 0 ? currentCostBasis / currentShares : 0;
  const nextShares = currentShares + Number(preview.shares || 0);
  const nextCostBasis = currentCostBasis + Number(preview.rdnAmount || 0);
  const nextAverage = nextShares > 0 ? nextCostBasis / nextShares : 0;
  return { currentAverage, nextAverage, currentShares, nextShares, holding, ...preview };
};

/** Quantity from selected source only: never bundle units owned by multiple Targets. */
export const investmentSellQuickQuantity = (holding = {}, instrument = {}, goalId = "", fraction = 1) => {
  const allocation = (holding.goal_allocations || []).find((entry) => entry.goal_id === goalId);
  const available = goalId ? Number(allocation?.shares || 0) : Number(holding.unallocated_shares ?? holding.shares ?? 0);
  const isFund = isMutualFundInstrument(instrument) || isMutualFundInstrument(holding);
  if (!Number.isFinite(available) || available <= 0) return 0;
  if (isFund) return Math.floor(Math.round(available * 100) * fraction) / 100;
  const lotSize = Number(instrument.lot_size || holding.lot_size || 100);
  return Math.floor(available / lotSize * fraction);
};

const releasedCostForSale = (mode, holding, beforeShares, soldShares) => {
  if (mode !== "sell" || !holding || beforeShares <= 0 || soldShares <= 0 || soldShares > beforeShares) return 0;
  if (soldShares === beforeShares) return Number(holding.cost_basis || 0);
  return Number(BigInt(Math.round(Number(holding.cost_basis || 0))) * BigInt(Math.round(soldShares * 100)) / BigInt(Math.round(beforeShares * 100)));
};

export const investmentTradeImpact = (mode, form, instruments, portfolio) => {
  const preview = investmentTradePreview(mode, form, instruments);
  const holding = (portfolio?.holdings || []).find((item) => item.instrument_id === form.instrument_id) || null;
  const beforeShares = Number(holding?.shares || 0);
  const beforeCash = Number(portfolio?.rdn_cash || 0);
  const cashChanges = !Number(portfolio?.is_system_hidden || 0);
  const remainingShares = mode === "sell" ? Math.max(0, Math.round((beforeShares - preview.shares) * 100) / 100) : beforeShares + preview.shares;
  const releasedCost = releasedCostForSale(mode, holding, beforeShares, preview.shares);
  return { ...preview, remainingShares, beforeCash, afterCash: cashChanges ? beforeCash + (mode === "sell" ? preview.rdnAmount : -preview.rdnAmount) : null, releasedCost, realizedPl: preview.rdnAmount - releasedCost, cashChanges };
};
