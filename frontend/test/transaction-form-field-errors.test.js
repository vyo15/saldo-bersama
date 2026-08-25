import assert from "node:assert/strict";
import test from "node:test";
import { clearTransactionFieldErrors, transactionErrorKeysForEdit } from "../src/features/transactions/transactionFormFieldErrors.js";

test("edit field transaksi hanya membersihkan error field terkait dan dependency yang menjadi stale", () => {
  const errors = {
    amount: "Nominal wajib diisi",
    source_account_id: "Pilih sumber",
    destination_account_id: "Pilih tujuan",
    category_id: "Pilih kategori",
    envelope_period_id: "Alokasi tidak valid",
    description: "Catatan wajib untuk overspend",
  };

  const categoryEdited = clearTransactionFieldErrors(errors, "category_id");
  assert.equal(categoryEdited.category_id, undefined);
  assert.equal(categoryEdited.envelope_period_id, undefined);
  assert.equal(categoryEdited.amount, errors.amount, "Error field yang tidak terkait tidak boleh hilang hanya karena user mengedit kategori.");

  const sourceEdited = clearTransactionFieldErrors(errors, "source_account_id");
  for (const key of ["source_account_id", "destination_account_id", "envelope_period_id", "description"]) assert.equal(sourceEdited[key], undefined);
  assert.equal(sourceEdited.amount, errors.amount);
  assert.equal(sourceEdited.category_id, errors.category_id);
});

test("edit jenis transaksi dan cost sharing membersihkan error turunan yang relevan", () => {
  assert.deepEqual(transactionErrorKeysForEdit("cost_share_percentages"), ["cost_share_mode", "cost_share_percentages"]);
  const errors = {
    transaction_type: "Jenis invalid",
    source_account_id: "Sumber invalid",
    destination_account_id: "Tujuan invalid",
    category_id: "Kategori invalid",
    envelope_period_id: "Alokasi invalid",
    cost_share_mode: "Mode invalid",
    cost_share_percentages: "Total harus 100%",
    description: "Catatan invalid",
    transaction_date: "Tanggal invalid",
  };
  const next = clearTransactionFieldErrors(errors, "transaction_type");
  assert.equal(next.transaction_date, errors.transaction_date, "Tanggal tetap harus diperbaiki sendiri jika masih invalid.");
  for (const key of ["transaction_type", "source_account_id", "destination_account_id", "category_id", "envelope_period_id", "cost_share_mode", "cost_share_percentages", "description"]) assert.equal(next[key], undefined);
});
