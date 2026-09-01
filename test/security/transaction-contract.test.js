import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERNAL_TRANSACTION_LINK_FIELDS,
  firstForbiddenTransactionField,
} from "../../api/_lib/transactionContract.js";

const authoritativeFields = [
  "scope", "owner_user_id", "cost_share_json", "idempotency_key", "created_by", "created_at",
  "updated_by", "updated_at", "cancelled_by", "cancelled_at", "cancellation_reason", "status",
];

test("internal transaction link mode hanya membuka recurring_occurrence_id dan goal_id", () => {
  assert.deepEqual(INTERNAL_TRANSACTION_LINK_FIELDS, ["recurring_occurrence_id", "goal_id"]);
  for (const field of INTERNAL_TRANSACTION_LINK_FIELDS) {
    assert.equal(firstForbiddenTransactionField({ [field]: "link-id" }, { allowInternalLinks: true }), null);
    assert.equal(firstForbiddenTransactionField({ [field]: "link-id" }), field);
  }
});

test("internal transaction link mode tetap menolak metadata server-authoritative", () => {
  for (const field of authoritativeFields) {
    assert.equal(firstForbiddenTransactionField({ [field]: "forged" }, { allowInternalLinks: true }), field);
  }
});
