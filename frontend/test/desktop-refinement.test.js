import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readDesktopDashboardSource } from "./sourceBundles.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("breakpoint desktop semantic tetap memakai boundary mobile canonical 820/821", async () => {
  const layout = await read("src/config/layout.js");
  assert.match(layout, /mobileMax:\s*820/);
  assert.match(layout, /desktopMin:\s*821/);
  assert.match(layout, /compactDesktopMax:\s*1023/);
  assert.match(layout, /standardDesktopMin:\s*1024/);
  assert.match(layout, /wideDesktopMin:\s*1280/);
  assert.match(layout, /ultraWideDesktopMin:\s*1600/);
  assert.match(layout, /compactDesktop:/);
  assert.match(layout, /wideDesktop:/);
});

test("shell desktop memberi notification entry point dan account menu aksesibel", async () => {
  const shell = await read("src/layouts/AppShell.jsx");
  assert.match(shell, /desktop-notification-button/);
  assert.match(shell, /notificationState\.unreadCount/);
  assert.match(shell, /aria-haspopup="menu"/);
  assert.match(shell, /aria-expanded=\{accountMenuOpen\}/);
  assert.match(shell, /role="menu"/);
  assert.match(shell, /role="menuitem"/);
  assert.match(shell, /event\.key !== "Escape"/);
  assert.match(shell, /accountMenuTriggerRef\.current\?\.focus\(\)/);
});

test("dashboard desktop memprioritaskan saldo, attention, aktivitas, lalu perencanaan tanpa menyentuh curved sidebar", async () => {
  const [dashboard, styles] = await Promise.all([
    readDesktopDashboardSource(),
    read("src/features/dashboard/DashboardPage.module.css"),
  ]);
  const header = dashboard.indexOf("<DashboardHeader");
  const metrics = dashboard.indexOf("<PrimaryMetrics");
  const attention = dashboard.indexOf("<DashboardAttention");
  const analysis = dashboard.indexOf('desktop-analysis-section');
  const accounts = dashboard.indexOf("<AccountSelector");
  const transactions = dashboard.indexOf("<AccountTransactions");
  const planning = dashboard.indexOf("<DashboardPlanning");
  assert.ok(header >= 0 && metrics > header && attention > metrics && analysis > attention && accounts > analysis && transactions > accounts && planning > transactions);
  for (const label of ["Dana Tersedia", "Saldo rekening", "Aman dipakai / hari", "Masuk bulan ini", "Keluar bulan ini", "Atur Dana", "Rekening", "Target", "Cocokkan", "Transaksi terbaru", "Perencanaan keuangan"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /shared-investment-widget/);
  assert.match(dashboard, /Kondisi keuangan terkendali/);
  assert.match(dashboard, /<em>Tinjau<\/em>/);
  assert.doesNotMatch(dashboard, /const InsightWidget/);
  assert.match(styles, /\.desktop-overview-grid \{/);
  assert.match(styles, /\.shared-dashboard-widgets \{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.desktop-cashflow-visual \{/);
  assert.match(styles, /\.desktop-analysis-grid \{/);
  assert.doesNotMatch(styles, /desktop-module-dock/, "Dashboard module tidak boleh mengubah sidebar/dock shell canonical.");
});

test("notification center dan settings mempunyai presentation desktop khusus", async () => {
  const [notifications, notificationCss, settingsCss] = await Promise.all([
    read("src/features/notifications/NotificationsPage.jsx"),
    read("src/features/notifications/NotificationsPage.module.css"),
    read("src/features/settings/Settings.module.css"),
  ]);
  assert.match(notifications, /<PageHeader/);
  assert.match(notifications, /Tandai semua dibaca/);
  assert.match(notifications, /filterCounts/);
  assert.match(notificationCss, /@media \(min-width: 821px\)[\s\S]*\.header \{ display: none; \}/);
  assert.match(settingsCss, /@media \(max-width: 1060px\) and \(min-width: 821px\)[\s\S]*\.settingsDesktopCategories \{ display: none; \}/);
  assert.match(settingsCss, /grid-template-columns:\s*minmax\(12\.5rem, 15rem\) minmax\(0, 1fr\)/);
});
