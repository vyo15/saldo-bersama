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
