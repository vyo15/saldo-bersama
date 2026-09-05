import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

test("notification center memakai alert dashboard canonical tanpa membuat mutation authority baru", async () => {
  const [page, state, presentation, app] = await Promise.all([
    source("src/features/notifications/NotificationsPage.jsx"),
    source("src/shared/workflows/financialNotifications.js"),
    source("src/shared/workflows/financialAlerts.js"),
    source("src/app/App.jsx"),
  ]);

  assert.match(app, /path="notifikasi"/);
  assert.match(page, /useFinance\(\)/);
  assert.match(page, /overview\?\.alerts \|\| \[\]/);
  assert.match(page, /financialAlertGuidance\(alert, \{ source: "notification-center" \}\)/);
  assert.match(page, /notificationSource: "notification-center"/);
  assert.match(page, /Tandai dibaca/);
  assert.match(page, /kondisi keuangan aktif/);
  assert.match(state, /localStorage/);
  assert.match(state, /READ_TTL_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(state, /STORAGE_PREFIX = "saldo-bersama:notification-center-read:v1:"/);
  assert.match(presentation, /attentionSource: source/);
  assert.doesNotMatch(page, /apiClient|notification_queue|createTransaction|adjustment|updateBalance/);
});

test("dashboard hanya menampilkan next action utama dan desktop/mobile mengarah ke notification center", async () => {
  const [mobile, desktop, css] = await Promise.all([
    source("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    source("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    source("src/features/dashboard/DashboardPage.module.css"),
  ]);

  assert.match(mobile, /const alert = alerts\[0\]/);
  assert.match(mobile, /Perlu dilakukan/);
  assert.match(mobile, /to="\/notifikasi"/);
  assert.match(mobile, /mobile-notification-badge/);
  assert.doesNotMatch(mobile, /MobileAlerts|alertsOpen|FinancialAlertList/);
  assert.match(desktop, /Notifikasi aktif/);
  assert.match(desktop, /to="\/notifikasi">Buka notifikasi/);
  assert.doesNotMatch(desktop, /FinancialAlertList|title="Perlu perhatian"/);
  assert.match(css, /\.mobile-next-action\s*\{/);
  assert.match(css, /\.mobile-notification-badge\s*\{/);
  assert.doesNotMatch(css, /\.mobile-notification-badge[^}]*font-size:\s*9px/s);
});

test("rekonsiliasi tidak menganggap saldo sistem sebagai saldo aktual sebelum konfirmasi user", async () => {
  const [page, form] = await Promise.all([
    source("src/features/reconciliations/ReconciliationsPage.jsx"),
    source("src/features/reconciliations/components/ReconciliationForm.jsx"),
  ]);

  assert.match(page, /actual_balance: "", notes: ""/);
  assert.match(page, /Rekening dari pengingat sudah dipilih/);
  assert.match(form, /Saldo tercatat di aplikasi/);
  assert.match(form, /Apakah saldo di bank juga/);
  assert.match(form, /Ya, saldonya sama/);
  assert.match(form, /Tidak, berbeda/);
  assert.match(form, /Saldo sebenarnya di bank/);
  assert.match(form, /Saldo tidak diubah otomatis/);
  assert.doesNotMatch(page, /actual_balance:\s*accountSystemBalance|actual_balance:\s*selectedAccount/);
});
