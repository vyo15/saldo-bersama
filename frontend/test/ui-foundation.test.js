import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const moduleBackedComponents = [
  "Button",
  "Card",
  "Modal",
  "MoneyInput",
  "ProgressBar",
  "StatusBadge",
  "ThemeToggle",
];

test("shared UI primitives use colocated CSS Modules and preserve project compatibility classes", async () => {
  for (const component of moduleBackedComponents) {
    const [source, css] = await Promise.all([
      read(`src/components/common/${component}.jsx`),
      read(`src/components/common/${component}.module.css`),
    ]);
    assert.match(source, new RegExp(`import styles from "\\./${component}\\.module\\.css";`));
    assert.ok(css.trim().length > 0, `${component}.module.css must not be empty`);
  }

  assert.match(await read("src/components/common/Button.jsx"), /"button"/);
  assert.match(await read("src/components/common/Modal.jsx"), /modal-backdrop/);
});

test("semantic primitives keep accessibility and avoid dynamic inline layout styling", async () => {
  const [modal, moneyInput, progress] = await Promise.all([
    read("src/components/common/Modal.jsx"),
    read("src/components/common/MoneyInput.jsx"),
    read("src/components/common/ProgressBar.jsx"),
  ]);

  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /useFocusTrap/);
  const focusTrap = await read("src/hooks/useFocusTrap.js");
  assert.match(focusTrap, /onEscapeRef\.current = onEscape/);
  assert.match(focusTrap, /onEscapeRef\.current\?\.\(\)/);
  assert.doesNotMatch(focusTrap, /\[bodyClassName, containerRef, initialFocusRef, onEscape, open\]/);
  assert.match(moneyInput, /aria-describedby=\{describedBy\}/);
  assert.match(moneyInput, /inputMode="numeric"/);
  assert.match(progress, /<progress/);
  assert.doesNotMatch(progress, /style=\{\{/);
});

test("feature code does not import UI toolkit directly and utility frameworks stay absent", async () => {
  const packageJson = await read("package.json");
  for (const forbidden of ["tailwindcss", "@tailwind", "shadcn", "@mui/", "antd", "@chakra-ui/"]) {
    assert.equal(packageJson.includes(forbidden), false, `Forbidden UI dependency or marker found: ${forbidden}`);
  }

  const featureDirectory = new URL("../src/features/", import.meta.url);
  const featureNames = await readdir(featureDirectory, { recursive: true });
  const sourceFiles = featureNames.filter((name) => /\.(?:js|jsx)$/.test(name));
  for (const relative of sourceFiles) {
    const source = await read(`src/features/${relative}`);
    assert.doesNotMatch(source, /from\s+["']@mantine\//, `Feature must use project wrappers: ${relative}`);
  }
});

test("design tokens expose shared control, motion, and layer contracts", async () => {
  const tokens = await read("src/styles/tokens.css");
  for (const token of [
    "--control-height-md",
    "--control-height-lg",
    "--control-radius",
    "--motion-fast",
    "--motion-normal",
    "--motion-easing",
    "--layer-modal",
    "--shadow-control",
    "--shadow-floating",
  ]) assert.match(tokens, new RegExp(`${token}:`));
});

test("halaman data utama memiliki representasi card mobile dan filter transaksi canonical", async () => {
  const [transactions, reports, accounts, accountSheets, mobileActivity, reconciliation, settings] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/MobileAccountSheets.jsx"),
    read("src/features/accounts/components/MobileAccountActivity.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
    read("src/features/settings/AuditPage.jsx"),
  ]);

  assert.match(transactions, /desktop-data-table/);
  assert.match(transactions, /transaction-mobile-list/);
  assert.match(reports, /budget-mobile-list/);
  assert.match(accounts + accountSheets + mobileActivity, /mobileTransactionList/);
  assert.match(reconciliation, /reconciliation-mobile-list/);
  assert.match(settings, /mobile-data-list/);
  assert.match(settings, /audit\.list/);
  assert.match(transactions, /account_id:\s*filters\.account/);
  assert.match(transactions, /category_id:\s*filters\.category/);
  assert.match(transactions, /created_by:\s*filters\.creator/);
  assert.match(transactions, /initialFilters\(location\.state\)/);
  assert.match(transactions, /state\?\.creatorId/);
  assert.match(transactions, /state\?\.period/);
  assert.doesNotMatch(transactions, /const initialFilters = \(location\)/);
});

test("login memakai artwork approved penuh, onboarding mobile, animasi uang, feedback tombol, LinkedIn aman, dan auth provider canonical", async () => {
  const [login, pages, auth, desktopLight, desktopDark, saving, budget, mobileLogin] = await Promise.all([
    read("src/features/auth/LoginPage.jsx"),
    read("src/styles/pages.css"),
    read("src/services/auth/googleFirebaseAuth.js"),
    readFile(new URL("../public/login/desktop-light.webp", import.meta.url)),
    readFile(new URL("../public/login/desktop-dark.webp", import.meta.url)),
    readFile(new URL("../public/login/mobile-onboarding-saving.webp", import.meta.url)),
    readFile(new URL("../public/login/mobile-onboarding-budget.webp", import.meta.url)),
    readFile(new URL("../public/login/mobile-login.webp", import.meta.url)),
  ]);

  assert.match(login, /MOBILE_LOGIN_QUERY = "\(max-width: 820px\)"/);
  assert.match(login, /MOBILE_SLIDE_COUNT = 3/);
  assert.match(login, /mobile-onboarding-saving\.webp/);
  assert.match(login, /mobile-onboarding-budget\.webp/);
  assert.match(login, /mobile-login\.webp/);
  assert.match(login, /desktop-light\.webp/);
  assert.match(login, /desktop-dark\.webp/);
  assert.match(login, /MONEY_NOTES/);
  assert.match(login, /MoneyRain/);
  assert.match(login, /aria-roledescription="carousel"/);
  assert.match(login, /ThemeToggle className="login-mobile-theme-toggle"/);
  assert.match(login, /href="https:\/\/www\.linkedin\.com\/in\/vio-yusup-iskandar\/"/);
  assert.match(login, /rel="noopener noreferrer"/);
  assert.equal((login.match(/className="google-login-button"/g) || []).length, 1);
  assert.match(auth, /identity\.renderButton\(element/);
  assert.match(pages, /\.login-desktop-stage,[\s\S]*height:\s*100dvh;/);
  assert.match(login, /login-desktop-artwork-frame/);
  assert.match(login, /login-mobile-artwork-frame/);
  assert.match(pages, /\.login-desktop-artwork-frame[\s\S]*width:\s*max\(100vw, calc\(100dvh \* 1672 \/ 941\)\)[\s\S]*aspect-ratio:\s*1672 \/ 941;/);
  assert.match(pages, /\.login-mobile-artwork-frame[\s\S]*width:\s*max\(100vw, calc\(100dvh \* 941 \/ 1672\)\)[\s\S]*aspect-ratio:\s*941 \/ 1672;/);
  assert.match(pages, /\.login-desktop-artwork,[\s\S]*object-fit:\s*cover;/);
  assert.match(pages, /\.login-mobile-next:active[\s\S]*transform:\s*scale\(\.975\);/);
  assert.match(pages, /@keyframes login-money-fall/);
  assert.match(pages, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.login-money-note/);
  for (const asset of [desktopLight, desktopDark, saving, budget, mobileLogin]) assert.ok(asset.length > 20_000);
});

test("dashboard mobile memakai empat shortcut sekunder dan privacy menyeluruh", async () => {
  const [dashboard, presentation, mobile] = await Promise.all([
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/dashboardPresentation.js"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
  ]);
  const quickActionEntries = presentation.match(/\{ to: "\/(?:rekening|alokasi|tagihan|target)"/g) || [];

  assert.equal(quickActionEntries.length, 4);
  assert.match(dashboard, /lazy\(\(\) => import\("\.\/components\/MobileFinanceDashboard\.jsx"\)\)/);
  assert.match(dashboard, /lazy\(\(\) => import\("\.\/components\/DesktopFinanceDashboard\.jsx"\)\)/);
  assert.doesNotMatch(dashboard, /import MobileFinanceDashboard from "\.\/components\/MobileFinanceDashboard\.jsx";/);
  assert.doesNotMatch(dashboard, /import DesktopFinanceDashboard from "\.\/components\/DesktopFinanceDashboard\.jsx";/);
  assert.match(mobile, /SensitiveMoney/);
  assert.match(mobile, /Sembunyikan seluruh nominal/);
  assert.match(mobile, /ThemeToggle tone="hero"/);
});

test("stylesheet global tidak menghidupkan kembali selector legacy tanpa pemilik runtime", async () => {
  const styles = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/components.css"),
    read("src/styles/pages.css"),
    read("src/styles/responsive.css"),
  ]);
  const source = styles.join("\n");
  for (const selector of [
    ".topbar__menu",
    ".user-chip",
    ".mobile-drawer",
    ".topbar__logout",
    ".metric-card--primary",
    ".dashboard-grid",
    ".envelope-list",
    ".envelope-row",
    ".attention-list",
    ".chip-list",
    ".premium-detail-panel",
    ".premium-dashboard",
    ".premium-filterbar",
    ".premium-alert-panel",
    ".progress__track",
    ".account-card",
    ".account-grid",
  ]) {
    assert.equal(source.includes(selector), false, `${selector} harus tetap terhapus sampai memiliki pemilik runtime`);
  }
});

test("feature write memakai API facade lokal dan halaman tidak mengimpor transport global", async () => {
  const featureDirectory = new URL("../src/features/", import.meta.url);
  const names = await readdir(featureDirectory, { recursive: true });
  const pageFiles = names.filter((name) => /(?:Page|Form)\.jsx$/.test(name));
  for (const relative of pageFiles) {
    const source = await read(`src/features/${relative}`);
    assert.doesNotMatch(source, /services\/api\/client\.js/, `Gunakan facade feature: ${relative}`);
    assert.doesNotMatch(source, /apiClient\.request\(/, `Action write tidak boleh tersebar di page: ${relative}`);
  }
  for (const facade of [
    "accounts/accounts.api.js",
    "allocations/allocations.api.js",
    "goals/goals.api.js",
    "recurring/recurring.api.js",
    "budgets/budgets.api.js",
    "settings/settings.api.js",
    "transactions/transactions.api.js",
  ]) assert.match(await read(`src/features/${facade}`), /apiClient/);
});

test("dashboard parity mempertahankan kontrol semantik tanpa menduplikasi business form", async () => {
  const [page, desktop, mobile, filters, detail, responsive] = await Promise.all([
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/dashboard/components/MobileDashboardFilters.jsx"),
    read("src/features/dashboard/components/MobileTransactionDetail.jsx"),
    read("src/styles/responsive.css"),
  ]);

  assert.equal((page.match(/<TransactionForm/g) || []).length, 0, "Dashboard tidak boleh memiliki implementasi form transaksi sendiri.");
  assert.match(page, /useTransactionComposer/, "Dashboard harus membuka composer transaksi milik application context.");
  assert.doesNotMatch(page, /transactions\/TransactionForm\.jsx/, "Dashboard tidak boleh mengimpor implementation detail TransactionForm.");
  assert.match(page, /const MobileDashboardFilters = lazy\(\(\) => import\("\.\/components\/MobileDashboardFilters\.jsx"\)\)/);
  assert.match(page, /const MobileTransactionDetail = lazy\(\(\) => import\("\.\/components\/MobileTransactionDetail\.jsx"\)\)/);
  assert.match(page, /mobileFiltersOpen \? \(/);
  assert.match(page, /mobileTransactionDetailOpen \? \(/);
  assert.match(desktop, /aria-label=\{balanceVisible \? "Sembunyikan seluruh nominal"/);
  assert.match(desktop, /<h2 id="dashboard-accounts-title">Rekening<\/h2>/);
  assert.match(desktop, /accountTransactionDelta/);
  assert.match(desktop, /transaction\.transaction_type === "adjustment"/);
  assert.match(desktop, /other-categories/);
  assert.match(desktop, /shared-transaction-table/);
  assert.match(desktop, /shared-donut/);
  assert.match(mobile, /type="button" className="mobile-transaction-item"/);
  assert.match(filters, /<form className="mobile-dashboard-filter-form"/);
  assert.match(detail, /<Modal/);
  assert.match(detail, /<dl>/);
  assert.doesNotMatch(responsive, /\.premium-/);
});

test("pengaturan memakai kontrak system.health aktual dan status notifikasi aksesibel", async () => {
  const [overview, presentation, notifications, notificationService, audit] = await Promise.all([
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/settingsPresentation.js"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/services/notifications.js"),
    read("src/features/settings/AuditPage.jsx"),
  ]);
  assert.match(overview, /backendPresentation\(healthResource\)/);
  assert.match(overview, /role="status" aria-live="polite"/);
  assert.match(presentation, /data\.status === "ok"/);
  assert.match(presentation, /data\.schemaVersion/);
  assert.doesNotMatch(overview + presentation, /healthResource\.data\?\.database|schema\?\.ready/);
  assert.match(notifications, /<h3>Notifikasi perangkat<\/h3>[\s\S]*role="status" aria-live="polite"/);
  assert.doesNotMatch(notifications, /Uji notifikasi/);
  assert.match(notificationService, /lastTestFailure/);
  assert.match(presentation, /PUSH_DNS_FAILED/);
  assert.match(audit, /auditDetailLabel\(entry\.detail_code\)/);
});
