import assert from "node:assert/strict";
import test from "node:test";
import { transactionCapabilities, transferRouteMode, transferRoutesForAccounts } from "../../api/_lib/services/transactionPolicy.js";

const owner = { user_id: "owner", role: "owner" };
const member = { user_id: "member", role: "member" };
const shared = { account_id: "shared", owner_scope: "shared", owner_user_id: null };
const personalMember = { account_id: "personal-member", owner_scope: "personal", owner_user_id: "member" };
const personalPartner = { account_id: "personal-partner", owner_scope: "personal", owner_user_id: "partner" };

test("transfer route backend membedakan direct, approval, dan denied tanpa policy frontend", () => {
  assert.equal(transferRouteMode(member, shared, personalMember), "approval_required");
  assert.equal(transferRouteMode(member, personalMember, shared), "direct");
  assert.equal(transferRouteMode(member, personalPartner, shared), "denied");
  assert.equal(transferRouteMode(member, shared, shared), "denied");
  assert.equal(transferRouteMode(owner, shared, personalMember), "direct");

  const routes = transferRoutesForAccounts(member, [shared, personalMember, personalPartner]);
  assert.equal(routes.some((route) => route.source_account_id === "personal-partner"), false);
  assert.equal(routes.find((route) => route.source_account_id === "shared" && route.destination_account_id === "personal-member")?.mode, "approval_required");
  assert.equal(routes.find((route) => route.source_account_id === "personal-member" && route.destination_account_id === "shared")?.mode, "direct");
});

test("transaction capability canonical menjaga lifecycle, creator, linked transaction, dan period closure", () => {
  const base = { status: "active", scope: "shared", created_by: "member", transaction_type: "expense" };
  assert.deepEqual(transactionCapabilities(member, base, { periodOpen: true }), {
    can_edit: true,
    can_cancel: true,
    can_restore: false,
    period_closed: false,
    managed_by: "",
  });
  assert.equal(transactionCapabilities(member, { ...base, recurring_occurrence_id: "occ-1" }, { periodOpen: true }).can_edit, false);
  assert.equal(transactionCapabilities(member, base, { periodOpen: false }).period_closed, true);
  assert.equal(transactionCapabilities(member, { ...base, transaction_type: "adjustment" }, { periodOpen: true }).can_edit, false);
  assert.equal(transactionCapabilities(owner, { ...base, transaction_type: "adjustment" }, { periodOpen: true }).can_edit, true);
});
