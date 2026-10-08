import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { investmentOverview } from "../../api/_lib/services/investments.js";
import { validateInvestmentAssetPurchase } from "../../frontend/src/features/investments/investments.model.js";

const NOW = "2026-10-08T07:00:00.000Z";
const TODAY = "2026-10-08";
const actor = { user_id: "owner", email: "owner@example.com", role: "owner" };
const member = { user_id: "member", email: "member@example.com", role: "member" };

const seed = async ({ balance = 20_000_000, shared = true } = {}) => {
  const db = await createSqliteTestDatabase();
  for (const user of [actor, member]) await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, `uid-${user.user_id}`, user.email, user.user_id, user.role, "active", 1, NOW, NOW]);
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["rdn1", "RDN Ajaib", "investment", shared ? "shared" : "personal", shared ? null : actor.user_id, balance, "2026-01-01", 0, "active", 1, actor.user_id, NOW, actor.user_id, NOW]);
  return db;
};

const submit = (db, payload, suffix = "first:12345678", who = actor) => dispatchAction({
  signedActor: { uid: `uid-${who.user_id}`, email: who.email, role: who.role },
  action: "investments.assets.recordPurchase", payload: { rdn_account_id: "rdn1", position_date: TODAY, ...payload },
  requestId: suffix, idempotencyKey: suffix, database: db,
});

const stock = { ticker: "BBCA", name: "Bank Central Asia", exchange: "IDX", lot_size: 100, purchase_quantity: 2, purchase_price: 6150, fee_amount: 3000 };
const fund = { ticker: "IHAJJ", name: "Reksa Dana Haji Syariah", exchange: "REKSADANA", lot_size: 1, purchase_quantity: 977.56, purchase_price: 5696.59 };
const count = async (db, table) => Number((await db.one(`SELECT COUNT(*) AS count FROM ${table}`)).count);

test("pembelian pertama mencatat trade, memotong RDN sekali dan retry idempotent", async () => {
  const db = await seed();
  try {
    const result = await submit(db, stock);
    assert.equal(result.trade_type, "buy");
    assert.equal(result.cash_effect_enabled, 1);
    assert.equal(result.cash_amount, 1_233_000);
    assert.equal(await count(db, "investment_portfolios"), 1);
    assert.equal(await count(db, "investment_trades"), 1);
    const state = await investmentOverview(db, { actor });
    assert.equal(state.portfolios[0].holdings[0].shares, 200);
    assert.equal(state.portfolios[0].rdn_cash, 18_767_000);
    const repeated = await submit(db, stock);
    assert.equal(repeated.trade_id, result.trade_id);
    assert.equal(await count(db, "investment_trades"), 1);
  } finally { db.close(); }
});

test("pembelian reksa dana pertama mempertahankan unit pecahan dan NAB dua desimal", async () => {
  const db = await seed();
  try {
    const result = await submit(db, fund, "fund:12345678");
    const stored = await db.one("SELECT unit_quantity_hundredths,price_cents FROM investment_trades WHERE trade_id=?", [result.trade_id]);
    assert.deepEqual({ ...stored }, { unit_quantity_hundredths: 97756, price_cents: 569659 });
    const state = await investmentOverview(db, { actor });
    assert.equal(state.portfolios[0].holdings[0].shares, 977.56);
    assert.equal(state.portfolios[0].holdings[0].price_per_share, 5696.59);
    assert.equal(state.portfolios[0].rdn_cash, 20_000_000 - result.cash_amount);
  } finally { db.close(); }
});

test("RDN kurang tidak membuat aset palsu, trade, ataupun portfolio kosong", async () => {
  const db = await seed({ balance: 1000 });
  try {
    await assert.rejects(() => submit(db, stock), (error) => error.code === "INSUFFICIENT_RDN_CASH");
    for (const table of ["investment_instruments", "investment_portfolios", "investment_trades"]) assert.equal(await count(db, table), 0);
  } finally { db.close(); }
});

test("Member yang berhak dapat mencatat pembelian pertama di RDN bersama dengan instrumen terdaftar", async () => {
  const db = await seed();
  try {
    await db.execute(`INSERT INTO investment_instruments(instrument_id,ticker,name,exchange,lot_size,status,row_version,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ["stock-bbca", "BBCA", "Bank Central Asia", "IDX", 100, "active", 1, actor.user_id, NOW, actor.user_id, NOW]);
    const result = await submit(db, stock, "member-purchase:12345678", member);
    assert.equal(result.trade_type, "buy");
    assert.equal(result.cash_effect_enabled, 1);
    assert.equal((await investmentOverview(db, { actor })).portfolios[0].rdn_cash, 18_767_000);
  } finally { db.close(); }
});

test("pembelian aset yang sama berikutnya tidak membuat rekening atau portfolio tambahan", async () => {
  const db = await seed();
  try {
    await submit(db, stock, "first-share:12345678");
    await submit(db, stock, "second-share:12345678");
    assert.equal(await count(db, "investment_portfolios"), 1);
    assert.equal(await count(db, "investment_trades"), 2);
    assert.equal((await investmentOverview(db, { actor })).portfolios[0].holdings[0].shares, 400);
  } finally { db.close(); }
});

test("pemakaian rekening RDN tersembunyi atau milik pasangan ditolak oleh backend", async () => {
  const db = await seed({ shared: false });
  try {
    await assert.rejects(() => submit(db, stock, "forbidden:12345678", member), (error) => [403, 404].includes(error.status));
    await db.execute("UPDATE accounts SET is_system_hidden=1 WHERE account_id='rdn1'");
    await assert.rejects(() => submit(db, stock, "hidden:12345678"), (error) => error.code === "RDN_ACCOUNT_NOT_FOUND");
    assert.equal(await count(db, "investment_trades"), 0);
  } finally { db.close(); }
});

test("goal invalid rollback aset, portfolio dan saldo dalam satu action", async () => {
  const db = await seed();
  try {
    await assert.rejects(() => submit(db, { ...stock, goal_id: "target-tidak-ada" }, "goal-invalid:12345678"));
    for (const table of ["investment_instruments", "investment_portfolios", "investment_trades"]) assert.equal(await count(db, table), 0);
  } finally { db.close(); }
});

test("form menolak saldo RDN yang tidak dipilih dan presisi reksa dana berlebihan", () => {
  const account = { account_id: "rdn1", account_type: "investment", status: "active" };
  const asset = { ticker: "IHAJJ", exchange: "REKSADANA", lot_size: 1 };
  const form = { ticker: "IHAJJ", opening_quantity: "977.56", average_price: "5696.59", position_date: TODAY, rdn_account_id: "rdn1" };
  assert.deepEqual(validateInvestmentAssetPurchase(form, asset, [account], { today: TODAY }), {});
  assert.ok(validateInvestmentAssetPurchase({ ...form, rdn_account_id: "" }, asset, [account], { today: TODAY }).rdn_account_id);
  assert.ok(validateInvestmentAssetPurchase({ ...form, average_price: "5696.597" }, asset, [account], { today: TODAY }).average_price);
  assert.ok(validateInvestmentAssetPurchase(form, asset, [account], { today: TODAY, goalId: "target" }).opening_quantity);
});
