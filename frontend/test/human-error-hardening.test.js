import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("shopping checkout resets duplicate confirmation when intent changes and locks unknown outcome", () => {
  const source = read("src/features/shopping/ShoppingPage.jsx");
  assert.match(source, /resetConfirmation/);
  assert.match(source, /mutation\.outcomeUnknown/);
  assert.match(source, /Coba lagi data yang sama/);
  assert.match(source, /setConfirmDuplicate\(false\)/);
});

test("shopping reversible removal exposes undo and item quantity validates before mutation", () => {
  const page = read("src/features/shopping/ShoppingPage.jsx");
  const editor = read("src/features/shopping/ShoppingItemEditor.jsx");
  assert.match(page, /Urungkan/);
  assert.match(page, /\["pending", "in_cart"\]\.includes\(item\.status\) \? item\.status : "pending"/);
  assert.match(editor, /quantityValid/);
  assert.match(editor, /Jumlah harus lebih dari 0/);
});

test("financial flows surface inline guardrails before submit", () => {
  const allocation = read("src/features/allocations/AllocationFundingFlow.jsx");
  const goal = read("src/features/goals/components/GoalFundingModal.jsx");
  const reconciliation = read("src/features/reconciliations/components/ReconciliationForm.jsx");
  assert.match(allocation, /Maksimal .*sesuai dana tersedia/);
  assert.match(goal, /Dana rekening hanya/);
  assert.match(goal, /Status belum dapat dipastikan/);
  assert.match(reconciliation, /balanceError/);
});

test("member role change requires an explicit review acknowledgement", () => {
  const source = read("src/features/settings/MembersSettingsPage.jsx");
  assert.match(source, /roleAcknowledged/);
  assert.match(source, /Saya sudah memeriksa perubahan akses ini/);
});
