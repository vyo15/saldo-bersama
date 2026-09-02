import assert from "node:assert/strict";
import test from "node:test";
import { investmentReturnPercent, investmentTradePreview, selectInvestmentInstruments, validateInvestmentOperation, validateInvestmentSetup } from "../../frontend/src/features/investments/investments.model.js";

const active = { instrument_id: "active", ticker: "BBCA", status: "active" };
const inactiveHeld = { instrument_id: "inactive-held", ticker: "OLD", status: "inactive" };
const inactiveUnused = { instrument_id: "inactive-unused", ticker: "OLD2", status: "inactive" };
const instruments = [active, inactiveHeld, inactiveUnused];
const holdings = [{ instrument_id: "inactive-held", shares: 100 }];

test("investment instrument options tidak menutup capability sell/reconcile untuk holding inactive", () => {
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "buy").map((item) => item.instrument_id), ["active"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "sell").map((item) => item.instrument_id), ["inactive-held"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "price").map((item) => item.instrument_id), ["inactive-held"]);
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "reconcile").map((item) => item.instrument_id), ["active", "inactive-held"]);
  const oddLotHolding = [{ instrument_id: "inactive-held", shares: 50, lot_size: 100 }];
  assert.deepEqual(selectInvestmentInstruments(instruments, oddLotHolding, "sell"), []);
  assert.deepEqual(selectInvestmentInstruments(instruments, oddLotHolding, "price").map((item) => item.instrument_id), ["inactive-held"]);
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


test("persentase return investasi hanya diturunkan dari P/L dan cost basis yang valid", () => {
  assert.equal(investmentReturnPercent(500_000, 5_000_000), 10);
  assert.equal(investmentReturnPercent(-250_000, 5_000_000), -5);
  assert.equal(investmentReturnPercent(0, 5_000_000), 0);
  assert.equal(investmentReturnPercent(500_000, 0), null);
  assert.equal(investmentReturnPercent(500_000, -1), null);
  assert.equal(investmentReturnPercent("invalid", 5_000_000), null);
});


test("validasi presentasi Investasi memberi inline error tanpa mengambil alih otoritas backend", () => {
  const portfolio = { holdings: [{ instrument_id: "active", shares: 200, lot_size: 100 }] };
  const options = { instruments: [{ ...active, name: "Bank Central Asia", lot_size: 100 }], portfolio, today: "2026-09-02" };
  const missing = validateInvestmentOperation("buy", { lots: 0, price_per_share: 0, fee_amount: -1, trade_date: "2026-09-03" }, options);
  assert.equal(missing.instrument_id, "Pilih saham yang tersedia.");
  assert.match(missing.lots, /lebih dari 0/);
  assert.match(missing.price_per_share, /lebih dari 0/);
  assert.match(missing.fee_amount, /0 atau lebih/);
  assert.match(missing.trade_date, /masa depan/);

  const sell = validateInvestmentOperation("sell", { instrument_id: "active", lots: 3, price_per_share: 9000, fee_amount: 0, trade_date: "2026-09-02" }, options);
  assert.match(sell.lots, /Maksimal 2 lot/);
});

test("validasi koreksi menjaga input konsisten sebelum server melakukan validasi authoritative", () => {
  const base = { instruments: [active], portfolio: { holdings: [] }, userRole: "owner", today: "2026-09-02" };
  const empty = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", share_delta: 0, cost_basis_delta: 0, cash_delta: 0 }, base);
  assert.match(empty._form, /harus mengubah/);

  const mismatch = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", instrument_id: "active", share_delta: 100, cost_basis_delta: -1000, cash_delta: 0 }, base);
  assert.match(mismatch.share_delta, /searah/);
  assert.match(mismatch.cost_basis_delta, /searah/);

  const member = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", cash_delta: 1 }, { ...base, userRole: "member" });
  assert.match(member._form, /Administrator/);
});

test("validasi setup Investasi mencegah dead-end RDN dan input instrumen invalid", () => {
  const noRdn = validateInvestmentSetup("portfolio", { broker: "ajaib", name: "Ajaib", rdn_account_id: "" }, []);
  assert.match(noRdn.rdn_account_id, /Buat rekening jenis Investasi/);
  const instrument = validateInvestmentSetup("instrument", { ticker: "bb ca", exchange: "I", instrument_name: "", lot_size: 0 }, []);
  assert.ok(instrument.ticker);
  assert.ok(instrument.exchange);
  assert.ok(instrument.instrument_name);
  assert.ok(instrument.lot_size);
});
