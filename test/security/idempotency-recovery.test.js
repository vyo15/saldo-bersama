import assert from "node:assert/strict";
import test from "node:test";
import {
  EXTERNAL_PROCESSING_LEASE_MS,
  reserveExternalIdempotency,
} from "../../api/_lib/idempotency.js";

const context = {
  actor: { user_id: "user-owner" },
  action: "notifications.test",
  idempotencyKey: "idem-1234567890abcdef",
};
const fingerprint = "fingerprint-1";
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const stateJson = (state, updatedAt) => JSON.stringify({
  __idempotency_state: state,
  __idempotency_state_updated_at: updatedAt,
});
const makeDb = (row) => ({
  row: row ? { ...row } : null,
  async one(_sql, params) {
    if (!this.row || this.row.expires_at <= params[2]) return null;
    return { ...this.row };
  },
  async execute(sql, params) {
    if (sql.startsWith("UPDATE idempotency_keys SET response_json=")) {
      const expected = params.at(-1);
      if (!this.row || this.row.response_json !== expected) return { rowsAffected: 0 };
      this.row.response_json = params[0];
      this.row.expires_at = params[1];
      return { rowsAffected: 1 };
    }
    if (sql.startsWith("INSERT INTO idempotency_keys")) {
      this.row = {
        actor_id: params[0], idempotency_key: params[1], action: params[2], request_fingerprint: params[3],
        entity_id: params[4], response_json: params[5], created_at: params[6], expires_at: params[7],
      };
      return { rowsAffected: 1 };
    }
    throw new Error(`SQL test belum didukung: ${sql}`);
  },
  async transaction(callback) { return callback(this); },
});
const processingRow = (updatedAt) => ({
  actor_id: context.actor.user_id,
  idempotency_key: context.idempotencyKey,
  action: context.action,
  request_fingerprint: fingerprint,
  entity_id: null,
  response_json: stateJson("processing", updatedAt),
  created_at: updatedAt,
  expires_at: future(),
});

test("external idempotency menolak reservation processing yang lease-nya masih aktif", async () => {
  const db = makeDb(processingRow(new Date().toISOString()));
  await assert.rejects(
    reserveExternalIdempotency(db, context, fingerprint),
    (error) => error.code === "IDEMPOTENCY_IN_PROGRESS" && error.status === 409,
  );
});

test("stale processing non-retriable dipersist sebagai outcome unknown sebelum ditolak", async () => {
  const old = new Date(Date.now() - EXTERNAL_PROCESSING_LEASE_MS - 1_000).toISOString();
  const db = makeDb(processingRow(old));
  await assert.rejects(
    reserveExternalIdempotency(db, context, fingerprint),
    (error) => error.code === "IDEMPOTENCY_OUTCOME_UNKNOWN" && error.status === 503,
  );
  const state = JSON.parse(db.row.response_json);
  assert.equal(state.__idempotency_state, "unknown");
  assert.ok(Date.parse(state.__idempotency_state_updated_at) > Date.parse(old));
});

test("stale processing hanya dapat resume dengan same key/fingerprint pada action recovery-safe", async () => {
  const old = new Date(Date.now() - EXTERNAL_PROCESSING_LEASE_MS - 1_000).toISOString();
  const db = makeDb(processingRow(old));
  const reservation = await reserveExternalIdempotency(db, context, fingerprint, { allowUnknownRetry: true });
  assert.deepEqual(reservation, { replayed: false, resumed: true, result: null });
  const state = JSON.parse(db.row.response_json);
  assert.equal(state.__idempotency_state, "processing");
  assert.ok(Date.parse(state.__idempotency_state_updated_at) > Date.parse(old));

  await assert.rejects(
    reserveExternalIdempotency(db, context, "different-fingerprint", { allowUnknownRetry: true }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409,
  );
});

test("processing reservation legacy tanpa state timestamp tetap memakai created_at sebagai lease fallback", async () => {
  const old = new Date(Date.now() - EXTERNAL_PROCESSING_LEASE_MS - 1_000).toISOString();
  const legacy = processingRow(old);
  legacy.response_json = JSON.stringify({ __idempotency_state: "processing" });
  const db = makeDb(legacy);
  await assert.rejects(
    reserveExternalIdempotency(db, context, fingerprint),
    (error) => error.code === "IDEMPOTENCY_OUTCOME_UNKNOWN" && error.status === 503,
  );
  const state = JSON.parse(db.row.response_json);
  assert.equal(state.__idempotency_state, "unknown");
  assert.ok(state.__idempotency_state_updated_at);
});
