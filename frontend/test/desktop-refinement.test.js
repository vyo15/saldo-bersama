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

test("dashboard desktop memprioritaskan hero saldo, shortcut, perhatian, aktivitas, lalu ringkasan domain tanpa menyentuh curved sidebar", async () => {
  const [dashboard, styles] = await Promise.all([
    readDesktopDashboardSource(),
    readDashboardStyleSource(),
  ]);
  const header = dashboard.indexOf("<DashboardHeader");
  const metrics = dashboard.indexOf("<PrimaryMetrics");
  const quickActions = dashboard.indexOf("<DashboardQuickActions");
  const attention = dashboard.indexOf("<DashboardAttention");
  const transactions = dashboard.indexOf("<AccountTransactions");
  const accounts = dashboard.indexOf("<AccountSelector");
  const planning = dashboard.indexOf("<DashboardPlanning");
  const investment = dashboard.indexOf("<InvestmentWidget");
  assert.ok(header >= 0 && metrics > header && quickActions > metrics && attention > quickActions && transactions > attention && accounts > transactions && planning > accounts && investment > planning);
  for (const label of ["Saldo Keluarga", "Dana bisa digunakan", "Aman untuk hari ini", "Sisa alokasi bulan ini", "Aksi Cepat", "Perlu dilakukan", "Rekening keluarga", "Target", "Investasi", "Aktivitas Terbaru", "Kebutuhan aktif", "Jadwal mendatang", "Target berjalan"]) assert.match(dashboard, new RegExp(label));
  assert.doesNotMatch(dashboard, /Masuk bulan ini|Keluar bulan ini|Arus uang bulan ini|Total pengeluaran bulan ini|desktop-analysis-section|StatisticsPanel/);
  assert.match(dashboard, /shared-investment-widget/);
  assert.doesNotMatch(dashboard, /Kondisi keuangan terkendali/);
  assert.match(dashboard, />Tinjau<\/span>/);
  assert.doesNotMatch(dashboard, /const InsightWidget/);
  assert.match(styles, /\.desktop-reference-summary \{/);
  assert.match(styles, /\.desktop-quick-actions \{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.desktop-reference-primary-grid \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.desktop-reference-secondary \{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.7fr\) minmax\(280px, \.7fr\)/);
  assert.match(styles, /\.desktop-side-widgets \{/);
  assert.match(styles, /\.desktop-activity-list \{/);
  assert.doesNotMatch(styles, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.equal((dashboard.match(/dashboardSyncLabel\(overview\.lastSyncedAt\)/g) || []).length, 1);
  assert.doesNotMatch(styles, /desktop-module-dock/, "Dashboard module tidak boleh mengubah sidebar/dock shell canonical.");
});


test("style Dashboard terpisah per ownership tanpa memutus class semantic", async () => {
  const [resolver, baseStyles, mobileStyles, desktopStyles] = await Promise.all([
    read("src/features/dashboard/dashboardStyles.js"),
    read("src/features/dashboard/DashboardPage.module.css"),
    read("src/features/dashboard/DashboardMobile.module.css"),
    read("src/features/dashboard/DashboardDesktop.module.css"),
  ]);
  assert.match(resolver, /import baseStyles from "\.\/DashboardPage\.module\.css"/);
  assert.match(resolver, /import mobileStyles from "\.\/DashboardMobile\.module\.css"/);
  assert.match(resolver, /import desktopStyles from "\.\/DashboardDesktop\.module\.css"/);
  assert.match(resolver, /const styleModules = \[baseStyles, mobileStyles, desktopStyles\]/);
  assert.match(resolver, /\.flatMap\(scopedClasses\)/);
  assert.match(baseStyles, /\.mobile-finance-hero/);
  assert.match(mobileStyles, /Mobile dashboard golden-reference pass/);
  assert.doesNotMatch(baseStyles, /Desktop analytical workspace v2/);
  assert.match(desktopStyles, /Desktop analytical workspace v2/);
  assert.ok(baseStyles.split(/\r?\n/).length < 550, "Base Dashboard tidak boleh kembali menyerap seluruh refinement responsive.");
  assert.ok(mobileStyles.split(/\r?\n/).length < 700, "Refinement mobile Dashboard harus tetap terisolasi dan terjaga ukurannya.");
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
