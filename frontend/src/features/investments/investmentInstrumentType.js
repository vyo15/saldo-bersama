const MUTUAL_FUND_TICKERS = new Set(["IHAJJ", "CAPFIX"]);

export const isMutualFundInstrument = (instrument = {}) => {
  const ticker = String(instrument.ticker || "").trim().toUpperCase();
  return instrument.asset_type === "mutual_fund"
    || String(instrument.exchange || "").trim().toUpperCase() === "REKSADANA"
    || MUTUAL_FUND_TICKERS.has(ticker);
};

