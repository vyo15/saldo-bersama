import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("halaman Anggaran memisahkan pengelolaan dari Laporan dengan guard Administrator dan concurrency", async () => {
  const [app, page, api, reports, dashboard, navigation] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/features/budgets/budgets.api.js"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/config/navigation.js"),
  ]);

  assert.match(app, /path="anggaran"/);
  assert.match(page, /useApiResource\("budgets\.list", \{ period \}\)/);
  assert.match(page, /administratorMode && period === currentPeriod/);
  assert.match(page, /row_version: existingBudget\?\.row_version/);
  assert.doesNotMatch(page, /createIdempotencyKey|idempotencyKey:/, "Anggaran harus memakai mutation intent canonical dari apiClient, bukan membuat key per klik");
  assert.match(page, /Promise\.allSettled\(\[resource\.reload\(\), refreshOverview\(\)\]\)/);
  assert.doesNotMatch(page, /Transfer internal tidak dihitung/);
  assert.match(page, /Member dapat memantau anggaran/);
  assert.match(api, /budgets\.upsert/);
  assert.match(api, /budgets\.archive/);
  assert.match(reports, /to="\/anggaran"/);
  assert.doesNotMatch(reports, /upsertBudget|archiveBudget|MoneyInput/);
  assert.match(dashboard, /to="\/anggaran"/);
  assert.match(navigation, /to: "\/anggaran", label: "Anggaran"/);
});

test("form Anggaran mempertahankan validasi nominal, kategori aktif, dan ambang batas", async () => {
  const [page, moneyInput] = await Promise.all([
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/components/common/MoneyInput.jsx"),
  ]);
  assert.match(page, /assertPositiveRupiah\(form\.amount\)/);
  assert.match(page, /item\.status === "active" && item\.transaction_type === "expense"/);
  assert.match(page, /type="number" min="50" max="100"/);
  assert.match(page, /Berlaku untuk/);
  assert.match(page, /budgetOwnershipUpdates/);
  assert.match(page, /\{ \.\.\.nextForm, amount: "", warning_threshold: 80 \}/);
  assert.match(page, /useApiResource\("users\.list"/);
  assert.match(page, /Untuk jatah per orang dari rekening bersama, gunakan Alokasi/);
  assert.match(moneyInput, /required=\{required\}/);
  assert.doesNotMatch(page, /<form[^>]+noValidate/);
});


test("UI Anggaran memakai hero, pacing marker, filter perhatian, dan ikon kategori existing", async () => {
  const [page, card, pacing, hero, presentation] = await Promise.all([
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/features/budgets/components/BudgetInsightCard.jsx"),
    read("src/features/budgets/components/BudgetPacingBar.jsx"),
    read("src/features/budgets/components/BudgetHeroCard.jsx"),
    read("src/features/budgets/budgetPresentation.js"),
  ]);

  assert.match(page, /BudgetHeroCard/);
  assert.match(page, /Perlu perhatian/);
  assert.match(page, /Paling kritis/);
  assert.match(card, /categoryIcon\(category\?\.icon, "expense"\)/);
  assert.match(card, /Batas aman \/ hari/);
  assert.match(pacing, /Hari ini/);
  assert.match(pacing, /role="img"/);
  assert.match(hero, /Sisa anggaran bulan ini/);
  assert.match(presentation, /usedPercent > Number\(periodMeta\.elapsedPercent \|\| 0\) \+ 8/);
});
