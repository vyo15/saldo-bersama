import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("frontend Kebutuhan memakai capability backend dan tidak mempertahankan authorization policy lokal", async () => {
  const [allocationPage, detail, budgetAccess] = await Promise.all([
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/allocations/AllocationPlanningDetail.jsx"),
    read("src/features/budgets/budgetAccess.js").catch(() => ""),
  ]);

  assert.match(allocationPage, /canManage: Boolean\(item\.can_manage_needs\)/);
  assert.match(allocationPage, /Boolean\(item\?\.can_adjust\)/);
  assert.match(detail, /budget\.can_manage !== false/);
  assert.equal(budgetAccess, "", "helper policy role/scope frontend tidak boleh kembali sebagai authority");
  assert.doesNotMatch(allocationPage, /canManageBudgetScope|sharedOnly/);
});
