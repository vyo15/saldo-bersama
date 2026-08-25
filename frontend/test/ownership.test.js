import test from "node:test";
import assert from "node:assert/strict";
import { canRepresentAccountTransfer, canUseAssignedItem, filterByAssigneeAccess, filterByOwnership, hasSameAssignee, hasSameOwnership, ownershipKey, ownershipLabel } from "../src/domain/ownership.js";

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


test("transfer account helper mengizinkan shared/personal tetapi menolak dua owner personal berbeda", () => {
  const shared = { owner_scope: "shared", owner_user_id: null };
  const personalA = { owner_scope: "personal", owner_user_id: "u1" };
  const personalASame = { owner_scope: "personal", owner_user_id: "u1" };
  const personalB = { owner_scope: "personal", owner_user_id: "u2" };
  assert.equal(canRepresentAccountTransfer(shared, personalA), true);
  assert.equal(canRepresentAccountTransfer(personalA, shared), true);
  assert.equal(canRepresentAccountTransfer(personalA, personalASame), true);
  assert.equal(canRepresentAccountTransfer(personalA, personalB), false);
  assert.equal(canRepresentAccountTransfer(null, shared), false);
});

test("penerima jatah terpisah dari ownership ledger dan member hanya dapat memakai Bersama atau jatahnya", () => {
  const together = { envelope_period_id: "e-shared", scope: "shared", assignee_user_id: null };
  const mine = { envelope_period_id: "e-mine", scope: "shared", assignee_user_id: "u-member" };
  const partner = { envelope_period_id: "e-partner", scope: "shared", assignee_user_id: "u-admin" };
  const member = { user_id: "u-member", role: "member" };
  const admin = { user_id: "u-admin", role: "owner" };
  assert.equal(canUseAssignedItem(together, member), true);
  assert.equal(canUseAssignedItem(mine, member), true);
  assert.equal(canUseAssignedItem(partner, member), false);
  assert.deepEqual(filterByAssigneeAccess([together, mine, partner], member), [together, mine]);
  assert.deepEqual(filterByAssigneeAccess([together, mine, partner], admin), [together, mine, partner]);
  assert.equal(hasSameAssignee(mine, { assignee_user_id: "u-member" }), true);
  assert.equal(hasSameAssignee(mine, partner), false);
});
