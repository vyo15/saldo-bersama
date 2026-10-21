import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleRovingTabKeyDown } from "../src/components/common/rovingTabKeyboard.js";

const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("segmented filter shares tonal motion, minimum hit target and accessible pressed state", async () => {
  const [component, css] = await Promise.all([source("components/common/QuickSegmentedFilter.jsx"), source("components/common/QuickSegmentedFilter.module.css")]);
  assert.match(component, /role="group" aria-label=\{label\}/);
  assert.match(component, /aria-pressed=\{value === option.value\}/);
  assert.match(component, /onChange\(option.value\)/);
  assert.match(css, /min-height: var\(--mobile-hit-target\)/);
  assert.match(css, /transform: translateX/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("filter scopes and status remain domain-owned after visual convergence", async () => {
  const [accounts, allocation, shopping, investment, recurring, activity, audit] = await Promise.all([
    source("features/accounts/components/MobileAccountsExperience.jsx"), source("features/allocations/AllocationOverviewLayer.jsx"),
    source("features/shopping/ShoppingPage.jsx"), source("features/investments/InvestmentOverview.jsx"),
    source("features/recurring/RecurringSchedule.jsx"), source("features/settings/components/MemberActivityPanel.jsx"),
    source("features/settings/AuditPage.jsx"),
  ]);
  assert.match(accounts, /\["partner", "Pasangan"\]/);
  assert.match(allocation, /\{ value: "mine", label: "Saya"/);
  assert.match(shopping, /value: "pending", label: "Belum"/);
  assert.match(investment, /overviewTabs\.map/);
  assert.match(investment, /setActiveTab\(tab\.value\)/);
  assert.match(recurring, /\{ id: "cancelled", label: "Dilewati" \}/);
  assert.match(activity, /\{ value: "refund", label: "Refund" \}/);
  assert.match(audit, /QuickSegmentedFilter label="Filter aktivitas audit"/);
});

test("roving tabs support arrow, Home/End and do not swallow ordinary keys", () => {
  const values = ["summary", "finance", "activity"];
  let next = "";
  let focused = -1;
  let prevented = 0;
  const mock = (key) => ({ key, target: { matches: () => true }, currentTarget: { querySelectorAll: () => values.map((_, index) => ({ focus: () => { focused = index; } })) }, preventDefault: () => { prevented++; } });
  assert.equal(handleRovingTabKeyDown(mock(" "), values, "summary", (value) => { next = value; }), undefined);
  assert.equal(prevented, 0);
  handleRovingTabKeyDown(mock("ArrowLeft"), values, "summary", (value) => { next = value; });
  assert.equal(next, "activity"); assert.equal(focused, 2);
  handleRovingTabKeyDown(mock("Home"), values, "activity", (value) => { next = value; });
  assert.equal(next, "summary"); assert.equal(focused, 0);
  handleRovingTabKeyDown(mock("End"), values, "summary", (value) => { next = value; });
  assert.equal(next, "activity"); assert.equal(focused, 2);
  assert.equal(prevented, 3);
});

test("Keluarga and Akun Saya label tab panels and support roving keyboard", async () => {
  const [family, account] = await Promise.all([source("features/settings/MembersSettingsPage.jsx"), source("features/settings/MyAccountPage.jsx")]);
  for (const text of [family, account]) {
    assert.match(text, /handleRovingTabKeyDown/);
    assert.match(text, /role="tabpanel" aria-labelledby=/);
    assert.match(text, /tabIndex=\{0\}/);
    assert.match(text, /aria-controls=/);
  }
});
