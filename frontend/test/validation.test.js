import test from "node:test";
import assert from "node:assert/strict";
import { neutralizeSpreadsheetFormula } from "../src/domain/security.js";
import { validateTransactionInput } from "../src/domain/validation.js";
import { formatDateLongIndonesia } from "../src/domain/dates.js";

 test("formula injection dinetralkan", () => {
  assert.equal(neutralizeSpreadsheetFormula("=IMPORTXML(...)"), "'=IMPORTXML(...)");
  assert.equal(neutralizeSpreadsheetFormula("Makan siang"), "Makan siang");
});

test("transfer ke rekening yang sama ditolak", () => {
  const result = validateTransactionInput({
    transaction_type: "transfer",
    transaction_date: "2026-07-26",
    source_account_id: "a1",
    destination_account_id: "a1",
    amount: 100000,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.destination_account_id);
});

test("refund hanya membutuhkan rekening tujuan", () => {
  const result = validateTransactionInput({
    transaction_type: "refund",
    transaction_date: "2026-07-27",
    amount: 50000,
    source_account_id: "",
    destination_account_id: "acc-bank",
    category_id: "cat-expense",
    description: "Refund",
    merchant: "Toko",
  });
  assert.equal(result.ok, true);
});

test("refund tetap membutuhkan kategori", () => {
  const result = validateTransactionInput({
    transaction_type: "refund",
    transaction_date: "2026-07-27",
    amount: 50000,
    destination_account_id: "acc-bank",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.category_id);
});

test("validator hanya meneruskan field transaksi yang boleh dikirim client", () => {
  const result = validateTransactionInput({
    transaction_type: "expense",
    transaction_date: "2026-07-27",
    amount: 50000,
    source_account_id: "acc-bank",
    category_id: "cat-expense",
    description: "Belanja",
    scope: "personal",
    owner_user_id: "other-user",
    goal_id: "goal-forged",
    status: "cancelled",
  });
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.value, "scope"), false);
  assert.equal(Object.hasOwn(result.value, "owner_user_id"), false);
  assert.equal(Object.hasOwn(result.value, "goal_id"), false);
  assert.equal(Object.hasOwn(result.value, "status"), false);
});

test("tanggal kalender yang tidak nyata ditolak", () => {
  const result = validateTransactionInput({
    transaction_type: "expense",
    transaction_date: "2026-02-31",
    amount: 50000,
    source_account_id: "acc-bank",
    destination_account_id: "",
    category_id: "cat-expense",
    description: "Tanggal salah",
    merchant: "",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.transaction_date);
});


test("helper tanggal Indonesia menolak tanggal semu", () => {
  assert.equal(formatDateLongIndonesia("2026-07-31"), "31 Juli 2026");
  assert.equal(formatDateLongIndonesia("2026-02-31"), "");
});
