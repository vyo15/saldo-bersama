/** Display-side investment preview: mirrors the server fee and cent-rounding contract. */
export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = Number(form.fee_amount || 0);
  const shares = lots * lotSize;
  // Match the server's cents x hundredths -> Rupiah round-half-up contract.
  const unitHundredths = Math.round(shares * 100);
  const priceCents = Math.round(pricePerShare * 100);
  const safeInputs = Number.isSafeInteger(unitHundredths) && Number.isSafeInteger(priceCents) && unitHundredths >= 0 && priceCents >= 0;
  const grossAmount = safeInputs ? Number((BigInt(unitHundredths) * BigInt(priceCents) + 5000n) / 10000n) : NaN;
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
