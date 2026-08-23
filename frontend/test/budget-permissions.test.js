import assert from "node:assert/strict";
import test from "node:test";
import { canManageBudgetScope } from "../src/features/budgets/budgetAccess.js";

const member = { user_id: "member-1", role: "member" };
const otherMember = { user_id: "member-2", role: "member" };
const owner = { user_id: "owner-1", role: "owner" };

test("Member dapat mengelola Kebutuhan Bersama dan personal miliknya sendiri", () => {
  assert.equal(canManageBudgetScope({ scope: "shared", owner_user_id: null }, member), true);
  assert.equal(canManageBudgetScope({ scope: "personal", owner_user_id: member.user_id }, member), true);
  assert.equal(canManageBudgetScope({ scope: "personal", owner_user_id: otherMember.user_id }, member), false);
  assert.equal(canManageBudgetScope({ scope: "personal", owner_user_id: otherMember.user_id }, owner), true);
});

test("scope shared yang membawa owner tidak dianggap capability valid untuk Member", () => {
  assert.equal(canManageBudgetScope({ scope: "shared", owner_user_id: member.user_id }, member), false);
});
