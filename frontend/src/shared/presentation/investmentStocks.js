import antmLogo from "../../assets/investment-stocks/antm.webp";
import asiiLogo from "../../assets/investment-stocks/asii.webp";
import bbcaLogo from "../../assets/investment-stocks/bbca.webp";
import bbriLogo from "../../assets/investment-stocks/bbri.webp";
import bmriLogo from "../../assets/investment-stocks/bmri.webp";
import icbpLogo from "../../assets/investment-stocks/icbp.webp";
import tlkmLogo from "../../assets/investment-stocks/tlkm.webp";

export const INVESTMENT_PROTOTYPE_CATALOG = Object.freeze([
  Object.freeze({ ticker: "BBCA", name: "Bank Central Asia", exchange: "IDX", lot_size: 100, sector: "Bank", logo: bbcaLogo }),
  Object.freeze({ ticker: "BBRI", name: "Bank Rakyat Indonesia", exchange: "IDX", lot_size: 100, sector: "Bank", logo: bbriLogo }),
  Object.freeze({ ticker: "BMRI", name: "Bank Mandiri", exchange: "IDX", lot_size: 100, sector: "Bank", logo: bmriLogo }),
  Object.freeze({ ticker: "TLKM", name: "Telkom Indonesia", exchange: "IDX", lot_size: 100, sector: "Telekom", logo: tlkmLogo }),
  Object.freeze({ ticker: "ASII", name: "Astra International", exchange: "IDX", lot_size: 100, sector: "Konglomerasi", logo: asiiLogo }),
  Object.freeze({ ticker: "ICBP", name: "Indofood CBP Sukses Makmur", exchange: "IDX", lot_size: 100, sector: "Konsumer", logo: icbpLogo }),
  Object.freeze({ ticker: "ANTM", name: "Aneka Tambang", exchange: "IDX", lot_size: 100, sector: "Tambang", logo: antmLogo }),
]);

const STOCK_BY_TICKER = new Map(INVESTMENT_PROTOTYPE_CATALOG.map((item) => [item.ticker, item]));

export const investmentStockByTicker = (ticker) => STOCK_BY_TICKER.get(String(ticker || "").trim().toUpperCase()) || null;
export const investmentStockLogo = (ticker) => investmentStockByTicker(ticker)?.logo || "";
export const investmentStockKeywords = (item = {}) => [item.ticker, item.name, item.exchange, item.sector].filter(Boolean).join(" ");
