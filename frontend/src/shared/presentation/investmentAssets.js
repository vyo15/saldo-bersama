import capfixLogo from "../../assets/investment-funds/capfix.webp";
import ihajjLogo from "../../assets/investment-funds/ihajj.webp";
import {
  INVESTMENT_PROTOTYPE_CATALOG,
  investmentStockByTicker,
  investmentStockKeywords,
} from "./investmentStocks.js";

export const MUTUAL_FUND_EXCHANGE = "REKSADANA";

export const INVESTMENT_MUTUAL_FUND_CATALOG = Object.freeze([
  Object.freeze({
    ticker: "IHAJJ",
    name: "Reksa Dana Haji Syariah",
    exchange: MUTUAL_FUND_EXCHANGE,
    lot_size: 1,
    category: "Syariah",
    asset_type: "mutual_fund",
    logo: ihajjLogo,
  }),
  Object.freeze({
    ticker: "CAPFIX",
    name: "Capital Fixed Income Fund",
    exchange: MUTUAL_FUND_EXCHANGE,
    lot_size: 1,
    category: "Pendapatan Tetap",
    asset_type: "mutual_fund",
    logo: capfixLogo,
  }),
]);

const MUTUAL_FUND_BY_TICKER = new Map(INVESTMENT_MUTUAL_FUND_CATALOG.map((item) => [item.ticker, item]));

export const investmentMutualFundByTicker = (ticker) => MUTUAL_FUND_BY_TICKER.get(String(ticker || "").trim().toUpperCase()) || null;

export const investmentAssetByTicker = (ticker) => investmentMutualFundByTicker(ticker) || investmentStockByTicker(ticker);

export const investmentAssetLogo = (ticker) => investmentAssetByTicker(ticker)?.logo || "";

export const investmentAssetKeywords = (item = {}) => {
  if (item.asset_type === "mutual_fund" || item.exchange === MUTUAL_FUND_EXCHANGE) {
    return [item.ticker, item.name, item.exchange, item.category, "reksa dana", "mutual fund"].filter(Boolean).join(" ");
  }
  return investmentStockKeywords(item);
};

export const isMutualFundInstrument = (instrument = {}) => {
  const ticker = String(instrument.ticker || "").trim().toUpperCase();
  return instrument.asset_type === "mutual_fund"
    || String(instrument.exchange || "").trim().toUpperCase() === MUTUAL_FUND_EXCHANGE
    || Boolean(investmentMutualFundByTicker(ticker));
};

