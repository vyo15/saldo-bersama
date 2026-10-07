import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("settings desktop keeps navigation label-first and mobile secondary copy compact", async () => {
  const [layout, page, styles] = await Promise.all([
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/Settings.module.css"),
  ]);

  assert.doesNotMatch(layout, /<small>\{item\.description\}<\/small>/);
  assert.doesNotMatch(layout, /settingsDesktopDetailHeader[\s\S]*?<p>\{meta\.summary/);
  assert.doesNotMatch(page, /Pilih kategori di kiri lalu submenu/);
  assert.match(styles, /@media \(min-width: 821px\)[\s\S]*\.settingsWorkspace[\s\S]*border:\s*0;/);
  assert.match(styles, /\.settingsDesktopSubmenuCopy small \{ display:\s*none; \}/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.settingsListCopy small[\s\S]*-webkit-line-clamp:\s*1;/);
});

test("desktop transaction hierarchy prioritizes history before repeat shortcuts", async () => {
  const [workspace, styles] = await Promise.all([
    read("src/features/transactions/components/DesktopTransactionWorkspace.jsx"),
    read("src/features/transactions/TransactionsPage.module.css"),
  ]);

  const resultsIndex = workspace.indexOf("{results}");
  const repeatIndex = workspace.indexOf("<RepeatStrip", resultsIndex);
  assert.ok(resultsIndex >= 0 && repeatIndex > resultsIndex, "repeat shortcuts must stay after transaction results");
  assert.match(workspace, />Riwayat transaksi<\/h2>/);
  assert.doesNotMatch(workspace, /Satu composer, langsung terarah|Gunakan pencarian dan filter untuk mempersempit daftar/);
  assert.match(styles, /\.historyPanel[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/);
  assert.match(styles, /\.repeatCard[\s\S]*border-bottom:\s*1px solid var\(--border\);/);
});

test("dashboard and allocation repeated modules use quieter row hierarchy", async () => {
  const [quickActions, dashboardStyles, allocationStyles] = await Promise.all([
    read("src/features/dashboard/components/DashboardQuickActions.jsx"),
    read("src/features/dashboard/DashboardDesktop.module.css"),
    read("src/features/allocations/AllocationOverview.module.css"),
  ]);

  assert.doesNotMatch(quickActions, /description:/);
  assert.match(dashboardStyles, /\.desktop-quick-action \+[\s\S]*border-left:\s*1px solid var\(--divider-soft\);/);
  assert.match(dashboardStyles, /\.desktop-reference-secondary \.desktop-summary-widget[\s\S]*border:\s*0;/);
  assert.match(allocationStyles, /\.planning-active-list[\s\S]*border-top:\s*1px solid var\(--border\);/);
  assert.match(allocationStyles, /\.planning-active-row[\s\S]*border-width:\s*0;[\s\S]*border-bottom:\s*1px solid var\(--border\);/);
});
