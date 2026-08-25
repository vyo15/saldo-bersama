import assert from "node:assert/strict";
import test from "node:test";

import { cleanupExpiredRateLimitBuckets, enforceDistributedRateLimit } from "../../api/_lib/rateLimit.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const key = (suffix) => `security:test:${suffix}:abcdefghijklmnop`;

test("durable rate limit membagi counter lintas pemanggilan dan menolak di atas limit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = 1_000_000;
    assert.deepEqual(await enforceDistributedRateLimit(db, key("shared"), { limit: 2, windowMs: 60_000, now: () => now }), {
      count: 1,
      resetAtMs: now + 60_000,
    });
    assert.equal((await enforceDistributedRateLimit(db, key("shared"), { limit: 2, windowMs: 60_000, now: () => now + 1 })).count, 2);
    await assert.rejects(
      enforceDistributedRateLimit(db, key("shared"), { limit: 2, windowMs: 60_000, now: () => now + 2 }),
      (error) => error.code === "RATE_LIMITED" && error.status === 429 && error.retryAfterSeconds === 60,
    );
    const stored = await db.one("SELECT request_count,reset_at_ms FROM rate_limit_buckets WHERE bucket_key=?", [key("shared")]);
    assert.equal(Number(stored.request_count), 3);
    assert.equal(Number(stored.reset_at_ms), now + 60_000);
  } finally { db.close(); }
});

test("durable rate limit mereset window yang kedaluwarsa dan memisahkan scope key", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const started = 5_000_000;
    await enforceDistributedRateLimit(db, key("alpha"), { limit: 1, windowMs: 10_000, now: () => started });
    await enforceDistributedRateLimit(db, key("beta"), { limit: 1, windowMs: 10_000, now: () => started + 1 });
    const reset = await enforceDistributedRateLimit(db, key("alpha"), { limit: 1, windowMs: 10_000, now: () => started + 10_000 });
    assert.equal(reset.count, 1);
    assert.equal(reset.resetAtMs, started + 20_000);
    assert.equal(Number((await db.one("SELECT request_count FROM rate_limit_buckets WHERE bucket_key=?", [key("beta")])).request_count), 1);
  } finally { db.close(); }
});

test("housekeeping rate limit hanya menghapus bucket yang benar-benar expired", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = 9_000_000;
    await enforceDistributedRateLimit(db, key("expired"), { limit: 2, windowMs: 1_000, now: () => now - 2_000 });
    await enforceDistributedRateLimit(db, key("active"), { limit: 2, windowMs: 60_000, now: () => now });
    assert.equal(await cleanupExpiredRateLimitBuckets(db, now), 1);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM rate_limit_buckets")).count), 1);
    assert.ok(await db.one("SELECT bucket_key FROM rate_limit_buckets WHERE bucket_key=?", [key("active")]));
  } finally { db.close(); }
});
