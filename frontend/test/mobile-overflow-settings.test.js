import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("modal mobile hanya menggulir vertikal dan gesture dismiss tidak mengunci body", async () => {
  const [modal, modalSource, components] = await Promise.all([
    read("src/components/common/Modal.module.css"),
    Promise.all([read("src/components/common/Modal.jsx"), read("src/components/common/useMobileSwipeDismiss.js")]).then((parts) => parts.join("\n")),
    read("src/styles/components.css"),
  ]);
  assert.match(modal, /\.body\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(modal, /@media \(max-width: 820px\)[\s\S]*\.body\s*\{[\s\S]*scrollbar-width:\s*none;/);
  assert.match(modal, /\.body::-webkit-scrollbar\s*\{[\s\S]*width:\s*0;[\s\S]*height:\s*0;[\s\S]*display:\s*none;/);
  assert.match(modal, /\.swipeHeader\s*\{[\s\S]*touch-action:\s*pan-x pinch-zoom;/);
  assert.match(modal, /prefers-reduced-motion:[\s\S]*\.swipeEnabled \{ transition:\s*none;/);
  assert.doesNotMatch(modal, /touch-action:\s*none/);
  assert.match(modalSource, /mobileSwipeToClose = false/);
  assert.match(modalSource, /MOBILE_SWIPE_QUERY = "\(max-width: 820px\)"/);
  assert.doesNotMatch(modalSource, /47\.99rem|51\.25rem/);
  assert.match(modalSource, /event\.target\.closest\?\.\(INTERACTIVE_GESTURE_TARGET\)/);
  assert.match(components, /\.segmented-control\s*\{[\s\S]*min-inline-size:\s*0;/);
  assert.match(components, /\.form-grid,[\s\S]*\.segmented-control\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
  assert.match(components, /input\[type="file"\][\s\S]*max-width:\s*100%;/);
  assert.doesNotMatch(modal + components, /overflow-y:\s*hidden/);
});

test("filter transaksi mobile memprioritaskan filter utama dan memindahkan filter lanjutan ke dialog", async () => {
  const [transactionStyles, transactions, categoryStyles] = await Promise.all([
    read("src/features/transactions/TransactionsPage.css"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/categories/CategoriesPage.module.css"),
  ]);
  assert.match(transactions, /title="Filter lainnya"/);
  assert.match(transactions, /import "\.\/TransactionsPage\.css";/);
  assert.match(transactions, /Buka filter lainnya/);
  assert.match(transactions, /transaction-advanced-filter-grid/);
  assert.match(transactions, /Filter rekening/);
  assert.match(transactions, /Filter kategori/);
  assert.match(transactions, /Filter pencatat/);
  assert.match(transactionStyles, /\.transaction-filter-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) auto;[^}]*overflow:\s*visible;/);
  assert.match(transactionStyles, /@media \(max-width: 420px\)[\s\S]*\.transaction-filter-row\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) var\(--mobile-control-height\);/);
  assert.match(transactionStyles, /@media \(max-width: 420px\)[\s\S]*\.transaction-advanced-filter-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(transactionStyles, /\.transaction-filter-more\s*\{[^}]*min-width:\s*var\(--mobile-control-height\)/);
  assert.doesNotMatch(transactionStyles, /\.transaction-filter-row\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(categoryStyles, /\.iconGroups\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/);
  assert.doesNotMatch(categoryStyles, /\.iconGroups\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(categoryStyles, /@media \(max-width: 820px\)[\s\S]*\.categoryGroups/);
  assert.doesNotMatch(categoryStyles, /47\.99rem|51\.25rem/);
});

test("pengaturan memakai route internal dan tidak memuat semua domain pada ringkasan", async () => {
  const [app, overview, layout, notifications, integrations, members, presentation] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/settingsPresentation.js"),
  ]);
  for (const route of ["notifikasi", "integrasi", "export", "import", "backup", "pemulihan", "reset-data", "reset-semua", "periode", "audit"]) {
    assert.match(app, new RegExp(`path="${route}"`));
  }
  assert.match(app, /<Route path="anggota" element=\{routeElement\(MembersSettingsPage\)\} \/>/);
  assert.match(app, /<Route path="anggota" element=\{<Navigate to="\/anggota" replace \/>\} \/>/);
  assert.match(layout, /SETTINGS_NAVIGATION/);
  assert.match(layout, /ownerOnly/);
  assert.doesNotMatch(layout, /pengaturan\/anggota|Akses pengguna/);
  assert.match(overview, /useApiResource\("system\.health"\)/);
  assert.doesNotMatch(overview, /users\.list|audit\.list|archive\.list|periods\.list|integrations\.status/);
  assert.equal((notifications.match(/<h2 id="notification-settings-title">Notifikasi perangkat<\/h2>/g) || []).length, 1);
  assert.equal((integrations.match(/label="Google Sheets"/g) || []).length, 1);
  assert.equal((integrations.match(/label="Google Calendar"/g) || []).length, 1);
  assert.match(integrations, /providerQueueText/);
  assert.match(integrations, /Menunggu \$\{provider\.pending\}/);
  assert.match(integrations, /proses \$\{provider\.processing\}/);
  assert.match(integrations, /gagal \$\{provider\.failed \+ provider\.deadLetter\}/);
  assert.doesNotMatch(integrations, /perlu tindakan \{sheets\.deadLetter\}/);
  assert.doesNotMatch(integrations, /antrean \{sheets\.pending\}/);
  assert.match(integrations, /aria-label=\{`Status integrasi \$\{label\}`\}/);
  assert.match(integrations, />Sinkronkan Sheets sekarang<\/Button>/);
  assert.match(integrations, />Sinkronkan Calendar sekarang<\/Button>/);
  assert.doesNotMatch(integrations, /handleTile|onClick=\{\(\) => run\(provider/);
  assert.match(presentation, /integrationProviderPresentation/);
  assert.match(presentation, /Trigger belum siap/);
  assert.match(presentation, /signed health check gagal|Apps Script tidak merespons dalam batas waktu/);
  assert.match(members, /Tambah anggota/);
  assert.match(members, /Lihat aktivitas transaksi/);
  assert.match(members, /MemberActivityPanel/);
});

test("anggota memakai grid responsif dan panel aktivitas berubah full-screen pada breakpoint mobile", async () => {
  const [members, activity, styles] = await Promise.all([
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/components/MemberActivityPanel.jsx"),
    read("src/features/settings/Settings.module.css"),
  ]);

  assert.match(members, /UserAvatar/);
  assert.match(members, /photoURL:\s*user\?\.photoURL/);
  assert.match(members, /currentMemberCard/);
  assert.match(members, /roleFilter/);
  assert.match(activity, /created_by:\s*member\?\.user_id/);
  assert.match(activity, /reports\.monthly/);
  assert.match(activity, /navigate\("\/transaksi", \{ state: \{ creatorId: member\.user_id, period \} \}\)/);
  assert.match(styles, /\.memberGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.memberFacts\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.memberFacts > div \{[^}]*background:\s*var\(--surface-soft\);/);
  assert.match(styles, /\.memberFacts dd \{[^}]*margin:\s*\.3rem 0 0;/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.memberGrid \{ grid-template-columns:\s*1fr;/);
  assert.match(styles, /@media \(max-width: 26rem\)[\s\S]*\.memberFacts, \.memberActivityMetrics \{ grid-template-columns:\s*1fr;/);
  assert.match(styles, /@media \(max-width: 820px\)[\s\S]*\.memberActivityPanel \{ width:\s*100%; min-width:\s*0; height:\s*100vh; height:\s*100dvh;/);
});

test("presentasi Integrasi Google memisahkan kegagalan queue dan readiness provider", async () => {
  const { integrationProviderPresentation, providerSummary } = await import("../src/features/settings/settingsPresentation.js");
  const integration = {
    providers: {
      calendar: {
        pending: 2,
        processing: 1,
        failed: 3,
        dead_letter: 4,
        completed: 5,
        lastUpdatedAt: "2026-08-08T03:06:00.000Z",
        lastCompletedAt: "2026-08-08T03:05:00.000Z",
        lastFailureAt: "2026-08-08T03:06:00.000Z",
      },
    },
    bridge: {
      configured: true,
      checked: true,
      reachable: true,
      health: { calendarConfigured: true, jobsConfigured: true, triggerReady: false },
    },
    configured: { calendar: false },
  };
  assert.deepEqual(providerSummary(integration, "calendar"), {
    pending: 2,
    processing: 1,
    failed: 3,
    deadLetter: 4,
    completed: 5,
    lastUpdatedAt: "2026-08-08T03:06:00.000Z",
    lastCompletedAt: "2026-08-08T03:05:00.000Z",
    lastFailureAt: "2026-08-08T03:06:00.000Z",
  });
  const readiness = integrationProviderPresentation(integration, "calendar");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.label, "Trigger belum siap");

  const expired = integrationProviderPresentation({
    bridge: { configured: true, checked: true, reachable: false, errorCode: "MESSAGE_EXPIRED", liveness: { reachable: true, version: 3 } },
    configured: { drive: false },
  }, "drive");
  assert.equal(expired.ready, false);
  assert.equal(expired.label, "Gangguan");
  assert.equal(expired.errorCode, "MESSAGE_EXPIRED");
  assert.match(expired.text, /koreksi waktu otomatis/);
});


test("mobile finance forms dan planning memakai hierarchy yang compact tanpa teks mikro 9px", async () => {
  const [transactionStyles, allocations, goals, reports, pages, responsive, budgets] = await Promise.all([
    read("src/features/transactions/TransactionForm.module.css"),
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/styles/pages.css"),
    read("src/styles/responsive.css"),
    read("src/features/budgets/BudgetsPage.module.css"),
  ]);

  assert.match(transactionStyles, /@media \(max-width: 25rem\)[\s\S]*\.typeSelector\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(transactionStyles, /font-size:\s*9px/);
  assert.match(transactionStyles, /@media \(max-width: 820px\)[\s\S]*\.modal/);
  assert.doesNotMatch(transactionStyles, /47\.99rem|51\.25rem/);
  assert.match(allocations, /allocation-header-actions/);
  assert.match(allocations, /className="allocation-advanced form-grid__full"/);
  assert.match(allocations, /aria-label="Muat ulang alokasi"/);
  assert.match(allocations, /PageHeader title="Alokasi dana"/);
  assert.match(allocations, /allocation-summary/);
  assert.match(allocations, /allocation-filters/);
  assert.match(allocations, /allocation-card__expand/);
  assert.match(allocations, /FiMoreHorizontal/);
  assert.match(allocations, /mobileSwipeToClose/);
  assert.match(goals, /className="goal-card__primary-action"/);
  assert.match(goals, /className="goal-action-menu"/);
  assert.match(goals, /FiMoreHorizontal/);
  assert.match(reports, /className="report-details"/);
  assert.match(reports, /Rincian laporan/);
  assert.match(reports, /typeof window\.matchMedia === "function"/);
  assert.match(pages, /\.goal-action-menu__items/);
  assert.match(pages, /\.goal-action-menu:only-child \{ grid-column:\s*2; \}/);
  assert.match(responsive, /\.allocation-refresh-action > span \{ display:\s*none; \}/);
  assert.match(responsive, /\.allocation-header-actions--administrator \{ grid-template-columns:\s*minmax\(0, 1\.05fr\) minmax\(0, \.95fr\) var\(--mobile-control-height\); \}/);
  assert.match(responsive, /\.allocation-filters button \{ min-height:\s*var\(--mobile-control-height\);/);
  assert.doesNotMatch(pages, /allocation[^\n{]*\{[^}]*font-size:\s*9px/);
  assert.match(responsive, /\.report-details__summary \{[\s\S]*display:\s*flex;/);
  assert.doesNotMatch(budgets, /font-size:\s*9px/);

  const accountStyles = (await Promise.all([
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/accounts/components/MobileAccountActivity.module.css"),
    read("src/features/accounts/components/MobileAccountsExperience.module.css"),
    read("src/features/accounts/components/MobileAccountTransferAction.module.css"),
  ])).join("\n");
  assert.doesNotMatch(accountStyles, /font-size:\s*\.(?:55|58|62)rem;/);
  assert.match(accountStyles, /\.mobileStackBalance small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileStackSummary small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileChartLabels \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileChartStats small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileTransferSuccessRoute small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
});
