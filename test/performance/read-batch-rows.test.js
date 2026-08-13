import assert from "node:assert/strict";
import test from "node:test";
import { readBatchRows } from "../../api/_lib/db/readBatchRows.js";

const statements = Object.freeze([
  { sql: "SELECT ? AS value", args: [1] },
  { sql: "SELECT 2 AS value" },
]);

test("readBatchRows memakai satu db.batch dan menormalkan rows kosong", async () => {
  let calls = 0;
  const db = {
    async batch(received) {
      calls += 1;
      assert.equal(received, statements);
      return [{ rows: [{ value: 1 }] }, {}];
    },
  };

  assert.deepEqual(await readBatchRows(db, statements), [[{ value: 1 }], []]);
  assert.equal(calls, 1);
});

test("readBatchRows mempertahankan fallback db.all dan default args kosong", async () => {
  const calls = [];
  const db = {
    async all(sql, args) {
      calls.push({ sql, args });
      return [{ sql, args }];
    },
  };

  assert.deepEqual(await readBatchRows(db, statements), [
    [{ sql: "SELECT ? AS value", args: [1] }],
    [{ sql: "SELECT 2 AS value", args: [] }],
  ]);
  assert.deepEqual(calls, [
    { sql: "SELECT ? AS value", args: [1] },
    { sql: "SELECT 2 AS value", args: [] },
  ]);
});
