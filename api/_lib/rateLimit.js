import { nowIso } from "./services/core.js";

const defaultClock = () => Date.now();

const rateLimitError = (resetAtMs, nowMs) => Object.assign(new Error("Terlalu banyak request. Coba lagi sebentar."), {
  status: 429,
  code: "RATE_LIMITED",
  retryAfterSeconds: Math.max(1, Math.ceil((resetAtMs - nowMs) / 1_000)),
});

// The durable bucket is the cross-instance abuse boundary. Process-local limiting in
// security.js remains a cheap first layer, but this write is what keeps the limit shared
// across Vercel Function instances. The hashed key contains no raw IP, UID, or email.
export const enforceDistributedRateLimit = async (db, key, {
  limit = 80,
  windowMs = 60_000,
  now = defaultClock,
} = {}) => {
  const safeLimit = Number(limit);
  const safeWindowMs = Number(windowMs);
  if (!db || typeof db.one !== "function") throw new Error("Database rate limit tidak tersedia.");
  if (!Number.isSafeInteger(safeLimit) || safeLimit < 1 || safeLimit > 100_000) throw new Error("Batas rate limit tidak valid.");
  if (!Number.isSafeInteger(safeWindowMs) || safeWindowMs < 1_000 || safeWindowMs > 24 * 60 * 60_000) throw new Error("Window rate limit tidak valid.");

  const nowMs = Number(now());
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("Clock rate limit tidak valid.");
  const resetAtMs = nowMs + safeWindowMs;
  const row = await db.one(`INSERT INTO rate_limit_buckets(bucket_key,window_started_at_ms,reset_at_ms,request_count,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      window_started_at_ms=CASE WHEN rate_limit_buckets.reset_at_ms<=excluded.window_started_at_ms THEN excluded.window_started_at_ms ELSE rate_limit_buckets.window_started_at_ms END,
      reset_at_ms=CASE WHEN rate_limit_buckets.reset_at_ms<=excluded.window_started_at_ms THEN excluded.reset_at_ms ELSE rate_limit_buckets.reset_at_ms END,
      request_count=CASE WHEN rate_limit_buckets.reset_at_ms<=excluded.window_started_at_ms THEN 1 ELSE rate_limit_buckets.request_count+1 END,
      updated_at=excluded.updated_at
    RETURNING request_count,reset_at_ms`, [key, nowMs, resetAtMs, 1, nowIso()]);
  const count = Number(row?.request_count || 0);
  const effectiveResetAt = Number(row?.reset_at_ms || resetAtMs);
  if (count > safeLimit) throw rateLimitError(effectiveResetAt, nowMs);
  return { count, resetAtMs: effectiveResetAt };
};

export const cleanupExpiredRateLimitBuckets = async (db, nowMs = Date.now()) => {
  const cutoff = Number(nowMs);
  if (!Number.isSafeInteger(cutoff) || cutoff < 0) throw new Error("Clock housekeeping rate limit tidak valid.");
  const result = await db.execute("DELETE FROM rate_limit_buckets WHERE reset_at_ms<=?", [cutoff]);
  return Number(result.rowsAffected || 0);
};
