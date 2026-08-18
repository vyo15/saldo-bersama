import assert from "node:assert/strict";
import test from "node:test";
import { newVersionStamp, nextVersionStamp, nextVersionTimestamp } from "../../api/_lib/services/versioning.js";

test("version stamp menaikkan row_version tanpa memutasi record sumber", () => {
  const current = Object.freeze({ row_version: 7, updated_at: "2026-08-01T00:00:00.000Z", updated_by: "owner-old" });
  const timestamp = "2026-08-09T03:30:00.000Z";

  assert.deepEqual(nextVersionTimestamp(current, timestamp), {
    row_version: 8,
    updated_at: timestamp,
  });
  assert.deepEqual(nextVersionStamp(current, "owner-new", timestamp), {
    row_version: 8,
    updated_at: timestamp,
    updated_by: "owner-new",
  });
  assert.deepEqual(current, {
    row_version: 7,
    updated_at: "2026-08-01T00:00:00.000Z",
    updated_by: "owner-old",
  });
});


test("create stamp memberi metadata versi dan audit tanpa mencampur ownership domain", () => {
  const timestamp = "2026-08-18T08:00:00.000Z";
  assert.deepEqual(newVersionStamp("owner-1", timestamp), {
    row_version: 1,
    created_by: "owner-1",
    created_at: timestamp,
    updated_by: "owner-1",
    updated_at: timestamp,
  });
  assert.equal("scope" in newVersionStamp("owner-1", timestamp), false);
  assert.equal("owner_user_id" in newVersionStamp("owner-1", timestamp), false);
});
