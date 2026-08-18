import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const moduleBackedComponents = [
  "Button",
  "Card",
  "CompactNotice",
  "Modal",
  "MoneyInput",
  "PageInfoButton",
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

test("compact notice owns lightweight guidance without dashboard stylesheet coupling", async () => {
  const [component, css, dashboardCss, transactions, budgets, allocations, recurring, goals, reconciliations] = await Promise.all([
    read("src/components/common/CompactNotice.jsx"),
    read("src/components/common/CompactNotice.module.css"),
    read("src/features/dashboard/DashboardPage.css"),
    read("src/features/transactions/TransactionsPage.jsx"),
    read("src/features/budgets/BudgetsPage.jsx"),
    read("src/features/allocations/AllocationsPage.jsx"),
    read("src/features/recurring/RecurringPage.jsx"),
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
  ]);

  assert.match(component, /data-ui="compact-notice"/);
  assert.match(component, /role=\{role\}/);
  assert.match(component, /aria-live=\{ariaLive\}/);
  assert.match(css, /min-height:\s*40px/);
  assert.doesNotMatch(dashboardCss, /attention-guidance/);
  for (const source of [transactions, budgets, allocations, recurring, goals, reconciliations]) {
    assert.match(source, /CompactNotice/, "Guidance lintas feature harus memakai primitive shared, bukan CSS Dashboard.");
    assert.doesNotMatch(source, /attention-guidance/);
  }
});


test("contextual page help remains accessible and keeps educational copy out of persistent mobile chrome", async () => {
  const [infoButton, pageHeader, responsive] = await Promise.all([
    read("src/components/common/PageInfoButton.jsx"),
    read("src/components/common/PageHeader.jsx"),
    read("src/styles/responsive.css"),
  ]);

  assert.match(infoButton, /aria-haspopup="dialog"/);
  assert.match(infoButton, /aria-expanded=\{open\}/);
  assert.match(infoButton, /mobileSwipeToClose/);
  assert.match(pageHeader, /PageInfoButton/);
  assert.match(pageHeader, /page-header--with-help/);
  assert.match(responsive, /\.page-header--with-help\s+\.page-header__description\s*\{[^}]*display:\s*none/s);
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

test("setiap referensi CSS Module frontend memiliki class lokal yang dideklarasikan", async () => {
  const testRoot = path.dirname(fileURLToPath(import.meta.url));
  const sourceRoot = path.resolve(testRoot, "../src");
  const sourceNames = await readdir(sourceRoot, { recursive: true });
  const sourceFiles = sourceNames.filter((name) => /\.(?:js|jsx)$/.test(name));
  const importPattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.module\.css)["'];/g;

  for (const relative of sourceFiles) {
    const absoluteSource = path.join(sourceRoot, relative);
    const source = await readFile(absoluteSource, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const variable = match[1];
      const cssPath = path.resolve(path.dirname(absoluteSource), match[2]);
      const css = await readFile(cssPath, "utf8");
      const referenced = new Set([...source.matchAll(new RegExp(`\\b${variable}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))].map((item) => item[1]));
      const declared = new Set([...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((item) => item[1]));
      for (const className of referenced) {
        assert.equal(declared.has(className), true, `${relative} memakai ${variable}.${className} tetapi ${path.basename(cssPath)} tidak mendeklarasikannya.`);
      }
    }
  }
});

test("named react-icons imports resolve to real exports", async () => {
  const featherIcons = await import("react-icons/fi");
  const sourceRoot = new URL("../src/", import.meta.url);
  const sourceNames = await readdir(sourceRoot, { recursive: true });
  const sourceFiles = sourceNames.filter((name) => /\.(?:js|jsx)$/.test(name));
  const importPattern = /import\s*\{([^}]*)\}\s*from\s*["']react-icons\/fi["'];/g;

  for (const relative of sourceFiles) {
    const source = await read(`src/${relative}`);
    for (const match of source.matchAll(importPattern)) {
      const importedNames = match[1]
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);
      for (const name of importedNames) {
        assert.equal(typeof featherIcons[name], "function", `Unknown react-icons/fi export ${name} in ${relative}`);
      }
    }
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
    Promise.all([
      read("src/features/transactions/TransactionsPage.jsx"),
      read("src/features/transactions/components/MobileTransactionHistory.jsx"),
    ]).then((parts) => parts.join("\n")),
    read("src/features/reports/ReportsPage.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/MobileAccountSheets.jsx"),
    read("src/features/accounts/components/MobileAccountActivity.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
    read("src/features/settings/AuditPage.jsx"),
  ]);

  assert.match(transactions, /desktop-data-table/);
  assert.match(transactions, /MobileTransactionList/);
  assert.match(transactions, /MobileTransactionOverview/);
  assert.match(transactions, /MobileTransactionFilters/);
  assert.match(reports, /budget-mobile-list/);
  assert.match(accounts + accountSheets + mobileActivity, /mobileTransactionList/);
  assert.match(reconciliation, /reconciliation-mobile-list/);
  assert.match(settings, /mobile-data-list/);
  assert.match(settings, /audit\.list/);
  assert.match(transactions, /account_id:\s*filters\.account/);
  assert.match(transactions, /category_id:\s*filters\.category/);
  assert.match(transactions, /created_by:\s*filters\.creator/);
  assert.match(transactions, /initialFilters\(attention\)/);
  assert.match(transactions, /useDashboardAttentionState/);
  assert.match(transactions, /state\?\.creatorId/);
  assert.match(transactions, /state\?\.period/);
  assert.doesNotMatch(transactions, /const initialFilters = \(location\)/);
});

test("login desktop dan mobile memakai tombol branded dengan server OAuth production serta popup Firebase lokal", async () => {
  const assetNames = [
    "hand-phone-dashboard.webp",
    "piggy-bank.webp",
    "wallet.webp",
    "growth-board.webp",
    "finance-checklist.webp",
    "house.webp",
    "phone-analytics.webp",
  ];
  const [login, loginStyles, app, main, pages, mobileAuth, desktopLight, desktopDark, logo, googleLogo, ...mobileAssets] = await Promise.all([
    read("src/features/auth/LoginPage.jsx"),
    read("src/features/auth/LoginPage.css"),
    read("src/app/App.jsx"),
    read("src/main.jsx"),
    read("src/styles/pages.css"),
    read("src/services/auth/mobileFirebaseGoogleAuth.js"),
    readFile(new URL("../public/login/desktop-light.webp", import.meta.url)),
    readFile(new URL("../public/login/desktop-dark.webp", import.meta.url)),
    readFile(new URL("../public/brand/saldo-bersama-mark.png", import.meta.url)),
    readFile(new URL("../public/login/google-g-logo.png", import.meta.url)),
    ...assetNames.map((name) => readFile(new URL(`../public/login/assets/mobile/${name}`, import.meta.url))),
  ]);

  assert.match(login, /MOBILE_LOGIN_QUERY = "\(max-width: 820px\)"/);
  assert.match(login, /MOBILE_SLIDE_COUNT = 4/);
  assert.match(login, /MOBILE_ONBOARDING/);
  for (const assetName of assetNames) assert.match(login, new RegExp(assetName.replace(".", "\\.")));
  assert.doesNotMatch(login, /mobile-onboarding-saving\.webp|mobile-onboarding-budget\.webp|mobile-login\.webp/);
  assert.match(login, /\/brand\/saldo-bersama-mark\.png/);
  assert.match(login, /desktop-light\.webp/);
  assert.match(login, /desktop-dark\.webp/);
  assert.match(login, /MoneyRain compact notes=\{MOBILE_MONEY_NOTES\}/);
  assert.match(login, /aria-roledescription="carousel"/);
  assert.match(login, /ThemeToggle className="login-mobile-theme-toggle"/);
  assert.match(login, /href="https:\/\/www\.linkedin\.com\/in\/vio-yusup-iskandar\/"/);
  assert.match(login, /rel="noopener noreferrer"/);

  // Onboarding mobile mengandalkan swipe, pagination, dan Lewati; progress, back, serta tombol Lanjut besar sudah dipensiunkan.
  assert.doesNotMatch(login, /login-mobile-next|nextLabel|FiArrowRight|FiArrowLeft|login-mobile-progress|login-mobile-back/);
  assert.doesNotMatch(loginStyles, /\.login-mobile-(?:next|progress|back)/);

  // Desktop dan mobile memakai tombol HTML branded yang sama. Production memakai server OAuth; localhost tetap popup Firebase untuk development.
  assert.doesNotMatch(login, /renderGoogleLoginButton|google-login-button/);
  assert.match(login, /import\("\.\.\/\.\.\/services\/auth\/mobileFirebaseGoogleAuth\.js"\)/);
  assert.match(login, /preloadMobileGoogleAuth/);
  assert.match(login, /useGoogleProvider/);
  assert.doesNotMatch(login, /prepareLoginServiceWorker/);
  assert.match(login, /googleAuthReady/);
  assert.match(login, /signInWithGoogleMobile/);
  assert.match(login, /returnTo: requestedPath/);
  assert.match(login, /mobileOAuthErrorFromSearch/);
  assert.match(login, /googleAuthRef/);
  assert.match(login, /className="login-mobile-google-button"/);
  assert.match(login, /<MobileGoogleLogin \{\.\.\.authProps\}/);
  assert.match(login, /mobileAuthProps=\{googleAuthProps\}/);
  assert.match(login, /\/login\/google-g-logo\.png/);
  assert.match(login, /Menghubungkan ke Google…/);
  assert.match(login, /pending: googleLoginPending/);
  assert.doesNotMatch(login, /login-mobile-provider/);
  assert.match(mobileAuth, /GoogleAuthProvider/);
  assert.match(mobileAuth, /CANONICAL_PRODUCTION_HOST = "saldo-bersama\.vercel\.app"/);
  assert.match(mobileAuth, /SERVER_OAUTH_START_PATH = "\/api\/auth\/google\/start"/);
  assert.match(mobileAuth, /window\.location\.assign/);
  assert.match(mobileAuth, /signInWithPopup/);
  assert.match(mobileAuth, /inMemoryPersistence/);
  assert.doesNotMatch(mobileAuth, /signInWithRedirect|getRedirectResult|browserLocalPersistence|REDIRECT_INTENT_KEY|authStateReady/);
  assert.match(mobileAuth, /inMemoryPersistence/);
  assert.match(mobileAuth, /auth\/popup-blocked/);
  assert.match(mobileAuth, /auth\/web-storage-unsupported/);
  assert.doesNotMatch(login, /await preloadMobileGoogleAuth\(\)/);
  assert.match(mobileAuth, /initializeAuth/);
  assert.doesNotMatch(mobileAuth, /await setPersistence/);
  assert.match(mobileAuth, /await onFirebaseToken\(firebaseIdToken\)/);
  assert.match(mobileAuth, /signOut\(auth\)\.catch/);
  assert.doesNotMatch(mobileAuth, /console\.(?:log|error|warn)\(/);

  assert.match(login, /import "\.\/LoginPage\.css";/);
  assert.match(app, /const AppShell = lazy\(\(\) => import\("\.\.\/layouts\/AppShell\.jsx"\)\);/);
  assert.match(app, /const LoginPage = lazy\(\(\) => import\("\.\.\/features\/auth\/LoginPage\.jsx"\)\);/);
  assert.doesNotMatch(main, /styles\/app\.css/);
  assert.doesNotMatch(main, /styles\/responsive\.css/);
  assert.match(app, /<Route path="\/login" element=\{routeElement\(LoginPage\)\} \/>/);
  assert.doesNotMatch(pages, /\.login-page\b|\.login-mobile-|\.login-desktop-/);
  assert.match(loginStyles, /\.login-desktop-stage \{[\s\S]*height:\s*100dvh;/);
  assert.match(loginStyles, /\.login-mobile-stage \{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(loginStyles, /\.login-mobile-stage\.is-login-active/);
  assert.match(loginStyles, /\.login-mobile-track \{[\s\S]*width:\s*400%;/);
  assert.match(loginStyles, /\.login-mobile-slide \{[\s\S]*overflow:\s*hidden;/);
  assert.match(loginStyles, /\.login-mobile-google-button \{[^}]*min-height:\s*54px;[^}]*border:\s*1px solid #747775;[^}]*background:\s*#fff;/);
  assert.match(loginStyles, /\.login-provider-slot--desktop \.login-mobile-google-button \{[^}]*min-height:\s*54px;[^}]*border-radius:\s*16px;/);
  assert.match(loginStyles, /\.login-mobile-google-button:disabled \{[^}]*cursor:\s*wait;/);
  assert.match(loginStyles, /@keyframes login-google-spin/);
  assert.doesNotMatch(loginStyles, /\.login-mobile-provider/);
  assert.doesNotMatch(loginStyles, /login-provider-spin/);
  assert.match(login, /className="login-mobile-welcome">Selamat datang<\/p>/);
  assert.doesNotMatch(login, /login-mobile-progress|login-mobile-back/);
  assert.doesNotMatch(loginStyles, /\.login-mobile-progress|\.login-mobile-back/);
  assert.match(loginStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.login-mobile-google-button__spinner/);
  for (const staleAsset of [
    "mobile-login.webp",
    "mobile-onboarding-budget.webp",
    "mobile-onboarding-saving.webp",
    "coin-rp.webp",
    "money-note.webp",
    "money-stack.webp",
  ]) assert.doesNotMatch(login, new RegExp(staleAsset.replace(".", "\\.")));
  for (const asset of [desktopLight, desktopDark, logo, googleLogo, ...mobileAssets]) assert.ok(asset.length > 1_000);
});

test("dashboard mobile memakai aksi transaksi harian, alert prioritas, dan privacy menyeluruh", async () => {
  const [dashboard, presentation, mobile] = await Promise.all([
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/dashboardPresentation.js"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
  ]);

  assert.doesNotMatch(presentation, /QUICK_ACTIONS/);
  assert.match(mobile, /TRANSACTION_QUICK_ACTIONS/);
  assert.match(mobile, /TRANSACTION_TYPES\.INCOME/);
  assert.match(mobile, /TRANSACTION_TYPES\.EXPENSE/);
  assert.match(mobile, /TRANSACTION_TYPES\.TRANSFER/);
  assert.match(mobile, /onOpenTransaction\(type\)/);
  assert.match(dashboard, /presentation: initialType === TRANSACTION_TYPES\.TRANSFER \? "mobile-transfer" : "default"/);
  assert.match(dashboard, /lazy\(\(\) => import\("\.\/components\/MobileFinanceDashboard\.jsx"\)\)/);
  assert.match(dashboard, /lazy\(\(\) => import\("\.\/components\/DesktopFinanceDashboard\.jsx"\)\)/);
  assert.doesNotMatch(dashboard, /import MobileFinanceDashboard from "\.\/components\/MobileFinanceDashboard\.jsx";/);
  assert.doesNotMatch(dashboard, /import DesktopFinanceDashboard from "\.\/components\/DesktopFinanceDashboard\.jsx";/);
  assert.match(dashboard, /MOBILE_DASHBOARD_QUERY = "\(max-width: 820px\)"/);
  assert.match(dashboard, /mobileLayout[\s\S]*\? <MobileFinanceDashboard[\s\S]*: <DesktopFinanceDashboard/);
  assert.match(mobile, /SensitiveMoney/);
  assert.match(mobile, /Sembunyikan seluruh nominal/);
  assert.match(mobile, /ThemeToggle tone="hero"/);
  assert.ok(mobile.indexOf("<MobileAlerts") < mobile.indexOf("<MobileAccounts"), "Perlu perhatian harus muncul sebelum daftar rekening pada dashboard mobile.");
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
  const [page, desktop, mobile, detail, responsive] = await Promise.all([
    read("src/features/dashboard/DashboardPage.jsx"),
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/dashboard/components/MobileTransactionDetail.jsx"),
    read("src/styles/responsive.css"),
  ]);

  assert.equal((page.match(/<TransactionForm/g) || []).length, 0, "Dashboard tidak boleh memiliki implementasi form transaksi sendiri.");
  assert.match(page, /useTransactionComposer/, "Dashboard harus membuka composer transaksi milik application context.");
  assert.doesNotMatch(page, /transactions\/TransactionForm\.jsx/, "Dashboard tidak boleh mengimpor implementation detail TransactionForm.");
  assert.doesNotMatch(page, /MobileDashboardFilters|mobileFiltersOpen/);
  assert.match(page, /const MobileTransactionDetail = lazy\(\(\) => import\("\.\/components\/MobileTransactionDetail\.jsx"\)\)/);
  assert.match(page, /mobileTransactionDetailOpen \? \(/);
  assert.match(desktop, /aria-label=\{balanceVisible \? "Sembunyikan seluruh nominal"/);
  assert.match(desktop, /<h2 id="dashboard-accounts-title">Rekening<\/h2>/);
  assert.match(desktop, /accountTransactionDelta/);
  assert.match(desktop, /transaction\.transaction_type === "adjustment"/);
  assert.match(desktop, /other-categories/);
  assert.match(desktop, /shared-transaction-table/);
  assert.match(desktop, /shared-donut/);
  assert.match(mobile, /type="button" className="mobile-transaction-item"/);
  assert.doesNotMatch(mobile, /mobile-dashboard-filter-button|onOpenFilters/);
  assert.match(mobile, /recentTransactions\.slice\(0, 5\)/);
  assert.match(detail, /<Modal/);
  assert.match(detail, /<dl>/);
  assert.doesNotMatch(responsive, /\.premium-/);
});

test("pengaturan memakai kontrak system.health aktual dan status notifikasi aksesibel", async () => {
  const [overview, presentation, notifications, notificationService, serviceWorkerRegistration, main, audit] = await Promise.all([
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/settingsPresentation.js"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/services/notifications.js"),
    read("src/services/serviceWorker.js"),
    read("src/main.jsx"),
    read("src/features/settings/AuditPage.jsx"),
  ]);
  assert.match(overview, /backendPresentation\(healthResource\)/);
  assert.match(overview, /role="status" aria-live="polite"/);
  assert.match(presentation, /data\.status === "ok"/);
  assert.match(presentation, /data\.schemaVersion/);
  assert.doesNotMatch(overview + presentation, /healthResource\.data\?\.database|schema\?\.ready/);
  assert.match(notifications, /<h3>Notifikasi perangkat<\/h3>[\s\S]*role="status" aria-live="polite"/);
  assert.match(notifications, /const \[label, description/);
  assert.match(notifications, /<small id=\{descriptionId\}>\{description\}<\/small>/);
  assert.match(notifications, /aria-describedby=\{descriptionId\}/);
  assert.match(notifications, /<CompactNotice tone="info">iPhone\/iPad:/);
  assert.doesNotMatch(notifications, /Uji notifikasi/);
  assert.match(notificationService, /lastTestFailure/);
  assert.match(serviceWorkerRegistration, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(main, /from "\.\/services\/serviceWorker\.js"/);
  assert.doesNotMatch(main, /from "\.\/services\/notifications\.js"/);
  assert.match(presentation, /PUSH_DNS_FAILED/);
  assert.match(audit, /auditDetailLabel\(entry\.detail_code\)/);
});
