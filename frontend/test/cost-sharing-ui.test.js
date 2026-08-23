import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("pembagian beban shared dipakai ulang oleh transaksi manual dan pembayaran rutin", async () => {
  const [field, transactionForm, recurringDialogs, recurringActions, recurringPage] = await Promise.all([
    read("features/transactions/CostShareField.jsx"),
    Promise.all([read("features/transactions/TransactionForm.jsx"), read("features/transactions/components/TransactionFields.jsx")]).then((parts) => parts.join("\n")),
    read("features/recurring/RecurringDialogs.jsx"),
    read("features/recurring/useRecurringActions.js"),
    read("features/recurring/RecurringPage.jsx"),
  ]);
  assert.match(field, /Pembagian beban biaya/);
  assert.match(field, /50 : 50/);
  assert.match(field, /Total \{total\}%/);
  assert.match(transactionForm, /CostShareField/);
  assert.match(transactionForm, /source\?\.owner_scope === "shared"/);
  assert.match(recurringDialogs, /CostShareField visible=\{showEnvelope && payment\.item\?\.scope === "shared"\}/);
  assert.match(recurringActions, /cost_share_mode/);
  assert.match(recurringActions, /cost_share_percentages/);
  assert.match(recurringPage, /bootstrap\?\.members/);
});
