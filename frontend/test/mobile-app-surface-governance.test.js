import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
