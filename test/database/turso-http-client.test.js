import assert from "node:assert/strict";
import test from "node:test";
import { TursoHttpClient } from "../../api/_lib/db/httpClient.js";

const result = (cols = [], rows = [], affected = 0) => ({
  type: "ok",
  response: { type: "execute", result: { cols: cols.map((name) => ({ name })), rows, affected_row_count: affected, last_insert_rowid: null, rows_read: rows.length, rows_written: affected, query_duration_ms: 1 } },
});
const close = { type: "ok", response: { type: "close" } };
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) });

test("client Turso memakai pipeline resmi, bearer token, PRAGMA FK, dan typed parameters", async () => {
  const calls = [];
  const client = new TursoHttpClient({
    url: "libsql://saldo-test.turso.io",
    authToken: "secret-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return response({ results: [result(), result(["value", "count"], [[{ type: "text", value: "ok" }, { type: "integer", value: "2" }]], 1), close] });
    },
  });
  const output = await client.execute("SELECT ? AS value, ? AS count", ["ok", 2]);
  assert.equal(calls[0].url, "https://saldo-test.turso.io/v2/pipeline");
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-token");
  assert.equal(calls[0].body.requests[0].stmt.sql, "PRAGMA foreign_keys = ON");
  assert.deepEqual(calls[0].body.requests[1].stmt.args, [{ type: "text", value: "ok" }, { type: "integer", value: "2" }]);
  assert.deepEqual(output.rows, [{ value: "ok", count: 2 }]);
  assert.equal(output.rowsAffected, 1);
});

test("interactive transaction meneruskan baton lalu commit", async () => {
  const bodies = [];
  let call = 0;
  const client = new TursoHttpClient({ url: "https://saldo.turso.io", authToken: "token", fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body); call += 1;
    if (call === 1) return response({ baton: "b1", base_url: "https://primary.turso.io", results: [result(), result()] });
    if (call === 2) return response({ baton: "b2", base_url: "https://primary.turso.io", results: [result(["id"], [[{ type: "text", value: "x" }]], 1)] });
    return response({ results: [result(), close] });
  } });
  const value = await client.transaction(async (tx) => (await tx.one("INSERT INTO test VALUES(?) RETURNING id", ["x"])).id);
  assert.equal(value, "x");
  assert.equal(bodies[1].baton, "b1");
  assert.equal(bodies[2].baton, "b2");
  assert.equal(bodies[2].requests[0].stmt.sql, "COMMIT");
});

test("read transaction memakai BEGIN deferred dan snapshot yang sama sampai commit", async () => {
  const bodies = [];
  let call = 0;
  const client = new TursoHttpClient({ url: "https://saldo.turso.io", authToken: "token", fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body); call += 1;
    if (call === 1) return response({ baton: "read-1", base_url: "https://primary.turso.io", results: [result(), result()] });
    if (call === 2) return response({ baton: "read-2", base_url: "https://primary.turso.io", results: [result(["value"], [[{ type: "integer", value: "7" }]])] });
    return response({ results: [result(), close] });
  } });
  const value = await client.readTransaction(async (tx) => (await tx.one("SELECT 7 AS value")).value);
  assert.equal(value, 7);
  assert.equal(bodies[0].requests[1].stmt.sql, "BEGIN");
  assert.equal(bodies[1].baton, "read-1");
  assert.equal(bodies[2].baton, "read-2");
  assert.equal(bodies[2].requests[0].stmt.sql, "COMMIT");
});


test("interactive transaction memakai base_url pipeline apa adanya dan menserialkan query paralel", async () => {
  const calls = [];
  let call = 0;
  const client = new TursoHttpClient({
    url: "https://saldo.turso.io",
    authToken: "token",
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      call += 1;
      if (call === 1) return response({ baton: "b1", base_url: "https://primary.turso.io/v2/pipeline", results: [result(), result()] });
      if (call === 2) return response({ baton: "b2", base_url: "https://primary.turso.io/v2/pipeline", results: [result(["value"], [[{ type: "integer", value: "1" }]])] });
      if (call === 3) return response({ baton: "b3", base_url: "https://primary.turso.io/v2/pipeline", results: [result(["value"], [[{ type: "integer", value: "2" }]])] });
      return response({ results: [result(), close] });
    },
  });
  const values = await client.readTransaction(async (tx) => Promise.all([
    tx.one("SELECT 1 AS value"),
    tx.one("SELECT 2 AS value"),
  ]));
  assert.deepEqual(values.map((row) => row.value), [1, 2]);
  assert.equal(calls[1].url, "https://primary.turso.io/v2/pipeline");
  assert.equal(calls[2].url, "https://primary.turso.io/v2/pipeline");
  assert.equal(calls[1].body.baton, "b1");
  assert.equal(calls[2].body.baton, "b2");
  assert.equal(calls[3].body.baton, "b3");
});

test("transaction rollback ketika callback gagal dan error database tidak membocorkan query", async () => {
  const bodies = [];
  let call = 0;
  const client = new TursoHttpClient({ url: "turso://saldo.turso.io", authToken: "token", fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body); call += 1;
    if (call === 1) return response({ baton: "b1", results: [result(), result()] });
    return response({ results: [result(), close] });
  } });
  await assert.rejects(client.transaction(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(bodies.at(-1).requests[0].stmt.sql, "ROLLBACK");

  const failing = new TursoHttpClient({ url: "https://saldo.turso.io", authToken: "token", fetchImpl: async () => response({ results: [{ type: "error", error: { message: "secret SELECT token" } }] }) });
  await assert.rejects(failing.execute("SELECT token"), (error) => error.code === "DATABASE_QUERY_FAILED" && error.message === "Operasi database ditolak.");
});


test("pipeline metrics menghitung HTTP pipeline aktual termasuk BEGIN batch dan COMMIT", async () => {
  let call = 0;
  const client = new TursoHttpClient({
    url: "https://saldo.turso.io",
    authToken: "token",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      call += 1;
      if (call === 1) return response({ baton: "m1", base_url: "https://primary.turso.io", results: body.requests.map(() => result()) });
      if (call === 2) return response({ baton: "m2", base_url: "https://primary.turso.io", results: body.requests.map(() => result()) });
      return response({ results: [result(), close] });
    },
  });
  const metrics = { pipelineCount: 0 };
  await client.withPipelineMetrics(metrics, () => client.readTransaction(async (tx) => {
    await tx.batch([
      { sql: "SELECT 1", args: [] },
      { sql: "SELECT 2", args: [] },
      { sql: "SELECT 3", args: [] },
    ]);
  }));
  assert.equal(metrics.pipelineCount, 3, "BEGIN, satu tx.batch, dan COMMIT harus tercatat sebagai tiga pipeline HTTP");
});
test("health melakukan query terautentikasi, bukan mengandalkan endpoint publik", async () => {
  const client = new TursoHttpClient({ url: "https://saldo.turso.io", authToken: "token", fetchImpl: async () => response({ results: [result(), result(["ok"], [[{ type: "integer", value: "1" }]]), close] }) });
  assert.equal(await client.health(), true);
});
