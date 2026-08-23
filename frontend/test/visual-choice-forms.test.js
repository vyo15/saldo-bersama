import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("shared visual choice control keeps radio semantics and balanced responsive grid", async () => {
  const [source, css] = await Promise.all([
    read("components/common/VisualChoiceGroup.jsx"),
    read("components/common/VisualChoiceGroup.module.css"),
  ]);
  assert.match(source, /<fieldset/);
  assert.match(source, /type="radio"/);
  assert.match(source, /required=\{required && index === 0\}/);
  assert.match(source, /mobileColumns/);
  assert.match(source, /safeMobileColumns/);
  assert.match(css, /--visual-choice-columns/);
  assert.match(css, /--visual-choice-mobile-columns/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("money in and money out use the same cash-note language with opposite arrows", async () => {
  const source = await read("components/common/FinanceChoiceIcons.jsx");
  assert.match(source, /export const MoneyInIcon/);
  assert.match(source, /export const MoneyOutIcon/);
  assert.match(source, /M12 3\.3v6/);
  assert.match(source, /M12 9\.4v-6/);
});

test("fixed-option finance forms use the shared visual selector while dynamic lists stay selects", async () => {
  const sources = await Promise.all([
    Promise.all([read("features/transactions/TransactionForm.jsx"), read("features/transactions/components/TransactionFields.jsx")]).then((parts) => parts.join("\n")),
    read("features/accounts/components/AccountEditorDialogs.jsx"),
    Promise.all([read("features/budgets/BudgetsPage.jsx"), read("features/budgets/BudgetDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    Promise.all([read("features/allocations/AllocationsPage.jsx"), read("features/allocations/AllocationDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    read("features/recurring/RecurringDialogs.jsx"),
    Promise.all([read("features/goals/GoalsPage.jsx"), read("features/goals/components/GoalDialogs.jsx")]).then((parts) => parts.join("\n")),
    read("features/categories/CategoriesPage.jsx"),
    read("features/settings/MembersSettingsPage.jsx"),
  ]);
  for (const source of sources) assert.match(source, /VisualChoiceGroup/);

  assert.match(sources[0], /legend="Jenis transaksi"/);
  assert.match(sources[0], /id="payment-method"/);
  assert.match(sources[1], /legend="Jenis rekening"/);
  assert.match(sources[1], /mobileColumns=\{2\}/);
  assert.match(sources[1], /description="Pilih jenis rekening\."/);
  assert.match(sources[2], /legend="Berlaku untuk"/);
  assert.match(sources[3], /legend="Sisa saat periode berakhir"/);
  assert.match(sources[4], /legend="Jenis"/);
  assert.match(sources[5], /legend="Jenis target"/);
  assert.match(sources[6], /legend="Dipakai untuk transaksi"/);
  assert.match(sources[7], /legend="Role"/);

  assert.match(sources[0], /<select id="source-account"/);
  assert.match(sources[1], /<select value=\{value\}/);
  assert.match(sources[2], /Kategori \*/);
  assert.match(sources[3], /Rekening sumber/);
  assert.match(sources[4], /Pilih rekening/);
  assert.match(sources[5], /Rekening tujuan/);
});
