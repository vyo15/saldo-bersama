import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("dashboard desktop memprioritaskan financial pulse dan attention sebelum workspace detail", async () => {
  const dashboard = await read("src/features/dashboard/components/DesktopFinanceDashboard.jsx");
  const header = dashboard.indexOf("<DashboardHeader");
  const metrics = dashboard.indexOf("<PrimaryMetrics");
  const attention = dashboard.indexOf("<DashboardAttention");
  const workspace = dashboard.indexOf('shared-dashboard__layout');
  assert.ok(header >= 0 && metrics > header && attention > metrics && workspace > attention);
  for (const label of ["Saldo rekening", "Aman digunakan", "Arus kas bersih", "Sisa anggaran"]) assert.match(dashboard, new RegExp(label));
  assert.match(dashboard, /Kondisi keuangan terkendali/);
  assert.match(dashboard, /Tinjau sekarang/);
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
