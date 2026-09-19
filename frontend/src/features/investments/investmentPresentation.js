export const investmentOwnershipLabel = (portfolio = {}) => {
  if (portfolio.owner_scope !== "personal") return "Bersama";
  return portfolio.is_owned_by_actor ? "Pribadi" : "Pasangan";
};

export const investmentPriceSourceLabel = (holding = {}) => holding.price_source === "valuation"
  ? "Harga manual terakhir"
  : holding.price_source === "trade"
    ? "Harga transaksi terakhir"
    : holding.price_source === "opening_position"
      ? "Harga referensi posisi awal"
      : "Harga terakhir dicatat";

export const investmentProfitLossLabel = (value) => Number(value || 0) > 0
  ? "Untung"
  : Number(value || 0) < 0
    ? "Rugi"
    : "Impas";

export const investmentActivityForInstrument = (activity = [], instrumentId = "") => activity
  .filter((item) => item.instrument_id === instrumentId)
  .slice(0, 20);

export const investmentActivityLabel = (activity = {}) => {
  const ticker = activity.ticker || "saham";
  if (activity.activity_type === "trade") return `${activity.trade_type === "buy" ? "Pembelian dicatat" : "Penjualan dicatat"} · ${ticker}`;
  if (activity.activity_type === "valuation") return `${activity.asset_type === "mutual_fund" ? "Nilai manual diperbarui" : "Harga manual diperbarui"} · ${ticker}`;
  if (activity.activity_type === "opening_position") return activity.instrument_id ? `Posisi awal dicatat · ${ticker}` : "Saldo awal RDN dicatat";
  return `Koreksi dicatat · ${activity.instrument_id ? ticker : "Saldo RDN"}`;
};

export const investmentReturnPercent = (profitLoss, costBasis) => {
  const profit = Number(profitLoss || 0);
  const basis = Number(costBasis || 0);
  if (!Number.isFinite(profit) || !Number.isFinite(basis) || basis <= 0) return null;
  return (profit / basis) * 100;
};
