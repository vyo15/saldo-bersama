import test from "node:test";
import assert from "node:assert/strict";
import { filterByOwnership, hasSameOwnership, ownershipKey, ownershipLabel } from "../src/domain/ownership.js";

test("ownership helper memisahkan ruang bersama dan personal", () => {
  const shared = { account_id: "shared", owner_scope: "shared" };
  const ownerPersonal = { account_id: "owner", owner_scope: "personal", owner_user_id: "u1" };
  const ownerEnvelope = { envelope_period_id: "e1", scope: "personal", owner_user_id: "u1" };
  const memberPersonal = { account_id: "member", owner_scope: "personal", owner_user_id: "u2" };

  assert.equal(ownershipKey(shared), "shared:");
  assert.equal(ownershipLabel(ownerPersonal), "pribadi");
  assert.equal(hasSameOwnership(ownerPersonal, ownerEnvelope), true);
  assert.equal(hasSameOwnership(ownerPersonal, memberPersonal), false);
  assert.deepEqual(filterByOwnership([shared, ownerPersonal, memberPersonal], ownerEnvelope), [ownerPersonal]);
});
