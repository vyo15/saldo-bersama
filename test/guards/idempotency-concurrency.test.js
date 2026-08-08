import assert from "node:assert/strict";
import test from "node:test";
import {
  completeExternalIdempotency,
  markExternalOutcomeUnknown,
  readIdempotency,
  requestFingerprint,
  reserveExternalIdempotency,
} from "../../api/_lib/idempotency.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const actor = { user_id: "guard-owner" };
const context = (key, payload = { probe: "same" }) => ({
  actor,
  action: "notifications.test",
  payload,
  rowVersion: null,
  idempotencyKey: key,
});

const seedActor = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [actor.user_id, "guard-firebase", "guard@example.com", "Guard Owner", "owner", "active", 1, now, now],
  );
};

test("external idempotency mereservasi intent sebelum side effect dan menolak request sama yang masih berjalan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedActor(db);
    const first = context("same-key");
    const fingerprint = requestFingerprint(first);
    assert.deepEqual(await reserveExternalIdempotency(db, first, fingerprint), { replayed: false, resumed: false, result: null });
    await assert.rejects(
      () => reserveExternalIdempotency(db, first, fingerprint),
      (error) => error.code === "IDEMPOTENCY_IN_PROGRESS" && error.status === 409,
    );
    await completeExternalIdempotency(db, first, fingerprint, { delivered: true });
    assert.deepEqual(await readIdempotency(db, first, fingerprint), { delivered: true });
    assert.deepEqual(await reserveExternalIdempotency(db, first, fingerprint), { replayed: true, resumed: false, result: { delivered: true } });
  } finally { db.close(); }
});

test("idempotency key yang sama tidak boleh dipakai untuk payload berbeda", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedActor(db);
    const first = context("conflict-key", { target: "device-a" });
    await reserveExternalIdempotency(db, first, requestFingerprint(first));
    const changed = context("conflict-key", { target: "device-b" });
    await assert.rejects(
      () => readIdempotency(db, changed, requestFingerprint(changed)),
      (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409,
    );
  } finally { db.close(); }
});

test("hasil external 5xx ditandai outcome unknown dan action non-resumable tidak mengulang side effect", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedActor(db);
    const request = context("unknown-key");
    const fingerprint = requestFingerprint(request);
    await reserveExternalIdempotency(db, request, fingerprint);
    await markExternalOutcomeUnknown(db, request, fingerprint);
    await assert.rejects(
      () => readIdempotency(db, request, fingerprint),
      (error) => error.code === "IDEMPOTENCY_OUTCOME_UNKNOWN" && error.status === 503,
    );
    await assert.rejects(
      () => reserveExternalIdempotency(db, request, fingerprint),
      (error) => error.code === "IDEMPOTENCY_OUTCOME_UNKNOWN" && error.status === 503,
    );
  } finally { db.close(); }
});

test("action external yang punya durable recovery boleh melanjutkan intent unknown dengan key yang sama", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedActor(db);
    const request = context("resumable-key", { backup: "verified" });
    const fingerprint = requestFingerprint(request);
    await reserveExternalIdempotency(db, request, fingerprint);
    await markExternalOutcomeUnknown(db, request, fingerprint);
    assert.deepEqual(
      await reserveExternalIdempotency(db, request, fingerprint, { allowUnknownRetry: true }),
      { replayed: false, resumed: true, result: null },
    );
    await completeExternalIdempotency(db, request, fingerprint, { recovered: true });
    assert.deepEqual(
      await reserveExternalIdempotency(db, request, fingerprint, { allowUnknownRetry: true }),
      { replayed: true, resumed: false, result: { recovered: true } },
    );
  } finally { db.close(); }
});
