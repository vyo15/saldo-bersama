import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile surface tokens and shared primitives favor app canvas hierarchy", async () => {
  const [tokens, card, responsive, picker] = await Promise.all([
    read("src/styles/tokens.css"),
    read("src/components/common/Card.module.css"),
    read("src/styles/responsive.css"),
    read("src/components/common/InlineSelectionPicker.module.css"),
  ]);

  assert.match(tokens, /--mobile-surface-canvas:\s*var\(--page\);/);
  assert.match(tokens, /--mobile-divider:\s*var\(--divider-soft\);/);
  assert.match(tokens, /--mobile-radius-object:\s*var\(--radius-surface\);/);
  assert.match(card, /@media \(max-width: 820px\)[\s\S]*?\.surfaceOutlined \{ border-color:\s*transparent; \}/);
  assert.match(responsive, /\.mobile-data-card \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);
  assert.match(picker, /@media \(max-width: 820px\)[\s\S]*?\.shell \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);
});

test("mobile transactions use grouped rows instead of card-per-field hierarchy", async () => {
  const [fields, history, transfer] = await Promise.all([
    read("src/features/transactions/MobileTransactionFields.module.css"),
    read("src/features/transactions/components/MobileTransactionHistory.module.css"),
    read("src/features/transactions/MobileTransferFields.module.css"),
  ]);

  assert.match(fields, /Mobile transaction composer: grouped native rows/);
  assert.match(fields, /\.detailRow,[\s\S]*?\.contextLocked \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/);
  assert.match(fields, /\.additionalToggle \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*background:\s*transparent;/);
  assert.match(history, /@media \(max-width: 820px\)[\s\S]*?\.groupList \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*box-shadow:\s*none;/);
  assert.match(transfer, /@media \(max-width: 820px\)[\s\S]*?\.dateCard \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;/);
});

test("reconciliation and account mobile shells stay flat while financial objects remain explicit", async () => {
  const [reconciliation, accounts, transferAction] = await Promise.all([
    read("src/features/reconciliations/ReconciliationsPage.module.css"),
    read("src/features/accounts/components/MobileAccountsExperience.module.css"),
    read("src/features/accounts/components/MobileAccountTransferAction.module.css"),
  ]);

  assert.doesNotMatch(reconciliation, /@media \(max-width: 580px\)[\s\S]{0,420}?\.formPanel \{ box-shadow:\s*0 10px 28px/);
  assert.match(reconciliation, /Mobile reconciliation is one diagnosis flow on the app canvas/);
  assert.match(reconciliation, /\.formPanel,[\s\S]*?\.historyPanel \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.match(reconciliation, /\.mobileHistoryCard \{[^}]*padding:\s*14px 0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);

  assert.equal((accounts.match(/@media \(max-width: 820px\)/g) ?? []).length, 1, "accounts keeps one canonical mobile breakpoint");
  assert.match(accounts, /\.mobileOwnershipFilters \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;/);
  assert.match(accounts, /\.mobileQuickActions \{[^}]*border-top:\s*1px solid var\(--mobile-divider\);[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);/);
  assert.match(accounts, /\.mobileQuickActions > \* \+ \* \{ border-left:\s*1px solid var\(--mobile-divider\); \}/);
  assert.match(transferAction, /\.mobileTransferQuickAction \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);
});

test("planning objects keep one meaningful surface and flatten nested mobile decoration", async () => {
  const [commitments, recurring] = await Promise.all([
    read("src/features/commitments/CommitmentsPage.module.css"),
    read("src/features/recurring/RecurringSchedule.module.css"),
  ]);

  assert.match(commitments, /@media \(max-width: 820px\)[\s\S]*?\.mortgageProgress \{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/);
  assert.match(commitments, /\.meta \{ border-top-color:\s*var\(--mobile-divider\); \}[\s\S]*?\.cardDetails \{ border-top-color:\s*var\(--mobile-divider\); \}/);
  assert.match(recurring, /@media \(max-width: 820px\)[\s\S]*?\.scheduleCard \{[^}]*border-color:\s*transparent;[^}]*border-radius:\s*var\(--mobile-radius-object\);[^}]*box-shadow:\s*none;/);
  assert.match(recurring, /\.amountBlock \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/);
});


test("final mobile design-system convergence stays semantic and single-cascade", async () => {
  const [tokens, responsive, settings, members, reconciliation, allocation, commitments, recurring, transactions, history] = await Promise.all([
    read("src/styles/tokens.css"),
    read("src/styles/responsive.css"),
    read("src/features/settings/Settings.module.css"),
    read("src/features/settings/MembersSettings.module.css"),
    read("src/features/reconciliations/ReconciliationsPage.module.css"),
    read("src/features/allocations/AllocationDetail.module.css"),
    read("src/features/commitments/CommitmentsPage.module.css"),
    read("src/features/recurring/RecurringSchedule.module.css"),
    read("src/features/transactions/TransactionsPage.module.css"),
    read("src/features/transactions/components/MobileTransactionHistory.module.css"),
  ]);

  assert.match(tokens, /--type-page-title:\s*clamp\(22px, 6\.4vw, 28px\);/);
  assert.match(tokens, /--type-row-title:\s*14px;/);
  assert.match(tokens, /--type-meta:\s*13px;/);
  assert.match(tokens, /--radius-icon:\s*10px;/);
  assert.match(tokens, /--surface-role-canvas:\s*var\(--page\);/);

  assert.match(responsive, /\.page-header \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
  assert.match(responsive, /\.page-header__actions \{[^}]*width:\s*auto;[^}]*justify-self:\s*end;/s);
  assert.match(responsive, /\.page-header__actions \.button \{[^}]*width:\s*auto;[^}]*min-width:\s*var\(--mobile-control-height\);[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(responsive, /\.page-header__actions\s*>\s*\*\s*\{[^}]*flex:\s*1\s+1\s+100%/s);

  for (const [name, source] of [
    ["settings", settings],
    ["members", members],
    ["reconciliation", reconciliation],
    ["allocation detail", allocation],
    ["commitments", commitments],
    ["recurring schedule", recurring],
    ["transactions", transactions],
    ["transaction history", history],
  ]) {
    assert.equal((source.match(/@media\s*\(\s*max-width\s*:\s*820px\s*\)/g) ?? []).length, 1, `${name} keeps one canonical 820px mobile block`);
  }

  assert.match(settings, /@media \(max-width: 820px\)[\s\S]*?\.serviceTile \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(settings, /\.notificationDeviceCard \{[^}]*border:\s*0;[^}]*border-top:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(settings, /\.dataStorageCard \{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--mobile-divider\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(history, /\.rowCopy > strong \{[^}]*font-size:\s*var\(--type-row-title\);/s);
  assert.match(history, /\.rowAmount \{[^}]*font-size:\s*var\(--type-meta\);/s);
});

test("reports, goals, and investments keep primary mobile copy above caption density", async () => {
  const [reports, goals, investments] = await Promise.all([
    read("src/features/reports/ReportsPage.module.css"),
    read("src/features/goals/components/GoalCards.module.css"),
    read("src/features/investments/InvestmentsPage.module.css"),
  ]);

  assert.match(reports, /@media \(max-width: 820px\)[\s\S]*?\.categoryIdentity strong \{ font-size:\s*var\(--type-row-title\); \}/s);
  assert.match(reports, /\.transactionRow strong \{ font-size:\s*var\(--type-row-title\); \}/);
  assert.match(reports, /\.transactionAmount strong \{ font-size:\s*var\(--type-meta\); \}/);
  assert.match(goals, /@media \(max-width: 820px\)[\s\S]*?\.goal-summary__description \{ font-size:\s*var\(--type-meta\); \}/s);
  assert.match(goals, /\.goal-summary \{ min-height:[^}]*border-radius:\s*var\(--radius-hero\);/s);
  assert.match(investments, /@media \(max-width: 820px\)[\s\S]*?\.segment button \{[^}]*border-radius:\s*var\(--radius-control\);[^}]*font-size:\s*var\(--type-meta\);/s);
});


test("feature CSS keeps one canonical exact 820px mobile cascade and direct colors stay allowlisted", async () => {
  const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const entries = await readdir(srcRoot, { recursive: true, withFileTypes: true });
  const cssFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => join(entry.parentPath, entry.name));

  const allowedDirectColorFiles = new Set([
    "styles/tokens.css",
    "features/auth/LoginMobile.module.css",
    "features/auth/LoginPage.module.css",
    "features/auth/components/LoginDesktopFloating.module.css",
    "components/feedback/FinancialSuccessOverlay.module.css",
  ]);

  for (const filePath of cssFiles) {
    const source = await readFile(filePath, "utf8");
    const relativePath = relative(srcRoot, filePath).replaceAll("\\", "/");
    assert.ok((source.match(/@media\s*\(\s*max-width\s*:\s*820px\s*\)/g) ?? []).length <= 1, `${relativePath} must keep one canonical exact 820px block`);
    if (!allowedDirectColorFiles.has(relativePath)) {
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${relativePath} must use semantic/brand tokens instead of direct hex colors`);
    }
  }
});
