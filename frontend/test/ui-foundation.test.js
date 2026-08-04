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
  const [transactions, reports, accounts, settings] = await Promise.all([
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
  ]);

  assert.match(transactions, /desktop-data-table/);
  assert.match(transactions, /transaction-mobile-list/);
  assert.match(reports, /budget-mobile-list/);
  assert.match(accounts, /reconciliation-mobile-list/);
  assert.match(settings, /audit-mobile-list/);
  assert.match(settings, /owner-admin-section/);
  assert.match(transactions, /account_id:\s*filters\.account/);
  assert.match(transactions, /category_id:\s*filters\.category/);
  assert.match(transactions, /created_by:\s*filters\.creator/);
});

test("login mobile memakai brand resmi, dekorasi rupiah aman, dan auth provider canonical", async () => {
  const [login, pages, auth] = await Promise.all([
    read("src/features/auth/LoginPage.jsx"),
    read("src/styles/pages.css"),
    read("src/services/auth/googleFirebaseAuth.js"),
  ]);

  assert.match(login, /<Brand \/>/);
  assert.match(login, /MONEY_NOTES/);
  assert.match(login, /aria-hidden="true"/);
  assert.match(login, /Created by <strong>Vio Yusup Iskandar<\/strong>/);
  assert.equal((login.match(/className="google-login-button"/g) || []).length, 1);
  assert.match(auth, /identity\.renderButton\(element/);
  assert.match(pages, /@keyframes login-money-fall/);
  assert.match(pages, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.login-money-note/);
});

test("dashboard mobile memakai empat shortcut sekunder dan privacy menyeluruh", async () => {
  const [dashboard, presentation, mobile] = await Promise.all([
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/dashboardPresentation.js"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
  ]);
  const quickActionEntries = presentation.match(/\{ to: "\/(?:rekening|alokasi|tagihan|target)"/g) || [];

  assert.equal(quickActionEntries.length, 4);
  assert.match(dashboard, /MobileFinanceDashboard/);
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
    "reports/reports.api.js",
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

  assert.equal((page.match(/<TransactionForm/g) || []).length, 1, "Dashboard hanya boleh memiliki satu form transaksi shared.");
  assert.match(desktop, /aria-label=\{balanceVisible \? "Sembunyikan seluruh nominal"/);
  assert.match(desktop, /Pilih rekening untuk melihat aktivitasnya/);
  assert.match(desktop, /accountTransactionDelta/);
  assert.match(desktop, /transaction\.transaction_type === "adjustment"/);
  assert.match(desktop, /other-categories/);
  assert.match(desktop, /shared-transaction-table/);
  assert.match(desktop, /shared-donut/);
  assert.match(mobile, /type="button" className="mobile-transaction-item"/);
  assert.match(filters, /<form className="mobile-dashboard-filter-form"/);
  assert.match(detail, /<Modal/);
  assert.match(detail, /<dl>/);
  assert.doesNotMatch(responsive, /\.premium-filterbar > \.premium-select:nth-of-type\(3\) \{ display: none; \}/);
});
