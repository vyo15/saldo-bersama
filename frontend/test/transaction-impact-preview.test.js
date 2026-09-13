import assert from "node:assert/strict";
import test from "node:test";
import { transactionImpact } from "../src/features/transactions/transactionImpact.js";

const operating = (id, balance, available = balance) => ({
  account_id: id,
  name: id,
  account_type: "checking",
  can_transact: true,
  balance,
  available_balance: available,
});

const baseForm = (overrides = {}) => ({
  transaction_type: "expense",
  transaction_date: "2026-09-13",
  amount: "100000",
  source_account_id: "bank",
  destination_account_id: "",
  category_id: "cat",
  envelope_period_id: "",
  budget_id: "",
  ...overrides,
});

test("impact expense membedakan dana yang sudah disiapkan dan pengeluaran belum dialokasikan", () => {
  const accountBalances = [operating("bank", 1_000_000, 500_000)];
  const envelopes = [{ envelope_period_id: "env", name: "Rumah", remaining_amount: 300_000 }];
  const budgets = [{ budget_id: "need", name: "Listrik", amount: 300_000, used_amount: 0 }];
  const allocated = transactionImpact({
    accountBalances, envelopes, budgets, safeToSpend: 500_000,
    form: baseForm({ envelope_period_id: "env", budget_id: "need" }),
  });
  assert.equal(allocated.safeToSpendAfter, 500_000);
  assert.equal(allocated.sourceAfter, 900_000);
  assert.equal(allocated.sourceAvailableAfter, 500_000);
  assert.equal(allocated.budgetRemainingAfter, 200_000);

  const unallocated = transactionImpact({ accountBalances, envelopes, budgets, safeToSpend: 500_000, form: baseForm() });
  assert.equal(unallocated.safeToSpendAfter, 400_000);
  assert.equal(unallocated.sourceAvailableAfter, 400_000);
});

test("impact transfer menjaga Dana Tersedia antar rekening operasional dan menguranginya saat masuk RDN", () => {
  const accountBalances = [
    operating("bank", 1_000_000, 800_000),
    operating("bank2", 500_000, 500_000),
    { account_id: "rdn", name: "RDN", account_type: "investment", can_transact: true, balance: 200_000, available_balance: 200_000 },
  ];
  const common = { accountBalances, envelopes: [], budgets: [], safeToSpend: 1_300_000 };
  const operational = transactionImpact({ ...common, form: baseForm({ transaction_type: "transfer", category_id: "", destination_account_id: "bank2" }) });
  assert.equal(operational.safeToSpendAfter, 1_300_000);
  const investment = transactionImpact({ ...common, form: baseForm({ transaction_type: "transfer", category_id: "", destination_account_id: "rdn" }) });
  assert.equal(investment.safeToSpendAfter, 1_200_000);
});

test("impact edit menghitung delta terhadap transaksi lama, bukan mendebit nominal baru dua kali", () => {
  const accountBalances = [operating("bank", 900_000, 500_000)];
  const envelopes = [{ envelope_period_id: "env", name: "Rumah", remaining_amount: 400_000 }];
  const budgets = [{ budget_id: "need", name: "Listrik", amount: 500_000, used_amount: 100_000 }];
  const transaction = {
    transaction_type: "expense",
    amount: 100_000,
    source_account_id: "bank",
    destination_account_id: "",
    envelope_period_id: "env",
    budget_id: "need",
  };
  const impact = transactionImpact({
    accountBalances, envelopes, budgets, safeToSpend: 500_000, transaction,
    form: baseForm({ amount: "120000", envelope_period_id: "env", budget_id: "need" }),
  });
  assert.equal(impact.sourceAfter, 880_000);
  assert.equal(impact.sourceAfter - accountBalances[0].balance, -20_000);
  assert.equal(impact.sourceAvailableAfter, 500_000);
  assert.equal(impact.budgetRemainingBefore, 400_000);
  assert.equal(impact.budgetRemainingAfter, 380_000);
  assert.equal(impact.safeToSpendAfter, 500_000);
});
