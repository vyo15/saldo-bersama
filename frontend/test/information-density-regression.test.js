import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("Atur Dana preserves active search and scope filters for mobile when items exist", async () => {
  const [overview, css] = await Promise.all([
    source("features/allocations/AllocationOverviewLayer.jsx"),
    source("features/allocations/AllocationOverview.module.css"),
  ]);
  assert.match(overview, /allocationRows\.length \? <PlanningToolbar/);
  assert.match(overview, /filterPlanningActiveItemsByQuery\(visibleItems, query\)/);
  assert.match(overview, /type="search"/);
  assert.match(overview, /showFilter=\{ownership\.showFilter\}/);
  const mobile = css.match(/@media \(max-width: 820px\)\s*\{([\s\S]*?)\n\}\s*\n@media \(max-width: 360px\)/)?.[1] || "";
  assert.match(mobile, /\.allocation-toolbar\s*\{\s*gap: 8px/);
  assert.doesNotMatch(mobile, /\.allocation-toolbar\s*\{\s*display:\s*none/);
});

test("Atur Dana distinguishes no accounts from no free funds and avoids a second hero artwork", async () => {
  const overview = await source("features/allocations/AllocationOverviewLayer.jsx");
  assert.match(overview, /!accounts\.length/);
  assert.match(overview, /Belum ada rekening/);
  assert.match(overview, /Belum ada dana bebas\. Alokasi bisa disiapkan dulu\./);
  assert.match(overview, /totalItems \? "Tidak ada hasil" : "Belum ada alokasi aktif"/);
  assert.match(overview, /icon=\{FiInbox\}/);
  assert.doesNotMatch(overview, /0 rekening sumber/);
  assert.doesNotMatch(overview, /illustration=\{allocationArt\.empty/);
});

test("Detailed recurring, commitment and investment facts remain available on demand", async () => {
  const [schedule, commitment, investment] = await Promise.all([
    source("features/recurring/RecurringSchedule.jsx"),
    source("features/commitments/CommitmentsPage.jsx"),
    source("features/investments/InvestmentOverview.jsx"),
  ]);
  assert.match(schedule, /<details className=\{styles\.scheduleDisclosure\}>/);
  assert.match(schedule, /Rincian jadwal/);
  assert.match(schedule, /accountLabel/);
  assert.match(commitment, /<details className=\{styles\.cardDetails\}>/);
  assert.match(commitment, /Dibayar dari/);
  assert.match(commitment, /balance_needs_update/);
  assert.match(investment, /<details className=\{activityStyles\.activityInfo\}>/);
  assert.match(investment, /bukan data pasar live/);
});

test("Dashboard transaction metadata stays compact without hiding provenance from screen readers", async () => {
  const dashboard = await source("features/dashboard/components/MobileFinanceDashboard.jsx");
  assert.match(dashboard, /aria-label=\{`Buka detail \$\{title\}, dicatat \$\{transactionCreatorLabel\(item\)\}`\}/);
  assert.match(dashboard, /<small>\{formatTransactionDate\(item\.transaction_date\)\} · \{contextLabel\}<\/small>/);
  assert.doesNotMatch(dashboard, /item\.scope === "shared"/);
});
