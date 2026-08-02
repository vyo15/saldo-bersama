import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addDays, dateValue, positiveInteger, safeSpreadsheetText, scopeFromAccountPair, strictBoolean } from "../../api/_lib/services/core.js";
import { firstNegativeBalance, transactionImpact } from "../../api/_lib/services/readModels.js";
import { assertAffectedBalances } from "../../api/_lib/services/finance.js";
import { integrityIssues } from "../../api/_lib/services/reports.js";

const active = (values) => ({ status: "active", amount: 100_000, source_account_id: null, destination_account_id: null, ...values });

test("saldo rekening mengikuti income, expense, transfer, refund, adjustment, dan status aktif", () => {
  assert.equal(transactionImpact("a", active({ transaction_type: "income", destination_account_id: "a" })), 100_000);
  assert.equal(transactionImpact("a", active({ transaction_type: "refund", destination_account_id: "a" })), 100_000);
  assert.equal(transactionImpact("a", active({ transaction_type: "expense", source_account_id: "a" })), -100_000);
  assert.equal(transactionImpact("a", active({ transaction_type: "transfer", source_account_id: "a", destination_account_id: "b" })), -100_000);
  assert.equal(transactionImpact("b", active({ transaction_type: "transfer", source_account_id: "a", destination_account_id: "b" })), 100_000);
  assert.equal(transactionImpact("a", active({ transaction_type: "adjustment", source_account_id: "a" })), 100_000);
  assert.equal(transactionImpact("a", { ...active({ transaction_type: "expense", source_account_id: "a" }), status: "cancelled" }), 0);
});


test("menghapus pemasukan lama terdeteksi bila membuat saldo historis negatif", async () => {
  const account = { account_id: "a", initial_balance: 0, initial_balance_date: "2026-01-01", allow_negative: 0 };
  const rows = [
    active({ transaction_id: "income", transaction_date: "2026-01-01", created_at: "2026-01-01T01:00:00Z", transaction_type: "income", destination_account_id: "a" }),
    active({ transaction_id: "expense", transaction_date: "2026-01-02", created_at: "2026-01-02T01:00:00Z", transaction_type: "expense", source_account_id: "a" }),
  ];
  const db = { all: async (_sql, args) => rows.filter((row) => row.transaction_id !== args.at(-1)) };
  const issue = await firstNegativeBalance(db, account, { excludeTransactionId: "income", fromDate: "2026-01-01" });
  assert.deepEqual(issue, { date: "2026-01-02", balance: -100_000 });
});

test("saldo minus sementara pada hari yang sama tetap terdeteksi berdasarkan urutan transaksi", async () => {
  const account = { account_id: "a", initial_balance: 0, initial_balance_date: "2026-01-01", allow_negative: 0 };
  const rows = [
    active({ transaction_id: "expense", transaction_date: "2026-01-02", created_at: "2026-01-02T01:00:00Z", transaction_type: "expense", source_account_id: "a" }),
    active({ transaction_id: "income", transaction_date: "2026-01-02", created_at: "2026-01-02T02:00:00Z", transaction_type: "income", destination_account_id: "a" }),
  ];
  const db = { all: async () => rows };
  const issue = await firstNegativeBalance(db, account, { fromDate: "2026-01-01" });
  assert.deepEqual(issue, { date: "2026-01-02", balance: -100_000 });
});

test("edit transaksi mempertahankan urutan created_at lama saat memproyeksikan saldo", async () => {
  const account = { account_id: "a", initial_balance: 0, initial_balance_date: "2026-01-01", allow_negative: 0 };
  const current = active({ transaction_id: "current", transaction_date: "2026-01-02", created_at: "2026-01-02T01:00:00Z", transaction_type: "income", destination_account_id: "a" });
  const candidate = active({ transaction_id: "current", transaction_date: "2026-01-02", transaction_type: "expense", source_account_id: "a", destination_account_id: null });
  const laterIncome = active({ transaction_id: "later", transaction_date: "2026-01-02", created_at: "2026-01-02T02:00:00Z", transaction_type: "income", destination_account_id: "a" });
  const db = {
    one: async () => account,
    all: async () => [laterIncome],
  };
  await assert.rejects(assertAffectedBalances(db, current, candidate), (error) => error.code === "INSUFFICIENT_BALANCE" && error.details?.offendingDate === "2026-01-02");
});

test("integrity check melaporkan histori negatif pada rekening yang melarang saldo minus", async () => {
  const account = { account_id: "a", initial_balance: 0, initial_balance_date: "2026-01-01", allow_negative: 0 };
  const expense = active({ transaction_id: "expense", transaction_date: "2026-01-02", created_at: "2026-01-02T01:00:00Z", transaction_type: "expense", source_account_id: "a" });
  const db = {
    all: async (sql) => {
      if (sql.startsWith("PRAGMA")) return [];
      if (sql.includes("SELECT * FROM accounts WHERE allow_negative=0")) return [account];
      if (sql.includes("FROM transactions") && sql.includes("source_account_id=?")) return [expense];
      return [];
    },
  };
  assert.deepEqual(await integrityIssues(db), [{ code: "NEGATIVE_BALANCE", accountId: "a", date: "2026-01-02", balance: -100_000 }]);
});

test("nominal, boolean, tanggal, dan formula injection divalidasi ketat", () => {
  assert.equal(positiveInteger("10000"), 10000);
  assert.throws(() => positiveInteger(10.5), (error) => error.code === "INVALID_AMOUNT");
  assert.throws(() => positiveInteger(0), (error) => error.code === "INVALID_AMOUNT");
  assert.equal(strictBoolean(true), true);
  assert.throws(() => strictBoolean("true"), (error) => error.code === "INVALID_BOOLEAN");
  assert.equal(dateValue("2026-02-28"), "2026-02-28");
  assert.throws(() => dateValue("2026-02-30"), (error) => error.code === "INVALID_DATE");
  assert.equal(addDays("2026-08-01", 1), "2026-08-02");
  assert.equal(safeSpreadsheetText("=SUM(A1:A2)"), "'=SUM(A1:A2)");
});

test("transfer tidak boleh melintasi kepemilikan shared/personal atau pemilik berbeda", () => {
  assert.deepEqual(scopeFromAccountPair({ owner_scope: "shared", owner_user_id: null }, { owner_scope: "shared", owner_user_id: null }), { scope: "shared", owner_user_id: null });
  assert.deepEqual(scopeFromAccountPair({ owner_scope: "personal", owner_user_id: "u1" }, { owner_scope: "personal", owner_user_id: "u1" }), { scope: "personal", owner_user_id: "u1" });
  assert.throws(() => scopeFromAccountPair({ owner_scope: "shared" }, { owner_scope: "personal", owner_user_id: "u1" }), (error) => error.code === "CROSS_OWNERSHIP_TRANSFER");
  assert.throws(() => scopeFromAccountPair({ owner_scope: "personal", owner_user_id: "u1" }, { owner_scope: "personal", owner_user_id: "u2" }), (error) => error.code === "CROSS_OWNERSHIP_TRANSFER");
});

test("service menjaga budget exact-scope, recurring due-day, optimistic version, dan soft cancel", async () => {
  const [planning, finance, readModels] = await Promise.all([
    readFile(new URL("../../api/_lib/services/planning.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/services/finance.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/services/readModels.js", import.meta.url), "utf8"),
  ]);
  assert.match(planning, /dueDayValue[\s\S]*parsed < 1 \|\| parsed > 31/);
  assert.match(planning, /b\.scope='shared' AND t\.scope='shared'[\s\S]*b\.scope='personal' AND t\.scope='personal'[\s\S]*t\.owner_user_id=b\.owner_user_id/);
  assert.match(finance, /WHERE transaction_id=\? AND row_version=\?/);
  assert.match(finance, /rowsAffected !== 1/);
  assert.match(finance, /status='cancelled'/);
  assert.match(finance, /assertAffectedBalances\(db, current, normalized\)/);
  assert.match(finance, /assertAffectedBalances\(db, transaction, null\)/);
  assert.match(finance, /new Set\(\["expense", "refund"\]\)/);
  assert.doesNotMatch(finance, /DELETE FROM transactions/i);
  assert.match(readModels, /transaction_type = 'transfer'[\s\S]*source_account_id[\s\S]*destination_account_id/);
  assert.match(planning, /assertVersion\(from,payload\.from_row_version\)/);
  assert.match(planning, /assertVersion\(to,payload\.to_row_version\)/);
  assert.match(planning, /contribution:"deposit",withdraw:"withdrawal"/);
  assert.match(planning, /Member hanya dapat membatalkan pembayaran rutin yang dibuat sendiri/);
  assert.match(planning, /Member hanya dapat membatalkan mutasi target yang dibuat sendiri/);
  const masterData = await readFile(new URL("../../api/_lib/services/masterData.js", import.meta.url), "utf8");
  assert.match(masterData, /"ewallet"[\s\S]*"emergency_fund"[\s\S]*"sinking_fund"/);
  assert.match(masterData, /"unexpected"[\s\S]*"discretionary"[\s\S]*"emergency"/);
  assert.match(masterData, /NEGATIVE_INITIAL_BALANCE_NOT_ALLOWED/);
  assert.match(masterData, /ACCOUNT_HAS_NEGATIVE_HISTORY/);
  assert.match(masterData, /ACCOUNT_NON_ZERO_BALANCE/);
  assert.match(masterData, /account_id<>\?/);
  assert.match(planning, /removeUnpaidFutureOccurrences/);
  assert.match(planning, /actual_amount=0[\s\S]*transaction_ids_json='\[\]'/);
});
