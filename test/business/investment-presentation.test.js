import assert from "node:assert/strict";
import test from "node:test";
import { investmentActivityForInstrument, investmentActivityLabel, investmentOpeningPositionPreview, investmentOwnershipLabel, investmentPriceSourceLabel, investmentProfitLossLabel, investmentReturnPercent, investmentTradePreview, selectInvestmentInstruments, validateInvestmentAssetPosition, validateInvestmentOperation } from "../../frontend/src/features/investments/investments.model.js";

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
  assert.deepEqual(selectInvestmentInstruments(instruments, holdings, "unknown"), instruments);
});


test("trade preview hanya menghitung estimasi dari input dan lot size instrumen", () => {
  const form = { instrument_id: "active", lots: "2", price_per_share: "9100", fee_amount: "2500", trade_date: "2026-09-02" };
  const buy = investmentTradePreview("buy", form, [{ ...active, name: "Bank Central Asia", lot_size: 100 }]);
  const sell = investmentTradePreview("sell", form, [{ ...active, name: "Bank Central Asia", lot_size: 100 }]);
  assert.equal(buy.shares, 200);
  assert.equal(buy.grossAmount, 1_820_000);
  assert.equal(buy.rdnAmount, 1_820_000);
  assert.equal(sell.rdnAmount, 1_820_000);
  assert.equal(buy.feeAmount, 0);
  assert.equal(sell.feeAmount, 0);
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


test("presentasi detail holding membedakan ownership, sumber harga, hasil, dan aktivitas saham", () => {
  assert.equal(investmentOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(investmentOwnershipLabel({ owner_scope: "personal", is_owned_by_actor: true }), "Pribadi");
  assert.equal(investmentOwnershipLabel({ owner_scope: "personal", is_owned_by_actor: false }), "Pasangan");
  assert.equal(investmentPriceSourceLabel({ price_source: "valuation" }), "Harga manual terakhir");
  assert.equal(investmentPriceSourceLabel({ price_source: "trade" }), "Harga transaksi terakhir");
  assert.equal(investmentPriceSourceLabel({}), "Harga terakhir dicatat");
  assert.equal(investmentProfitLossLabel(1), "Untung");
  assert.equal(investmentProfitLossLabel(-1), "Rugi");
  assert.equal(investmentProfitLossLabel(0), "Impas");
  assert.equal(investmentActivityLabel({ activity_type: "trade", trade_type: "buy", ticker: "BBCA" }), "Pembelian dicatat · BBCA");
  assert.equal(investmentActivityLabel({ activity_type: "trade", trade_type: "sell", ticker: "BBCA" }), "Penjualan dicatat · BBCA");
  assert.equal(investmentActivityLabel({ activity_type: "valuation", ticker: "BBCA" }), "Harga manual diperbarui · BBCA");
  assert.equal(investmentActivityLabel({ activity_type: "opening_position", instrument_id: "active", ticker: "BBCA" }), "Posisi awal dicatat · BBCA");
  assert.equal(investmentActivityLabel({ activity_type: "correction", instrument_id: "active", ticker: "BBCA" }), "Koreksi dicatat · BBCA");
  assert.equal(investmentActivityLabel({ activity_type: "correction" }), "Koreksi dicatat · Saldo RDN");

  const activity = Array.from({ length: 25 }, (_, index) => ({ instrument_id: index === 24 ? "other" : "active", activity_id: String(index) }));
  const selected = investmentActivityForInstrument(activity, "active");
  assert.equal(selected.length, 20);
  assert.ok(selected.every((item) => item.instrument_id === "active"));
});


test("validasi presentasi Investasi memberi inline error tanpa mengambil alih otoritas backend", () => {
  const portfolio = { holdings: [{ instrument_id: "active", shares: 200, lot_size: 100 }] };
  const options = { instruments: [{ ...active, name: "Bank Central Asia", lot_size: 100 }], portfolio, today: "2026-09-02" };
  const missing = validateInvestmentOperation("buy", { lots: 0, price_per_share: 0, fee_amount: -1, trade_date: "2026-09-03" }, options);
  assert.equal(missing.instrument_id, "Pilih aset yang tersedia.");
  assert.match(missing.lots, /lebih dari 0/);
  assert.match(missing.price_per_share, /lebih dari 0/);
  assert.equal(missing.fee_amount, undefined);
  assert.match(missing.trade_date, /masa depan/);

  const sell = validateInvestmentOperation("sell", { instrument_id: "active", lots: 3, price_per_share: 9000, fee_amount: 0, trade_date: "2026-09-02" }, options);
  assert.match(sell.lots, /Maksimal 2 lot/);
});

test("validasi harga, rekonsiliasi, dan opening position menutup field finansial serta eligibility instrumen", () => {
  const bmri = { instrument_id: "bmri", ticker: "BMRI", status: "active", lot_size: 100 };
  const goto = { instrument_id: "goto", ticker: "GOTO", status: "inactive", lot_size: 100 };
  const portfolio = { holdings: [{ instrument_id: "active", shares: 1_000, lot_size: 100 }, { instrument_id: "goto", shares: 25, lot_size: 100 }] };
  const options = { instruments: [{ ...active, lot_size: 100 }, bmri, goto], portfolio, userRole: "owner", today: "2026-09-02" };

  assert.deepEqual(validateInvestmentOperation("price", {
    instrument_id: "active", price_per_share: 10_000, valuation_date: "2026-09-02",
  }, options), {});
  const priceErrors = validateInvestmentOperation("price", {
    instrument_id: "bmri", price_per_share: 0, valuation_date: "2026-09-03",
  }, options);
  assert.equal(priceErrors.instrument_id, "Pilih saham yang tersedia.");
  assert.match(priceErrors.price_per_share, /lebih dari 0/);
  assert.match(priceErrors.valuation_date, /masa depan/);

  assert.deepEqual(validateInvestmentOperation("reconcile", {
    actual_cash: 0, reconciliation_date: "2026-09-02", "quantity:active": 10, "quantity:bmri": 0, "quantity:goto": 0.25,
  }, options), {});
  const reconcileErrors = validateInvestmentOperation("reconcile", {
    actual_cash: -1, reconciliation_date: "2026-09-03", "quantity:active": -1, "quantity:bmri": 0, "quantity:goto": "invalid",
  }, options);
  assert.match(reconcileErrors.actual_cash, /0 atau lebih/);
  assert.match(reconcileErrors.reconciliation_date, /masa depan/);
  assert.match(reconcileErrors["quantity:active"], /lot aktual tidak valid/);
  assert.match(reconcileErrors["quantity:goto"], /lot aktual tidak valid/);

  assert.deepEqual(validateInvestmentOperation("opening_position", {
    instrument_id: "bmri", opening_quantity: 1, average_price: 10_000, reference_price: 11_000, actual_cash: "", position_date: "2026-09-02", notes: "Posisi awal dari broker",
  }, options), {});
  const openingPreview = investmentOpeningPositionPreview({
    instrument_id: "bmri", opening_quantity: 10, average_price: 8_750, reference_price: 9_400,
  }, options.instruments);
  assert.equal(openingPreview.shares, 1_000);
  assert.equal(openingPreview.costBasis, 8_750_000);
  assert.equal(openingPreview.marketValue, 9_400_000);
  assert.equal(openingPreview.unrealizedPl, 650_000);
  assert.ok(Math.abs(openingPreview.returnPercent - 7.428571428571429) < 1e-9);

  const overflowPreview = investmentOpeningPositionPreview({
    instrument_id: "active",
    opening_quantity: Number.MAX_SAFE_INTEGER,
    average_price: Number.MAX_SAFE_INTEGER,
    reference_price: Number.MAX_SAFE_INTEGER,
  }, [active]);
  assert.equal(overflowPreview.costBasis, 0);
  assert.equal(overflowPreview.marketValue, 0);

  const openingErrors = validateInvestmentOperation("opening_position", {
    instrument_id: "active", opening_quantity: 0, average_price: 0, reference_price: 0, actual_cash: -1, position_date: "2026-09-03", notes: "x".repeat(501),
  }, options);
  assert.equal(openingErrors.instrument_id, "Pilih aset untuk kondisi awal.");
  assert.match(openingErrors.opening_quantity, /lebih dari 0/);
  assert.match(openingErrors.average_price, /lebih dari 0/);
  assert.match(openingErrors.reference_price, /lebih dari 0/);
  assert.match(openingErrors.actual_cash, /0 atau lebih/);
  assert.match(openingErrors.position_date, /masa depan/);
  assert.equal(openingErrors.notes, "Catatan maksimal 500 karakter.");
});

test("validasi koreksi menjaga input konsisten sebelum server melakukan validasi authoritative", () => {
  const base = { instruments: [active], portfolio: { holdings: [] }, userRole: "owner", today: "2026-09-02" };
  const empty = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", share_delta: 0, cost_basis_delta: 0, cash_delta: 0 }, base);
  assert.match(empty._form, /harus mengubah/);

  const mismatch = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", instrument_id: "active", quantity_delta: 1, cost_basis_delta: -1000, cash_delta: 0 }, base);
  assert.match(mismatch.quantity_delta, /searah/);
  assert.match(mismatch.cost_basis_delta, /searah/);

  const member = validateInvestmentOperation("correction", { correction_date: "2026-09-02", reason: "cek selisih", cash_delta: 1 }, { ...base, userRole: "member" });
  assert.match(member._form, /Administrator/);
});

test("validasi posisi aset langsung menjaga jumlah, harga, tanggal, dan batas catatan", () => {
  const instrument = { ...active, name: "Bank Central Asia", lot_size: 100, instrument_type: "stock" };
  assert.deepEqual(validateInvestmentAssetPosition({
    ticker: "BBCA", opening_quantity: 16, average_price: 7114, reference_price: 6425, position_date: "2026-09-02", notes: "",
  }, instrument, { today: "2026-09-02" }), {});

  const errors = validateInvestmentAssetPosition({
    ticker: "", opening_quantity: 0, average_price: 0, reference_price: 0, position_date: "2026-09-03", notes: "x".repeat(501),
  }, instrument, { today: "2026-09-02" });
  assert.match(errors.opening_quantity, /lebih dari 0/);
  assert.match(errors.average_price, /lebih dari 0/);
  assert.match(errors.reference_price, /lebih dari 0/);
  assert.match(errors.position_date, /masa depan/);
  assert.equal(errors.notes, "Catatan maksimal 500 karakter.");
});
