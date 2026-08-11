import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { addDays, dateValue, positiveInteger, safeSpreadsheetText, scopeFromAccountPair, strictBoolean } from "../../api/_lib/services/core.js";
import { accountBalanceAsOf, firstNegativeBalance, transactionImpact, visibleAccounts } from "../../api/_lib/services/readModels.js";
import { assertAffectedBalances } from "../../api/_lib/services/finance.js";
import { integrityIssues } from "../../api/_lib/services/reporting/index.js";
import { listRecurring } from "../../api/_lib/services/planning/recurring.js";
import { listEnvelopes } from "../../api/_lib/services/planning/envelopes.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

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

test("saldo agregat visibleAccounts selalu parity dengan accountBalanceAsOf", async () => {
  const db = await createSqliteTestDatabase();
  const actor = { user_id: "owner-parity", role: "owner" };
  const timestamp = "2026-01-01T00:00:00.000Z";
  try {
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [actor.user_id, "firebase-owner-parity", "owner-parity@example.com", "Owner Parity", "owner", "active", 1, timestamp, timestamp],
    );
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["a", "Kas A", "cash", "shared", null, 1_000, "2026-01-01", 0, "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["b", "Kas B", "cash", "shared", null, 500, "2026-01-03", 0, "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["income", "Gaji", "income", "fixed", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["expense", "Belanja", "expense", "variable", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["refund", "Refund", "refund", "variable", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );

    const insertTransaction = (row) => db.execute(
      `INSERT INTO transactions(
        transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,amount,
        scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,
        cancelled_by,cancelled_at,cancellation_reason
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.transaction_id, row.transaction_date, row.transaction_type, row.source_account_id ?? null,
        row.destination_account_id ?? null, row.category_id ?? null, row.amount, "shared", null, row.status ?? "active", 1,
        `parity:${row.transaction_id}`, actor.user_id, `${row.transaction_date}T01:00:00.000Z`, actor.user_id,
        `${row.transaction_date}T01:00:00.000Z`, row.cancelled_by ?? null, row.cancelled_at ?? null,
        row.cancellation_reason ?? "",
      ],
    );

    await insertTransaction({ transaction_id: "income-a", transaction_date: "2026-01-01", transaction_type: "income", destination_account_id: "a", category_id: "income", amount: 200 });
    await insertTransaction({ transaction_id: "income-b-before-initial", transaction_date: "2026-01-02", transaction_type: "income", destination_account_id: "b", category_id: "income", amount: 77 });
    await insertTransaction({ transaction_id: "expense-a", transaction_date: "2026-01-02", transaction_type: "expense", source_account_id: "a", category_id: "expense", amount: 50 });
    await insertTransaction({ transaction_id: "transfer-a-b", transaction_date: "2026-01-03", transaction_type: "transfer", source_account_id: "a", destination_account_id: "b", amount: 100 });
    await insertTransaction({ transaction_id: "refund-a", transaction_date: "2026-01-04", transaction_type: "refund", destination_account_id: "a", category_id: "refund", amount: 30 });
    await insertTransaction({ transaction_id: "adjustment-b", transaction_date: "2026-01-05", transaction_type: "adjustment", source_account_id: "b", amount: 40 });
    await insertTransaction({ transaction_id: "archived-expense", transaction_date: "2026-01-06", transaction_type: "expense", source_account_id: "a", category_id: "expense", amount: 999, status: "archived" });
    await insertTransaction({
      transaction_id: "cancelled-income", transaction_date: "2026-01-06", transaction_type: "income", destination_account_id: "b",
      category_id: "income", amount: 999, status: "cancelled", cancelled_by: actor.user_id,
      cancelled_at: "2026-01-06T02:00:00.000Z", cancellation_reason: "Fixture parity",
    });

    for (const cutoffDate of ["2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"]) {
      const accounts = await visibleAccounts(db, actor, { includeArchived: true, cutoffDate });
      for (const account of accounts) {
        assert.equal(
          account.balance,
          await accountBalanceAsOf(db, account, cutoffDate),
          `saldo ${account.account_id} harus parity pada cutoff ${cutoffDate}`,
        );
      }
    }
  } finally {
    db.close();
  }
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
  const planningDirectory = new URL("../../api/_lib/services/planning/", import.meta.url);
  const planningFiles = (await readdir(planningDirectory)).filter((name) => name.endsWith(".js")).sort();
  const [planningParts, finance, readModels] = await Promise.all([
    Promise.all(planningFiles.map((name) => readFile(new URL(name, planningDirectory), "utf8"))),
    readFile(new URL("../../api/_lib/services/finance.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/services/readModels.js", import.meta.url), "utf8"),
  ]);
  const planning = planningParts.join("\n");
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
  assert.match(planning, /assertVersion\(from,\s*payload\.from_row_version\)/);
  assert.match(planning, /assertVersion\(to,\s*payload\.to_row_version\)/);
  assert.match(planning, /contribution:\s*"deposit"[\s\S]*withdraw:\s*"withdrawal"/);
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


test("recurring list memisahkan snapshot occurrence dari nilai master rule untuk editor", async () => {
  let query = "";
  const db = {
    all: async (sql) => {
      query = sql;
      return [{
        occurrence_id: "occ-feb", recurring_rule_id: "rule-31", period_key: "2026-02", due_date: "2026-02-28",
        expected_amount: 300_000, actual_amount: 0, status: "expected", transaction_ids_json: "[]", row_version: 2,
        created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
        name: "Internet", kind: "expense", category_id: "cat-home", rule_expected_amount: 350_000, frequency: "monthly",
        rule_due_day: 31, default_account_id: "account-1", payment_method: "transfer", auto_debit: 0, start_date: "2026-01-31",
        end_date: null, priority: "normal", rule_status: "active", rule_row_version: 7, scope: "shared", owner_user_id: null,
      }];
    },
  };
  const result = await listRecurring(db, { actor: { role: "owner", user_id: "owner-1" }, payload: { period: "2026-02" } });
  assert.match(query, /r\.expected_amount AS rule_expected_amount/);
  assert.match(query, /r\.due_day AS rule_due_day/);
  assert.equal(result.items[0].due_date, "2026-02-28", "occurrence Februari tetap memakai tanggal snapshot yang di-clamp");
  assert.equal(result.items[0].expected_amount, 300_000, "nominal occurrence historis tidak boleh ditimpa master");
  assert.equal(result.items[0].rule_due_day, 31, "editor harus menerima due_day master asli");
  assert.equal(result.items[0].rule_expected_amount, 350_000, "editor harus menerima nominal master terbaru");
});


test("envelopes.list menghormati filter periode agar dashboard dan recurring tidak mencampur kantong periode lain", async () => {
  const db = await createSqliteTestDatabase();
  const actor = { user_id: "owner-envelope-period", role: "owner", email: "owner-envelope-period@example.com" };
  const timestamp = "2026-08-01T00:00:00.000Z";
  try {
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [actor.user_id, "firebase-owner-envelope-period", actor.email, "Owner Envelope", "owner", "active", 1, timestamp, timestamp],
    );
    for (const [suffix, start, end] of [["aug", "2026-08-01", "2026-08-31"], ["sep", "2026-09-01", "2026-09-30"]]) {
      await db.execute(
        "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [`rule-${suffix}`, `Kantong ${suffix}`, "monthly", "shared", null, 100_000, null, "unallocated", "confirm", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
      );
      await db.execute(
        "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [`period-${suffix}`, `rule-${suffix}`, `Kantong ${suffix}`, start, end, 100_000, 0, "active", 1, actor.user_id, timestamp, actor.user_id, timestamp, null, null],
      );
    }

    const august = await listEnvelopes(db, { actor, payload: { period: "2026-08" } });
    assert.deepEqual(august.items.map((item) => item.envelope_period_id), ["period-aug"]);
    const september = await listEnvelopes(db, { actor, payload: { period: "2026-09" } });
    assert.deepEqual(september.items.map((item) => item.envelope_period_id), ["period-sep"]);
    const all = await listEnvelopes(db, { actor, payload: {} });
    assert.deepEqual(all.items.map((item) => item.envelope_period_id).sort(), ["period-aug", "period-sep"]);
  } finally {
    db.close();
  }
});
