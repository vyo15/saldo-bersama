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
  assert.doesNotMatch(page, /notificationSource/);
  assert.match(page, /aria-label="Tandai semua dibaca"/);
  assert.match(page, /financialNotificationEntity/);
  assert.match(page, /financialNotificationFact/);
  assert.doesNotMatch(page, /<p className=\{styles\.note\}/);
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
  assert.doesNotMatch(mobile, /Sinkronkan data|FiRefreshCw/);
  assert.doesNotMatch(mobile, /MobileAlerts|alertsOpen|FinancialAlertList/);
  assert.match(desktop, /Perlu dilakukan/);
  assert.match(desktop, /to="\/notifikasi">Lihat semua perhatian/);
  assert.doesNotMatch(desktop, /Sinkronkan data|FiRefreshCw/);
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
  assert.match(page, /contextLocked/);
  assert.match(page, /attentionFromNotification/);
  assert.match(form, /Saldo tercatat di aplikasi/);
  assert.match(form, /Apakah saldo yang Anda lihat di bank juga/);
  assert.match(form, /Ya, saldonya sama/);
  assert.match(form, /Tidak, berbeda/);
  assert.match(form, /Saldo aktual di bank/);
  assert.match(form, /Dipilih otomatis/);
  assert.match(form, /Saldo tidak diubah otomatis/);
  assert.doesNotMatch(page, /actual_balance:\s*accountSystemBalance|actual_balance:\s*selectedAccount/);
});


test("presentation notifikasi ringkas memakai aksi entitas dan satu fakta untuk tipe utama", async () => {
  const module = await import("../src/shared/workflows/financialNotifications.js");
  const cases = [
    [{ type: "budget_threshold", title: "Makan 85% terpakai", message: "Pemakaian melewati ambang 80%." }, ["Periksa anggaran", "Makan", "85% terpakai"]],
    [{ type: "envelope_threshold", title: "Belanja 90% terpakai + dipesan", message: "Dana tersisa mendekati batas." }, ["Periksa Alokasi Dana", "Belanja", "90% terpakai + dipesan"]],
    [{ type: "recurring_due", title: "Internet segera jatuh tempo", message: "Jatuh tempo 2026-09-09." }, ["Jadwal segera jatuh tempo", "Internet", "Jatuh tempo 9 September 2026"]],
    [{ type: "goal_behind", title: "Dana Darurat tertinggal dari rencana", message: "Perkiraan kebutuhan setoran bulanan Rp 750.000." }, ["Target tertinggal", "Dana Darurat", "Butuh sekitar Rp 750.000/bulan"]],
    [{ type: "unallocated_expense", title: "3 pengeluaran belum masuk Alokasi Dana", message: "Pilih Alokasi Dana agar akurat." }, ["Alokasikan pengeluaran", "3 pengeluaran", "Belum masuk Alokasi Dana"]],
  ];
  for (const [alert, expected] of cases) {
    assert.deepEqual([
      module.financialNotificationTitle(alert),
      module.financialNotificationEntity(alert),
      module.financialNotificationFact(alert),
    ], expected);
  }
});


test("notification center dan rekonsiliasi menjaga target sentuh mobile canonical", async () => {
  const [notificationsCss, reconciliationCss] = await Promise.all([
    source("src/features/notifications/NotificationsPage.module.css"),
    source("src/features/reconciliations/ReconciliationsPage.module.css"),
  ]);

  assert.match(notificationsCss, /\.back, \.readAll \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(notificationsCss, /\.filter \{[^}]*min-height:\s*var\(--control-height-md\);/s);
  assert.match(notificationsCss, /@media \(max-width: 820px\)[\s\S]*\.readAll,\s*\.filter \{ min-height:\s*var\(--mobile-control-height\); \}/s);
  assert.match(notificationsCss, /@media \(max-width: 380px\)[\s\S]*\.back, \.readAll \{ width:\s*var\(--mobile-control-height\); height:\s*var\(--mobile-control-height\); \}/s);
  assert.match(reconciliationCss, /@media \(max-width: 820px\)[\s\S]*\.notesToggle \{ min-height:\s*var\(--mobile-control-height\); \}/s);
});


test("Notification Center meneruskan contextual workflow dan Investasi tidak kembali ke generic reconciliation", async () => {
  const [attention, alerts, notifications, investments, readModels, reconciliationService] = await Promise.all([
    source("src/hooks/useDashboardAttentionState.js"),
    source("src/shared/workflows/financialAlerts.js"),
    source("src/shared/workflows/financialNotifications.js"),
    source("src/features/investments/InvestmentsPage.jsx"),
    source("../api/_lib/services/readModels.js"),
    source("../api/_lib/services/reporting/reconciliations.js"),
  ]);

  assert.match(attention, /ATTENTION_SOURCES = new Set\(\["dashboard", "notification-center"\]\)/);
  assert.match(attention, /isFinancialAttentionState/);
  assert.match(alerts, /investment_reconciliation_stale/);
  assert.match(alerts, /attentionRdnAccountId/);
  assert.match(notifications, /Cocokkan investasi/);
  assert.match(notifications, /Jadwal segera jatuh tempo/);
  assert.match(notifications, /Periksa anggaran/);
  assert.match(notifications, /Periksa Alokasi Dana/);
  assert.match(notifications, /Target tertinggal/);
  assert.doesNotMatch(notifications, /financialNotificationCategory/);
  assert.match(investments, /useInvestmentAttentionReconciliation/);
  assert.match(investments, /mode: "reconcile"/);
  assert.match(investments, /returnTo: attention\.attentionSource === "notification-center" \? "\/notifikasi"/);
  assert.match(investments, /investments:attention-portfolio-missing/);
  assert.match(readModels, /can_reconcile: canOperate && item\.account_type !== "investment"/);
  assert.match(reconciliationService, /INVESTMENT_RECONCILIATION_REQUIRED/);
});
