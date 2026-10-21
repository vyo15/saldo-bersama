import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Atur Dana tidak lagi menumpuk tab domain dan segmented filter", async () => {
  const [page, css] = await Promise.all([read("features/allocations/AllocationOverviewLayer.jsx"), read("features/allocations/AllocationOverview.module.css")]);
  assert.doesNotMatch(page, /AllocationPlanningNav|QuickSegmentedFilter|PlanningCreateLauncher|Tambah lainnya/);
  assert.doesNotMatch(css, /allocation-planning-nav|planning-create-option/);
  assert.match(page, /<AllocationQuickLinks \/>/);
  assert.match(page, /<PlanningFilterDialog open=\{filterOpen\}/);
  assert.match(page, /<AllocationListHeader hasItems=\{allocationRows.length > 0\}/);
  assert.match(page, /rows\.filter\(\(row\) => row.kind === "allocation"\)/);
  assert.match(page, /planningRowAudience\(row, actor\)/);
  assert.match(page, /aria-pressed=\{value === option.value\}/);
});

test("Jadwal, Kewajiban, dan Target tetap punya rute sekali ketuk", async () => {
  const page = await read("features/allocations/AllocationOverviewLayer.jsx");
  for (const path of ["/perencanaan/jadwal", "/perencanaan/komitmen", "/target"]) assert.ok(page.includes(`to: "${path}"`), `Rute ${path} hilang`);
  assert.match(page, /onClick=\{\(\) => \{ onChange\(option.value\); onClose\(\); \}\}/);
  assert.match(page, /setSearchOpen\(\(current\) => !current\)/);
  assert.match(page, /clearFilter=\{\(\) => \{ setAllocationFilter\("all"\); setQuery\(""\); \}\}/);
});
