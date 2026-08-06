import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8");

test("form transaksi tidak menduplikasi pilihan jenis dan menandai kategori wajib sesuai validator", async () => {
  const text = await source();
  const expenseOptions = text.match(/\[TRANSACTION_TYPES\.EXPENSE, "Pengeluaran"\]/g) || [];
  assert.equal(expenseOptions.length, 1);
  assert.match(text, /!\[TRANSACTION_TYPES\.TRANSFER, TRANSACTION_TYPES\.ADJUSTMENT\]\.includes\(form\.transaction_type\)/);
  assert.match(text, /form\.transaction_type === "refund" && item\.transaction_type === "expense"/);
});

test("metode pembayaran tidak diasumsikan ketika detail tambahan belum dipilih", async () => {
  const text = await source();
  assert.match(text, /payment_method: ""/);
  assert.match(text, /<option value="">Belum dipilih<\/option>/);
  assert.doesNotMatch(text, /payment_method: "transfer"/);
  assert.match(text, /accountDisplayLabel/);
  assert.equal((text.match(/accountDisplayLabel\(item, \{ includeOwner: false \}\)/g) || []).length, 2, "Rekening sumber dan tujuan harus memakai label tanpa suffix pemilik.");
});
