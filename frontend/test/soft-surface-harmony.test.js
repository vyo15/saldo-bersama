import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("soft-surface color hierarchy replaces decorative Card and Button outlines", async () => {
  const [tokens, card, button] = await Promise.all([
    read("styles/tokens.css"),
    read("components/common/Card.module.css"),
    read("components/common/Button.module.css"),
  ]);
  assert.match(tokens, /:root\[data-theme="dark"\][\s\S]*--surface-section-strong:/);
  assert.match(tokens, /--ui-surface-section-strong:\s*var\(--surface-section-strong\);/);
  assert.match(card, /\.card\s*\{[^}]*border:\s*1px solid transparent;/);
  assert.match(card, /\.surfaceOutlined\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--ui-surface-section\);/);
  assert.match(button, /\.button\s*\{[^}]*border:\s*1px solid transparent;[^}]*background:\s*var\(--ui-surface-section-strong\);/);
  assert.match(button, /\.primary\s*\{[^}]*background:\s*var\(--ui-primary\);/);
});

test("transaction history uses flat rows and non-outlined filter surfaces", async () => {
  const [history, transactions] = await Promise.all([
    read("features/transactions/components/MobileTransactionHistory.module.css"),
    read("features/transactions/TransactionsPage.module.css"),
  ]);
  assert.match(history, /\.groupList\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.match(history, /\.row\s*\{[^}]*border-bottom:\s*1px solid var\(--divider-soft\);/);
  assert.match(history, /\.typeScroller\s*\{[^}]*border:\s*1px solid transparent;/);
  assert.match(history, /\.typeChipActive\s*\{[^}]*background:\s*var\(--primary-soft\);[^}]*box-shadow:\s*none;/);
  assert.match(transactions, /\.ledger\s*\{[^}]*border:\s*1px solid transparent;/);
});

test("keyboard focus and validation boundaries survive visual cleanup", async () => {
  const [button, picker, selection, modal, history, transactionFields] = await Promise.all([
    read("components/common/Button.module.css"),
    read("components/common/InlineSelectionPicker.module.css"),
    read("components/common/SelectionField.module.css"),
    read("components/common/Modal.module.css"),
    read("features/transactions/components/MobileTransactionHistory.module.css"),
    read("features/transactions/MobileTransactionFields.module.css"),
  ]);
  assert.match(button, /\.button:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus-ring\)/);
  assert.match(picker, /\.shell\.invalid\s*\{\s*border-color:\s*var\(--negative\);/);
  assert.match(picker, /\.option:focus-visible/);
  assert.match(selection, /\.trigger:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus-ring\);/);
  assert.match(modal, /\.closeButton:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus-ring\);/);
  assert.match(history, /\.row:focus-visible/);
  assert.match(transactionFields, /:focus-visible/);
});
