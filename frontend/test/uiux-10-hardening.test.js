import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const luminance = (hex) => {
  const channels = hex.replace("#", "").match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
};

const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("light theme muted text remains WCAG AA on canonical neutral and tinted surfaces", async () => {
  const tokens = await read("src/styles/tokens.css");
  assert.match(tokens, /--text-soft:\s*#4f6270/);
  assert.match(tokens, /--text-muted:\s*#566979/);
  for (const background of ["#ffffff", "#edf7f5", "#dff1ed", "#e3f4f0"]) {
    assert.ok(contrast("#566979", background) >= 4.5, `text-muted must stay >=4.5:1 on ${background}`);
    assert.ok(contrast("#4f6270", background) >= 4.5, `text-soft must stay >=4.5:1 on ${background}`);
  }
});

test("mobile interaction contract exposes one 44px hit-target token and compact features consume it", async () => {
  const [tokens, shopping, memberActivity, members, recurring, reconciliation, commitments, planning, allocationDetail, investments, login, budgetBatch] = await Promise.all([
    read("src/styles/tokens.css"),
    read("src/features/shopping/ShoppingPage.module.css"),
    read("src/features/settings/MemberActivity.module.css"),
    read("src/features/settings/MembersSettings.module.css"),
    read("src/features/recurring/RecurringSchedule.module.css"),
    read("src/features/reconciliations/ReconciliationsPage.module.css"),
    read("src/features/commitments/CommitmentsPage.module.css"),
    read("src/features/planning/PlanningPage.module.css"),
    read("src/features/allocations/AllocationDetail.module.css"),
    read("src/features/investments/HoldingCard.module.css"),
    read("src/features/auth/LoginMobile.module.css"),
    read("src/features/budgets/BudgetBatchEditor.module.css"),
  ]);
  assert.match(tokens, /--mobile-hit-target:\s*44px/);
  for (const source of [shopping, memberActivity, members, recurring, reconciliation, commitments, planning, allocationDetail, investments, login, budgetBatch]) {
    assert.match(source, /var\(--mobile-hit-target\)/);
  }
  assert.match(shopping, /\.checkButton\s*\{[^}]*width:var\(--mobile-hit-target\);[^}]*height:var\(--mobile-hit-target\)/s);
  assert.match(shopping, /\.suggestionSearch button\s*\{[^}]*width:var\(--mobile-hit-target\);[^}]*height:var\(--mobile-hit-target\)/s);
  assert.match(investments, /\.assetFilters button\s*\{[^}]*min-height:\s*var\(--mobile-hit-target\)/s);
  assert.match(budgetBatch, /\.trashButton,\.compactRemove\s*\{[^}]*width:\s*var\(--mobile-hit-target\)/s);
  assert.match(budgetBatch, /\.addButton\s*\{[^}]*min-height:\s*var\(--mobile-hit-target\)/s);
});

test("Investment holding and desktop audit detail use explicit native buttons instead of pseudo-buttons", async () => {
  const [investment, holdingCss, audit, settingsCss] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/HoldingCard.module.css"),
    read("src/features/settings/AuditPage.jsx"),
    read("src/features/settings/Settings.module.css"),
  ]);
  assert.doesNotMatch(investment, /role="button"|tabIndex="0"/);
  assert.match(investment, /<button type="button" className=\{holdingStyles\.holdingCardAction\}/);
  assert.match(holdingCss, /\.holdingCardAction\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  assert.doesNotMatch(audit, /<tr key=\{entry\.audit_id\} tabIndex=\{0\}/);
  assert.match(audit, /className=\{styles\.auditDetailButton\}/);
  assert.match(settingsCss, /\.auditDetailButton\s*\{[^}]*var\(--mobile-hit-target\)/s);
});

test("browser smoke locks overflow, touch target, keyboard focus, theme parity, text spacing, and reduced motion", async () => {
  const smoke = await read("../scripts/browser-smoke.mjs");
  assert.match(smoke, /smallTargets/);
  assert.match(smoke, /const mobileViewport = \$\{width <= 820 \? "true" : "false"\}/);
  assert.doesNotMatch(smoke, /const smallTargets = width <= 820/);
  assert.match(smoke, /exceptionDetails\.exception\?\.description/);
  assert.match(smoke, /r\.width < 44 \|\| r\.height < 44/);
  assert.match(smoke, /themeParity/);
  assert.match(smoke, /focusVisible/);
  assert.match(smoke, /wcag-text-spacing-smoke/);
  assert.match(smoke, /prefers-reduced-motion/);
});


test("route yang mendekati build budget memindahkan interaction sekunder ke lazy chunk", async () => {
  const [shoppingPage, shoppingEditor, reconciliation] = await Promise.all([
    read("src/features/shopping/ShoppingPage.jsx"),
    read("src/features/shopping/ShoppingItemEditor.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
  ]);
  assert.match(shoppingPage, /const ShoppingItemEditor = lazy\(\(\) => import\("\.\/ShoppingItemEditor\.jsx"\)\)/);
  assert.match(shoppingPage, /editor\.open \? <Suspense/);
  assert.match(shoppingEditor, /title=\{editing \? "Edit barang" : "Tambah barang"\}/);
  assert.doesNotMatch(shoppingPage, /const ItemEditor =/);
  assert.match(reconciliation, /const ReconciliationHistory = lazy\(\(\) => import\("\.\/components\/ReconciliationHistory\.jsx"\)\)/);
  assert.match(reconciliation, /<Suspense fallback=\{<div className=\{styles\.historyLoading\}/);
});
