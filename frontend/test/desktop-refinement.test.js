import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readDesktopDashboardSource, readDashboardStyleSource } from "./sourceBundles.js";

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

test("dashboard desktop memprioritaskan saldo, rekening, shortcut, aktivitas, dan ringkasan domain tanpa menyentuh curved sidebar", async () => {
  const [dashboard, styles] = await Promise.all([
    readDesktopDashboardSource(),
    readDashboardStyleSource(),
  ]);
  const header = dashboard.indexOf("<DashboardHeader");
  const metrics = dashboard.indexOf("<PrimaryMetrics");
  const attention = dashboard.indexOf("<DashboardAttention");
  const accounts = dashboard.indexOf("<AccountSelector");
  const quickActions = dashboard.indexOf("<DashboardQuickActions");
  const lowerGrid = dashboard.indexOf("desktop-lower-grid");
  const transactions = dashboard.indexOf("<AccountTransactions");
  const planning = dashboard.indexOf("<DashboardPlanning");
  const investment = dashboard.indexOf("<InvestmentWidget");
  assert.ok(header >= 0 && metrics > header && attention > metrics && accounts > attention && quickActions > accounts && lowerGrid > quickActions && transactions > lowerGrid && planning > transactions && investment > planning);
  for (const label of ["Saldo Keluarga", "Dana yang bisa kamu gunakan", "Aman dipakai / hari", "Atur Dana", "Rekening keluarga", "Target", "Investasi", "Aktivitas rekening", "Kebutuhan aktif", "Jadwal mendatang", "Target berjalan"]) assert.match(dashboard, new RegExp(label));
  assert.doesNotMatch(dashboard, /Masuk bulan ini|Keluar bulan ini|Arus uang bulan ini|Total pengeluaran bulan ini|desktop-analysis-section|StatisticsPanel/);
  assert.match(dashboard, /shared-investment-widget/);
  assert.doesNotMatch(dashboard, /Kondisi keuangan terkendali/);
  assert.match(dashboard, /<em>Tinjau<\/em>/);
  assert.doesNotMatch(dashboard, /const InsightWidget/);
  assert.match(styles, /\.desktop-overview-grid \{/);
  assert.match(styles, /\.desktop-quick-actions \{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.desktop-lower-grid \{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.58fr\) minmax\(280px, \.62fr\)/);
  assert.match(styles, /\.desktop-side-widgets \{/);
  assert.match(styles, /\.desktop-activity-list \{/);
  assert.doesNotMatch(styles, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(styles, /desktop-balance-card__sync|shared-dashboard__layout|shared-dashboard__side|desktop-balance-card__secondary|desktop-balance-card__allocation-note/);
  assert.equal((dashboard.match(/dashboardSyncLabel\(overview\.lastSyncedAt\)/g) || []).length, 1);
  assert.doesNotMatch(styles, /\.desktop-cashflow-visual/);
  assert.doesNotMatch(styles, /desktop-module-dock/, "Dashboard module tidak boleh mengubah sidebar/dock shell canonical.");
});



test("style Dashboard terpisah per ownership tanpa memutus class semantic", async () => {
  const [resolver, baseStyles, desktopStyles] = await Promise.all([
    read("src/features/dashboard/dashboardStyles.js"),
    read("src/features/dashboard/DashboardPage.module.css"),
    read("src/features/dashboard/DashboardDesktop.module.css"),
  ]);
  assert.match(resolver, /import baseStyles from "\.\/DashboardPage\.module\.css"/);
  assert.match(resolver, /import desktopStyles from "\.\/DashboardDesktop\.module\.css"/);
  assert.match(resolver, /const styleModules = \[baseStyles, desktopStyles\]/);
  assert.match(resolver, /\.flatMap\(scopedClasses\)/);
  assert.match(baseStyles, /\.mobile-finance-hero/);
  assert.doesNotMatch(baseStyles, /Desktop analytical workspace v2/);
  assert.match(desktopStyles, /Desktop analytical workspace v2/);
  assert.ok(baseStyles.split(/\r?\n/).length < 550, "Base/mobile Dashboard tidak boleh kembali menyerap seluruh refinement desktop.");
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
  assert.doesNotMatch(settingsCss, /settingsDesktopCategories/);
  assert.match(settingsCss, /\.settingsWorkspace \{[\s\S]*grid-template-columns:\s*minmax\(14rem, 16rem\) minmax\(0, 1fr\)/);
});
