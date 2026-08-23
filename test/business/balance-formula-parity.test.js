import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BALANCE_SOURCES = Object.freeze([
  "../../api/_lib/services/readModels.js",
  "../../api/_lib/services/masterData/accounts.js",
  "../../api/_lib/services/notifications/actionable.js",
  "../../api/_lib/services/maintenance/resetModel.js",
  "../../api/_lib/services/reporting/dashboard/readModel.js",
  "../../api/_lib/services/reporting/integrity.js",
]);

const readBalanceSources = () => Promise.all(BALANCE_SOURCES.map(async (relative) => ({
  relative,
  source: await readFile(new URL(relative, import.meta.url), "utf8"),
})));

const normalized = (source) => source.replace(/\s+/g, " ");

test("semua query saldo canonical mempertahankan dampak income/refund, expense, transfer, dan adjustment", async () => {
  for (const { relative, source } of await readBalanceSources()) {
    const text = normalized(source);
    assert.match(text, /transaction_type IN \('income','refund'\).*destination_account_id.*THEN t\.amount/, `${relative} harus menambah income/refund ke rekening tujuan`);
    assert.match(text, /transaction_type\s*=\s*'expense'.*source_account_id\s*=\s*a\.account_id\s*THEN -t\.amount/, `${relative} harus mengurangi expense dari rekening sumber`);
    assert.match(text, /transaction_type\s*=\s*'transfer'.*source_account_id\s*=\s*a\.account_id\s*THEN -t\.amount/, `${relative} harus mengurangi transfer dari rekening sumber`);
    assert.match(text, /transaction_type\s*=\s*'transfer'.*destination_account_id\s*=\s*a\.account_id\s*THEN t\.amount/, `${relative} harus menambah transfer ke rekening tujuan`);
    assert.match(text, /transaction_type\s*=\s*'adjustment'.*source_account_id\s*=\s*a\.account_id\s*THEN t\.amount/, `${relative} harus menerapkan adjustment pada rekening sumber`);
  }
});

test("query saldo hanya menghitung transaksi aktif dan menghormati initial_balance_date", async () => {
  for (const { relative, source } of await readBalanceSources()) {
    assert.match(source, /status\s*=\s*'active'|status='active'/, `${relative} harus memfilter transaksi aktif`);
    assert.match(source, /initial_balance_date/, `${relative} harus mempertahankan batas tanggal saldo awal`);
  }
});
