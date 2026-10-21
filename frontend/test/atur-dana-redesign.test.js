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

// Static contract: these exact route, tone and audience values cross the JSX/CSS boundary.
test("Soft Chroma maps all three planning links and recipient scopes without adding navigation", async () => {
  const [page, css, tokens] = await Promise.all([
    read("features/allocations/AllocationOverviewLayer.jsx"),
    read("features/allocations/AllocationOverview.module.css"),
    read("styles/tokens.css"),
  ]);
  const destinations = [
    ["/perencanaan/jadwal", "recurring"],
    ["/perencanaan/komitmen", "commitment"],
    ["/target", "goal"],
  ];
  for (const [route, tone] of destinations) {
    assert.match(page, new RegExp(`to: "${route}"[^\n]+tone: "${tone}"`));
    assert.match(css, new RegExp(`\\.allocation-shortcuts__link\\[data-tone="${tone}"\\]`));
    assert.match(tokens, new RegExp(`--planning-${tone}:`));
    assert.match(tokens, new RegExp(`--planning-${tone}-soft:`));
  }
  assert.match(page, /data-tone=\{tone\}/);
  assert.match(page, /data-audience=\{audience\}/);
  assert.match(page, /data-audience=\{allocationFilter === "all" \? undefined : allocationFilter\}/);
  assert.match(page, /data-audience=\{option.value === "all" \? undefined : option.value\}/);
  assert.match(page, /aria-pressed=\{value === option.value\}/);
  assert.match(page, /const audience = planningRowAudience\(row, actor\)/);
  assert.match(page, /"Untuk saya"/);
  assert.match(page, /"Untuk bersama"/);
  assert.match(page, /`Untuk \$\{recipientName \|\| "pasangan"\}`/);
  for (const scope of ["mine", "partner", "shared"]) {
    assert.match(css, new RegExp(`\\.planning-active-row__audience\\[data-audience="${scope}"\\]`));
    assert.match(css, new RegExp(`\\.allocation-audience-trigger\\[data-audience="${scope}"\\]`));
    assert.match(css, new RegExp(`\\.allocation-audience-options__item\\.is-selected\\[data-audience="${scope}"\\]`));
  }
  assert.doesNotMatch(css, /data-audience="other"/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "Feature CSS must reference theme tokens, not hardcoded colors");
  assert.match(css, /\.allocation-shortcuts__link \{[^}]*background: var\(--surface-section\)/);
  assert.match(css, /\.allocation-audience-trigger,\s*\.allocation-search-trigger \{[^}]*min-height: 44px/);
  assert.doesNotMatch(page, /QuickSegmentedFilter|AllocationPlanningNav/);
});
