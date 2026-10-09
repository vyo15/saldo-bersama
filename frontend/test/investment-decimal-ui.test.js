import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { formatInvestmentDecimal, investmentDecimalCaret, parseInvestmentDecimal } from "../src/features/investments/investmentDecimalInput.js";

const file = (name) => readFile(new URL(`../src/features/investments/${name}`, import.meta.url), "utf8");

test("NAB dan unit investasi memakai pemisah Indonesia tanpa mengubah nilai canonical", () => {
  for (const [value, display] of [
    ["", ""], ["0.01", "0,01"], ["5021", "5.021"],
    ["5021.00", "5.021,00"], ["5021.50", "5.021,50"], ["1200000.5", "1.200.000,5"],
    ["12.", "12,"], ["0", "0"],
  ]) {
    assert.equal(formatInvestmentDecimal(value), display);
    assert.equal(parseInvestmentDecimal(display), value, `Round-trip ${display}`);
  }
  assert.equal(parseInvestmentDecimal("Rp 5.021,50"), "5021.50");
  assert.equal(parseInvestmentDecimal("0,01"), "0.01");
  assert.equal(parseInvestmentDecimal("5.021,00"), "5021.00");
  assert.equal(parseInvestmentDecimal(""), "");
});

test("input desimal tidak boleh mengubah jumlah secara diam-diam", () => {
  for (const input of ["1,234", "1,,00", "-1", "1e3", "Rp xx", "1+2"]) {
    assert.equal(parseInvestmentDecimal(input), null, input);
  }
  assert.equal(parseInvestmentDecimal("12,0"), "12.0");
  assert.equal(parseInvestmentDecimal("12345"), "12345");
  assert.equal(investmentDecimalCaret("1234", "1.234"), 5);
  assert.equal(investmentDecimalCaret("1.23", "123"), 3);
});

test("setup, transaksi, dan valuasi memakai adapter locale bersama tanpa mengubah payload", async () => {
  const [setup, trade, valuation, input] = await Promise.all([
    file("InvestmentSetupDialog.jsx"), file("InvestmentDialog.jsx"),
    file("InvestmentValuationDialog.jsx"), file("InvestmentDecimalInput.jsx"),
  ]);
  for (const source of [setup, trade, valuation]) assert.match(source, /InvestmentDecimalInput/);
  assert.match(setup, /purchase_price: Number\(form\.average_price\)/);
  assert.match(trade, /price_per_share: Number\(form\.price_per_share\)/);
  assert.match(trade, /fee_amount: Number\(form\.fee_amount \|\| 0\)/);
  assert.match(trade, /Biaya broker \(opsional\)/);
  assert.match(valuation, /price_per_share: Number\(prices\[key\]\)/);
  assert.match(input, /type="text" inputMode="decimal"/);
  assert.match(input, /setSelectionRange/);
  assert.doesNotMatch(input, /toFixed\(|Math\.round\(/);
});
