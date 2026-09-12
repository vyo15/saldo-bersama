import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ACTION_POLICIES } from "../../api/_lib/actions/policy.js";
import {
  ACTION_SYNC_DEPENDENCIES,
  bumpSyncRevisions,
  presentSyncRevisionRows,
  readSyncState,
  syncDependenciesForAction,
} from "../../api/_lib/syncRevisions.js";

test("setiap mutation public memiliki dependency realtime canonical", () => {
  const mutationActions = Object.entries(ACTION_POLICIES)
    .filter(([, policy]) => policy.mode !== "read")
    .map(([action]) => action)
    .sort();
  assert.deepEqual(Object.keys(ACTION_SYNC_DEPENDENCIES).sort(), mutationActions);
  const readable = new Set(Object.entries(ACTION_POLICIES).filter(([, policy]) => policy.mode === "read").map(([action]) => action));
  for (const action of mutationActions) {
    const dependencies = syncDependenciesForAction(action);
    assert.ok(dependencies.length > 0, `${action} wajib mengubah minimal satu read revision`);
    for (const resource of dependencies) assert.equal(readable.has(resource), true, `${action} -> ${resource} harus read action canonical`);
  }
});

test("revision global dan resource naik atomik pada storage sync", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE sync_revisions(resource TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL) STRICT");
  const db = {
    all: async (sql, args = []) => raw.prepare(sql).all(...args),
    execute: async (sql, args = []) => {
      const result = raw.prepare(sql).run(...args);
      return { rowsAffected: Number(result.changes || 0) };
    },
    batch: async (statements) => statements.map(({ sql, args = [] }) => {
      const result = raw.prepare(sql).run(...args);
      return { rows: [], rowsAffected: Number(result.changes || 0) };
    }),
  };
  try {
    await bumpSyncRevisions(db, ["accounts.list", "dashboard.overview"], "2026-09-12T03:00:00.000Z");
    await bumpSyncRevisions(db, ["accounts.list"], "2026-09-12T03:00:01.000Z");
    const state = await readSyncState(db);
    assert.equal(state.globalRevision, 2);
    assert.equal(state.resources["accounts.list"], 2);
    assert.equal(state.resources["dashboard.overview"], 1);
    assert.equal(state.updatedAt, "2026-09-12T03:00:01.000Z");
    assert.deepEqual(presentSyncRevisionRows([]), { globalRevision: 0, resources: {}, updatedAt: null });
  } finally { raw.close(); }
});
