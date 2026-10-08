import { isMutualFundInstrument } from "./investmentInstrumentType.js";

const safeIntegerProduct = (left, right) => {
  const product = Number(left) * Number(right);
  if (!Number.isFinite(product) || product < 0 || product > Number.MAX_SAFE_INTEGER) return 0;
  const rounded = Math.round(product);
  return Number.isSafeInteger(rounded) ? rounded : 0;
};

export const investmentOpeningPositionPreview = (form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || {});
  const quantity = Number(form.opening_quantity || 0);
  const lotSize = Number(instrument?.lot_size || (mutualFund ? 1 : 100));
  const shares = mutualFund ? quantity : quantity * lotSize;
  const averagePrice = Number(form.average_price || 0);
  const currentPrice = Number(form.reference_price || 0);
  const costBasis = form.cost_basis !== undefined && String(form.cost_basis).trim() !== ""
    ? Number(form.cost_basis) : safeIntegerProduct(shares, averagePrice);
  const marketValue = form.market_value !== undefined && String(form.market_value).trim() !== ""
    ? Number(form.market_value) : safeIntegerProduct(shares, currentPrice);
  const unrealizedPl = marketValue - costBasis;
  const returnPercent = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : null;
  return { instrument, mutualFund, quantity, lotSize, shares, averagePrice, currentPrice, costBasis, marketValue, unrealizedPl, returnPercent };
};

