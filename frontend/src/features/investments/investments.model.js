export const selectInvestmentInstruments = (instruments = [], holdings = [], mode = "buy") => {
  const heldIds = new Set(holdings.map((item) => item.instrument_id));
  if (mode === "buy") return instruments.filter((item) => item.status === "active");
  if (mode === "sell") return instruments.filter((item) => heldIds.has(item.instrument_id));
  if (["price", "reconcile"].includes(mode)) return instruments.filter((item) => item.status === "active" || heldIds.has(item.instrument_id));
  return instruments;
};

export const investmentTradePreview = (mode, form = {}, instruments = []) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || 100);
  const lots = Number(form.lots || 0);
  const pricePerShare = Number(form.price_per_share || 0);
  const feeAmount = Number(form.fee_amount || 0);
  const shares = lots * lotSize;
  const grossAmount = shares * pricePerShare;
  const rdnAmount = mode === "sell" ? grossAmount - feeAmount : grossAmount + feeAmount;
  return { instrument, lotSize, lots, shares, pricePerShare, feeAmount, grossAmount, rdnAmount };
};
