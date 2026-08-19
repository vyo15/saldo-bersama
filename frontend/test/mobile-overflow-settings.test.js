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
  assert.match(modalSource, /mobileSwipeToClose = true/);
  assert.match(modalSource, /MOBILE_SWIPE_QUERY = "\(max-width: 820px\)"/);
  assert.doesNotMatch(modalSource, /47\.99rem|51\.25rem/);
  assert.match(modalSource, /event\.target\.closest\?\.\(INTERACTIVE_GESTURE_TARGET\)/);
  assert.match(modalSource, /const finalizeClose = useCallback/);
  assert.match(modalSource, /if \(!enabled \|\| !isMobileSwipeViewport\(\) \|\| prefersReducedMotion\(\)\) \{ finalizeClose\(\); return; \}/);
  assert.match(modalSource, /dismissTimerRef\.current = window\.setTimeout\(finalizeClose, SWIPE_DISMISS_DURATION_MS\)/);
  assert.match(modalSource, /event\.target === event\.currentTarget\) closeModal\(\)/);
  assert.match(modalSource, /onEscape: canDismiss \? closeModal : undefined/);
  assert.match(modal, /\.backdropDismissing \{ opacity:\s*0; \}/);
  assert.match(components, /\.segmented-control\s*\{[\s\S]*min-inline-size:\s*0;/);
  assert.match(components, /\.form-grid,[\s\S]*\.segmented-control\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
  assert.match(components, /input\[type="file"\][\s\S]*max-width:\s*100%;/);
  assert.doesNotMatch(modal + components, /overflow-y:\s*hidden/);
});

test("filter transaksi mobile memprioritaskan history, filter cepat, dan dialog lanjutan", async () => {
  const [transactions, mobileHistory, mobileStyles, categoryStyles] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/components/MobileTransactionHistory.jsx"),
    read("src/features/transactions/components/MobileTransactionHistory.module.css"),
    read("src/features/categories/CategoriesPage.module.css"),
  ]);
  assert.match(transactions, /const MobileTransactionHistory = lazy/);
  assert.match(mobileHistory, /MobileTransactionOverview/);
  assert.match(mobileHistory, /MobileTransactionFilters/);
  assert.match(transactions, /useApiResource\("reports\.monthly", \{ period: filters\.period, trend_months: 6 \}, \{ enabled: mobileLayout \}\)/);
  assert.match(mobileHistory, /title="Filter transaksi"/);
  assert.match(mobileHistory, /title="Cari transaksi"/);
  assert.match(mobileHistory, /Semua rekening/);
  assert.match(mobileHistory, /Semua kategori/);
  assert.match(mobileHistory, /Semua pencatat/);
  assert.match(mobileHistory, /Belum masuk Alokasi/);
  assert.match(mobileStyles, /\.filterBar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) var\(--mobile-control-height\) var\(--mobile-control-height\);/);
  assert.match(mobileStyles, /\.typeScroller\s*\{[\s\S]*overflow-x:\s*auto;/);
  assert.match(mobileStyles, /\.advancedGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileStyles, /@media \(max-width: 390px\)[\s\S]*\.advancedGrid\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(mobileStyles, /\.activeFilters button \{[^}]*min-height:\s*var\(--mobile-control-height\);/);
  assert.match(mobileStyles, /\.periodNav button \{[^}]*width:\s*var\(--mobile-control-height\);[^}]*height:\s*var\(--mobile-control-height\);/s);
  assert.match(categoryStyles, /\.iconGroups\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/);
  assert.doesNotMatch(categoryStyles, /\.iconGroups\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(mobileStyles + categoryStyles, /47\.99rem|51\.25rem/);
});

test("history transaksi mobile memakai periode dan grafik compact tanpa judul body ganda", async () => {
  const [transactions, mobileHistory, mobileStyles] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/transactions/components/MobileTransactionHistory.jsx"),
    read("src/features/transactions/components/MobileTransactionHistory.module.css"),
  ]);
  assert.match(transactions, /description=\{mobileLayout \? undefined : "Semua transaksi dalam satu alur\."\}/);
  assert.match(mobileHistory, /periodLabel\(period\)/);
  assert.match(mobileHistory, /Tren arus kas enam bulan sampai periode terpilih/);
  assert.match(mobileHistory, /formatCompactRupiah\(cashFlow\.income\)/);
  assert.match(mobileHistory, /formatCompactRupiah\(cashFlow\.expense\)/);
  assert.doesNotMatch(mobileHistory, /Riwayat transaksi|Aktivitas keuangan tersusun berdasarkan tanggal/);
  assert.match(mobileStyles, /\.chart\s*\{[^}]*height:\s*108px;/);
  assert.doesNotMatch(mobileStyles, /\.overview\s*\{[^}]*border:/);
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
    Promise.all([read("src/features/allocations/AllocationsPage.jsx"), read("src/features/allocations/AllocationOverviewLayer.jsx"), read("src/features/allocations/AllocationDialogLayer.jsx"), read("src/features/allocations/AllocationSecondaryLayer.jsx")]).then((parts) => parts.join("\n")),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/styles/pages.css"),
    read("src/styles/responsive.css"),
    read("src/features/budgets/BudgetsPage.module.css"),
  ]);

  assert.match(transactionStyles, /@media \(max-width: 820px\)[\s\S]*\.typeSelector\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(transactionStyles, /font-size:\s*9px/);
  assert.match(transactionStyles, /@media \(max-width: 820px\)[\s\S]*\.modal/);
  assert.doesNotMatch(transactionStyles, /47\.99rem|51\.25rem/);
  assert.match(allocations, /allocation-header-actions/);
  assert.match(allocations, /className="allocation-advanced form-grid__full"/);
  assert.match(allocations, /aria-label="Muat ulang Alokasi Dana"/);
  assert.match(allocations, /PageHeader title="Alokasi Dana"/);
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
  assert.match(reports, /useMediaQuery\(MOBILE_REPORT_QUERY\)/);
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
  assert.match(accountStyles, /\.mobileStackAccountMeta,\s*\n\.mobileStackOwnerScope \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileChartLabels \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileChartStats small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(accountStyles, /\.mobileTransferSuccessRoute small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
});

test("kontrol finansial mobile mempertahankan target sentuh 44px dan teks penting tidak mikro", async () => {
  const [reports, budgets, dashboard, transactionForm, accountActivity, accountCard, accountTransfer, accountExperience, settings] = await Promise.all([
    read("src/features/reports/ReportsPage.module.css"),
    read("src/features/budgets/BudgetsPage.module.css"),
    read("src/features/dashboard/DashboardPage.css"),
    read("src/features/transactions/TransactionForm.module.css"),
    read("src/features/accounts/components/MobileAccountActivity.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
    read("src/features/accounts/components/MobileAccountTransferAction.module.css"),
    read("src/features/accounts/components/MobileAccountsExperience.module.css"),
    read("src/features/settings/Settings.module.css"),
  ]);

  assert.match(reports, /\.segmentedControl button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(reports, /\.periodArrow \{[^}]*width:\s*var\(--mobile-control-height\);[^}]*height:\s*var\(--mobile-control-height\);/s);
  assert.match(reports, /\.rangeChips button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(reports, /\.sectionHeading > button,[\s\S]*?\.sectionHeading > a \{[^}]*min-height:\s*var\(--mobile-control-height\);/);
  assert.match(budgets, /@media \(max-width: 580px\)[\s\S]*?\.segment,[\s\S]*?\.sortButton,[\s\S]*?\.detailButton \{\s*min-height:\s*var\(--mobile-control-height\);/);
  assert.match(dashboard, /\.mobile-allocation-card__footer a \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(transactionForm, /\.quickAmounts button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(accountActivity, /\.mobileActivityHeading > button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(accountActivity, /\.mobileTrendControls > button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.match(accountCard, /\.mobileSecondaryActions button \{[^}]*min-height:\s*var\(--mobile-control-height\);/s);
  assert.doesNotMatch(accountActivity + accountTransfer + accountExperience + settings, /font-size:\s*\.(?:5|6)rem;/);
});
