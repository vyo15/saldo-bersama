import assert from "node:assert/strict";
import test from "node:test";
import { investmentTradePreview, selectInvestmentInstruments } from "../../frontend/src/features/investments/investments.model.js";

const active = { instrument_id: "active", ticker: "BBCA", status: "active" };
const inactiveHeld = { instrument_id: "inactive-held", ticker: "OLD", status: "inactive" };
const inactiveUnused = { instrument_id: "inactive-unused", ticker: "OLD2", status: "inactive" };
const instruments = [active, inactiveHeld, inactiveUnused];
const holdings = [{ instrument_id: "inactive-held", shares: 100 }];

test("investment instrument options tidak menutup capability sell/reconcile untuk holding inactive", () => {
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "buy").map((item) => item.instrument_id), ["active"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "sell").map((item) => item.instrument_id), ["inactive-held"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "price").map((item) => item.instrument_id), ["active", "inactive-held"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "reconcile").map((item) => item.instrument_id), ["active", "inactive-held"]);
});


test("trade preview hanya menghitung estimasi dari input dan lot size instrumen", () => {
  const form = { instrument_id: "active", lots: "2", price_per_share: "9100", fee_amount: "2500", trade_date: "2026-09-02" };
  const buy = investmentTradePreview("buy", form, [{ ...active, name: "Bank Central Asia", lot_size: 100 }]);
  const sell = investmentTradePreview("sell", form, [{ ...active, name: "Bank Central Asia", lot_size: 100 }]);
  assert.equal(buy.shares, 200);
  assert.equal(buy.grossAmount, 1_820_000);
  assert.equal(buy.rdnAmount, 1_822_500);
  assert.equal(sell.rdnAmount, 1_817_500);
  assert.equal(buy.instrument.ticker, "BBCA");
});
