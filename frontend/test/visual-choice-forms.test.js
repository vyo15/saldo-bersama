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
  assert.match(source, /descriptive/);
  assert.match(source, /denseTiles/);
  assert.match(source, /helperPanel/);
  assert.match(source, /Icon \? <span className=\{styles\.iconWrap\}/);
  assert.match(css, /--visual-choice-columns/);
  assert.match(css, /--visual-choice-mobile-columns/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.descriptive \.card/);
  assert.match(css, /\.selectionMark/);
  assert.match(css, /color:\s*inherit/);
  assert.match(css, /color-mix\(in srgb, currentColor 42%, var\(--border\)\)/);
  assert.match(css, /\.helperPanel/);
  assert.match(css, /\.compact \.card\.noIcon/);
  assert.match(css, /\.denseTiles \.card/);
  assert.match(css, /\.card\.refund/);
});

test("money in and money out use the same cash-note language with opposite arrows", async () => {
  const source = await read("components/common/FinanceChoiceIcons.jsx");
  assert.match(source, /export const MoneyInIcon/);
  assert.match(source, /export const MoneyOutIcon/);
  assert.match(source, /M12 3\.3v6/);
  assert.match(source, /M12 9\.4v-6/);
});

test("fixed-option finance forms use visual choices and dynamic app-owned lists use SelectionField", async () => {
  const sources = await Promise.all([
    Promise.all([read("features/transactions/TransactionForm.jsx"), read("features/transactions/components/TransactionFields.jsx")]).then((parts) => parts.join("\n")),
    read("features/accounts/components/AccountEditorDialogs.jsx"),
    read("features/budgets/BudgetDialogLayer.jsx"),
    Promise.all([read("features/allocations/AllocationsPage.jsx"), read("features/allocations/AllocationDialogLayer.jsx")]).then((parts) => parts.join("\n")),
    read("features/recurring/RecurringDialogs.jsx"),
    Promise.all([read("features/goals/GoalsPage.jsx"), read("features/goals/components/GoalDialogs.jsx")]).then((parts) => parts.join("\n")),
    read("features/categories/CategoriesPage.jsx"),
    read("features/settings/MembersSettingsPage.jsx"),
  ]);
  for (const source of sources) assert.match(source, /VisualChoiceGroup/);

  assert.match(sources[0], /legend="Jenis transaksi"/);
  assert.match(sources[0], /SelectionControl/);
  assert.match(sources[1], /legend="Jenis rekening"/);
  assert.match(sources[1], /mobileColumns=\{2\}/);
  assert.match(sources[1], /SelectionField/);
  assert.match(sources[2], /label="Kategori"/);
  assert.match(sources[3], /label="Ambil dana dari"/);
  assert.match(sources[4], /label = "Rekening default"/);
  assert.match(sources[5], /label="Rekening tujuan"/);
  assert.match(sources[6], /SelectionField/);
  assert.match(sources[7], /SelectionField/);

  for (const source of sources) assert.doesNotMatch(source, /<select\b/);
});

test("descriptive fixed choices keep explanatory decisions calm and consistent", async () => {
  const [budgets, recurring, allocations] = await Promise.all([
    read("features/budgets/BudgetDialogLayer.jsx"),
    read("features/recurring/RecurringDialogs.jsx"),
    read("features/allocations/AllocationDialogLayer.jsx"),
  ]);
  assert.match(budgets, /legend="Cara mencatat kebutuhan"[\s\S]*descriptive[\s\S]*helperPanel/);
  assert.match(budgets, /<InlineOwnershipPicker[\s\S]*legend="Berlaku untuk"/);
  assert.match(recurring, /legend="Jenis"[\s\S]*columns=\{2\}[\s\S]*descriptive/);
  assert.match(allocations, /legend="Aksi"[\s\S]*columns=\{2\}[\s\S]*descriptive/);
});



test("ownership identity picker stays compact until expanded inline", async () => {
  const [source, css, allocation, budgets] = await Promise.all([
    read("components/common/InlineOwnershipPicker.jsx"),
    read("components/common/InlineOwnershipPicker.module.css"),
    read("features/allocations/AllocationDialogLayer.jsx"),
    read("features/budgets/BudgetDialogLayer.jsx"),
  ]);

  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{listId\}/);
  assert.match(source, /setExpanded\(false\)/);
  assert.match(source, /alternatives = safeOptions\.filter/);
  assert.match(source, /<UserAvatar user=\{option\.user\}/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(css, /grid-template-rows:\s*0fr/);
  assert.match(css, /grid-template-rows:\s*1fr/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(allocation, /<InlineOwnershipPicker[\s\S]*legend="Digunakan oleh"/);
  assert.match(allocation, /badge: item\.role/);
  assert.match(budgets, /<InlineOwnershipPicker[\s\S]*legend="Berlaku untuk"/);
  assert.doesNotMatch(allocation, /mobileColumns=\{Math\.min\(assigneeOptions\.length, 2\)\}/);
});

test("SelectionField keeps app-owned selection accessible without native browser dropdowns", async () => {
  const [source, css] = await Promise.all([
    read("components/common/SelectionField.jsx"),
    read("components/common/SelectionField.module.css"),
  ]);
  assert.match(source, /role="combobox"/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /aria-selected=\{isSelected\}/);
  assert.match(source, /type="search"/);
  assert.match(source, /normalize\(option\.keywords\)/);
  assert.match(source, /groups = \[\]/);
  assert.match(source, /SelectionGroups/);
  assert.match(source, /SelectionVisual/);
  assert.match(source, /option\.avatar/);
  assert.match(source, /option\.image/);
  assert.match(source, /option\.mark/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /Home/);
  assert.match(source, /End/);
  assert.match(source, /document\.addEventListener\("keydown"/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /\.trigger,\s*\n\s*\.compact \.trigger,\s*\n\s*\.embedded \.trigger,\s*\n\s*\.search,\s*\n\s*\.search input \{\s*\n\s*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(css, /\.option \{[^}]*min-height:\s*var\(--control-height-md\);/s);
  assert.match(css, /\.triggerValue \{[^}]*font-size:\s*var\(--font-size-body-sm\);/s);
  assert.match(css, /\.optionMeta \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(css, /\.groupLabel \{/);
  assert.match(css, /\.visual \{/);
  assert.match(css, /\.imageVisual \{/);
  assert.match(css, /\.brandLogoVisual \{/);
  assert.match(css, /\.markVisual \{/);
  assert.match(css, /\.search \{[^}]*position:\s*sticky;/s);
});

test("dynamic finance selectors expose canonical visual identity helpers", async () => {
  const [visuals, accounts, transactions, reconciliation, investments] = await Promise.all([
    read("components/common/selectionOptionVisuals.js"),
    read("features/accounts/components/AccountEditorDialogs.jsx"),
    read("features/transactions/TransactionsPage.jsx"),
    read("features/reconciliations/components/ReconciliationForm.jsx"),
    read("features/investments/InvestmentDialog.jsx"),
  ]);
  assert.match(visuals, /accountOptionVisual/);
  assert.match(visuals, /accountBrandLogo/);
  assert.match(visuals, /imageKind: "brand-logo"/);
  assert.match(visuals, /categoryOptionVisual/);
  assert.match(visuals, /memberOptionVisual/);
  assert.match(visuals, /instrumentOptionVisual/);
  assert.match(visuals, /allocationOptionVisual/);
  assert.match(accounts, /bankTemplateOptionVisual/);
  assert.match(accounts, /ewalletTemplateOptionVisual/);
  assert.match(transactions, /memberOptionVisual/);
  assert.match(reconciliation, /accountOptionVisual/);
  assert.match(reconciliation, /searchable=\{accounts\.length > 8\}/);
  assert.match(investments, /instrumentOptionVisual/);
});
