import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("halaman Anggaran memisahkan pengelolaan dari Laporan dengan guard owner dan concurrency", async () => {
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
  assert.match(page, /user\?\.role === "owner" && period === currentPeriod/);
  assert.match(page, /row_version: existingBudget\?\.row_version/);
  assert.match(page, /idempotencyKey: createIdempotencyKey\(\)/);
  assert.match(page, /Promise\.allSettled\(\[resource\.reload\(\), refreshOverview\(\)\]\)/);
  assert.match(page, /Transfer internal tidak dihitung/);
  assert.match(page, /Anggota dapat memantau anggaran/);
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
  assert.match(moneyInput, /required=\{required\}/);
  assert.doesNotMatch(page, /<form[^>]+noValidate/);
});
