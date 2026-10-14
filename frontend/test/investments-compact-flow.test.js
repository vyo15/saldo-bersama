import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { investmentOpeningPositionPreview } from "../src/features/investments/investmentOpeningPositionPreview.js";
import { investmentSellQuickQuantity, investmentTradeImpact, rupiahFromInvestmentUnits } from "../src/features/investments/investmentTradePreview.js";
import { validateInvestmentAssetPurchase } from "../src/features/investments/investments.model.js";

const fund = { instrument_id: "fund", ticker: "IHAJJ", exchange: "REKSADANA", lot_size: 1 };
const stock = { instrument_id: "stock", ticker: "BBCA", exchange: "IDX", lot_size: 100 };

test("setup dan pembelian awal membulatkan setengah Rupiah ke atas sesuai backend", () => {
  assert.equal(rupiahFromInvestmentUnits(.58, 25), 15);
  assert.equal(rupiahFromInvestmentUnits(977.56, 5_696.59), 5_568_759);
  assert.equal(investmentOpeningPositionPreview({ instrument_id: "fund", opening_quantity: ".58", average_price: "25", reference_price: "25" }, [fund]).costBasis, 15);
  assert.deepEqual(validateInvestmentAssetPurchase({ ticker: "IHAJJ", opening_quantity: ".58", average_price: "25", position_date: "2026-10-13", rdn_account_id: "rdn", fee_amount: "" }, fund, [{ account_id: "rdn", account_type: "investment", status: "active" }], { today: "2026-10-13" }), {});
  assert.equal(rupiahFromInvestmentUnits(1e20, 99), Number.NaN); // invalid-safe inputs
});

test("preview posisi lama memakai pembulatan otomatis atau override broker tanpa transaksi RDN", () => {
  const input = { instrument_id: "fund", opening_quantity: "977.56", average_price: "5639.27", reference_price: "5696.59" };
  const automatic = investmentOpeningPositionPreview(input, [fund]);
  assert.equal(automatic.shares, 977.56);
  assert.equal(automatic.marketValue, 5_568_759);
  const broker = investmentOpeningPositionPreview({ ...input, cost_basis: "5512754", market_value: "5568784" }, [fund]);
  assert.equal(broker.marketValue, 5_568_784);
  assert.equal(broker.costBasis, 5_512_754);
  assert.equal(broker.unrealizedPl, 56_030);
  assert.equal(broker.shares, automatic.shares);
  assert.equal(broker.averagePrice, automatic.averagePrice);
  assert.equal(broker.currentPrice, automatic.currentPrice);
  assert.equal(investmentOpeningPositionPreview({ ...input, cost_basis: "", market_value: "" }, [fund]).marketValue, automatic.marketValue);
});

test("jual semua tidak mencampurkan saham bebas dengan saham dua Target", () => {
  const holding = { shares: 1000, unallocated_shares: 300, goal_allocations: [{ goal_id: "g1", shares: 200 }, { goal_id: "g2", shares: 500 }], ticker: "BBCA", lot_size: 100 };
  assert.equal(investmentSellQuickQuantity(holding, stock, "", 1), 3);
  assert.equal(investmentSellQuickQuantity(holding, stock, "g1", 1), 2);
  assert.equal(investmentSellQuickQuantity(holding, stock, "g2", 1), 5);
  assert.equal(investmentSellQuickQuantity(holding, stock, "", .5), 1);
  assert.equal(investmentSellQuickQuantity(holding, stock, "unknown", 1), 0);
});

test("shortcut reksa dana membatasi dua desimal dan menggunakan sumber alokasi", () => {
  const holding = { shares: 2.58, unallocated_shares: .58, goal_allocations: [{ goal_id: "goal", shares: 2 }], exchange: "REKSADANA" };
  assert.equal(investmentSellQuickQuantity(holding, fund, "", 1), .58);
  assert.equal(investmentSellQuickQuantity(holding, fund, "", .5), .29);
  assert.equal(investmentSellQuickQuantity(holding, fund, "goal", 1), 2);
});

test("review penjualan menampilkan sisa kepemilikan, modal dilepas, laba dan RDN", () => {
  const portfolio = { rdn_cash: 100_000, holdings: [{ instrument_id: "stock", shares: 500, cost_basis: 4_000_000 }] };
  const sale = investmentTradeImpact("sell", { instrument_id: "stock", lots: 2, price_per_share: 10_000, fee_amount: 2000 }, [stock], portfolio);
  assert.equal(sale.remainingShares, 300);
  assert.equal(sale.releasedCost, 1_600_000);
  assert.equal(sale.realizedPl, 398_000);
  assert.equal(sale.afterCash, 2_098_000);
  const buy = investmentTradeImpact("buy", { instrument_id: "stock", lots: 1, price_per_share: 10_000, fee_amount: 1000 }, [stock], portfolio);
  assert.equal(buy.afterCash, -901_000);
  assert.equal(buy.remainingShares, 600);
});

test("navigasi dan opsi broker dibangun sebagai progresif, bukan dua lapis filter", async () => {
  const root = new URL("../src/features/investments/", import.meta.url);
  const [overview, setup, dialog] = await Promise.all(["InvestmentOverview.jsx", "InvestmentSetupDialog.jsx", "InvestmentDialog.jsx"].map((file) => readFile(new URL(file, root), "utf8")));
  assert.match(overview, /value: "activity", label: "Riwayat"/);
  assert.match(overview, /assetGroupTitle/);
  assert.doesNotMatch(overview, /QuickSegmentedFilter/);
  assert.match(setup, /Sesuaikan dengan angka broker/);
  assert.match(dialog, /Jual semua tersedia/);
  assert.match(dialog, /investmentTradeImpact/);
});
