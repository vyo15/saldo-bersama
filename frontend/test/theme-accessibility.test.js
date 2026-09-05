import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const tokenSource = await readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/styles/components.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");

const collectCssSources = async (directory) => {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) result.push(...await collectCssSources(child));
    else if (entry.isFile() && entry.name.endsWith(".css")) result.push({ path: child.pathname, source: await readFile(child, "utf8") });
  }
  return result;
};

const blockFor = (selector) => {
  const start = tokenSource.indexOf(selector);
  assert.ok(start >= 0, `Theme block tidak ditemukan: ${selector}`);
  const bodyStart = tokenSource.indexOf("{", start) + 1;
  const bodyEnd = tokenSource.indexOf("}", bodyStart);
  return tokenSource.slice(bodyStart, bodyEnd);
};

const token = (block, name) => {
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
  assert.ok(value, `Token hex tidak ditemukan: ${name}`);
  return value;
};

const luminance = (hex) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (left, right) => {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test("palette Saldo Bersama yang disetujui tetap menjadi primitive canonical", () => {
  for (const [name, value] of Object.entries({
    "--palette-rich-black": "#0b1110",
    "--palette-dark-green": "#0f1a18",
    "--palette-bangladesh-green": "#03624c",
    "--palette-mountain-meadow": "#2cc295",
    "--palette-caribbean-green": "#00d681",
    "--palette-mint": "#a7f3d0",
    "--palette-anti-flash-white": "#f4faf7",
    "--palette-pistachio": "#e8f5ef",
  })) assert.match(tokenSource, new RegExp(`${name}:\\s*${value};`, "i"));
});

test("token light dan dark memenuhi kontras teks serta tombol utama", () => {
  const light = blockFor(":root,");
  const dark = blockFor(':root[data-theme="dark"]');
  for (const foreground of ["--text", "--text-soft", "--text-muted", "--primary", "--positive", "--negative", "--warning", "--info"]) {
    assert.ok(contrast(token(light, foreground), token(light, "--surface")) >= 4.5, `Kontras light gagal: ${foreground}`);
    assert.ok(contrast(token(dark, foreground), token(dark, "--surface")) >= 4.5, `Kontras dark gagal: ${foreground}`);
  }
  assert.ok(contrast(token(light, "--on-primary"), token(light, "--primary")) >= 4.5);
  assert.ok(contrast(token(light, "--on-primary"), token(light, "--primary-strong")) >= 4.5);
  assert.ok(contrast(token(light, "--on-negative"), token(light, "--negative")) >= 4.5);
  assert.ok(contrast(token(light, "--negative"), token(light, "--negative-soft")) >= 4.5, "Status danger light harus memenuhi AA pada negative-soft");
  assert.ok(contrast(token(dark, "--on-primary"), token(dark, "--primary")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-primary"), token(dark, "--primary-strong")) >= 4.5);
  assert.ok(contrast(token(dark, "--on-negative"), token(dark, "--negative")) >= 4.5);
  for (const theme of [light, dark]) {
    for (const endpoint of ["--hero-start", "--hero-mid", "--hero-end"]) {
      assert.ok(contrast(token(theme, "--on-hero"), token(theme, endpoint)) >= 4.5, `Kontras hero gagal: ${endpoint}`);
    }
  }
});

test("border kuat untuk control dan state memenuhi kontras non-text 3:1", () => {
  const light = blockFor(":root,");
  const dark = blockFor(':root[data-theme="dark"]');
  for (const [name, theme] of [["light", light], ["dark", dark]]) {
    for (const surface of ["--surface", "--surface-elevated"]) {
      assert.ok(contrast(token(theme, "--border-strong"), token(theme, surface)) >= 3, `Kontras border-strong ${name} gagal pada ${surface}`);
    }
  }
  assert.match(componentSource, /\.confirmation-checklist__marker[^}]*border:\s*1px solid var\(--border-strong\)/s);
});

test("komponen memakai semantic foreground dan reduced motion", () => {
  assert.match(componentSource, /\.button--primary[^}]*color:\s*var\(--on-primary\)/);
  assert.match(componentSource, /\.button--danger[^}]*color:\s*var\(--on-negative\)/);
  assert.match(componentSource, /select option,[\s\S]*select optgroup \{[^}]*background-color:\s*var\(--surface-elevated\);[^}]*color:\s*var\(--text\);/);
  assert.match(componentSource, /select option:checked \{[^}]*background-color:\s*var\(--primary-soft\);[^}]*color:\s*var\(--primary-strong\);/);
  assert.match(componentSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(componentSource, /:focus-visible/);
});

test("badge status pengajuan memakai token semantic lintas light dan dark theme", async () => {
  const requestPanel = await readFile(new URL("../src/components/common/RequestPanel.module.css", import.meta.url), "utf8");
  assert.match(requestPanel, /\.statusPending[^}]*color:\s*var\(--warning/);
  assert.match(requestPanel, /\.statusPending[^}]*background:\s*var\(--warning-soft/);
  assert.match(requestPanel, /\.statusApproved[^}]*color:\s*var\(--positive/);
  assert.match(requestPanel, /\.statusApproved[^}]*background:\s*var\(--positive-soft/);
  assert.match(requestPanel, /\.statusRejected[^}]*color:\s*var\(--negative/);
  assert.match(requestPanel, /\.statusRejected[^}]*background:\s*var\(--negative-soft/);
  assert.doesNotMatch(requestPanel, /#8a5a00|#166534|#991b1b/i);
});

test("density mobile memakai token readable dan tidak mengecilkan kontrol pada layar sempit", async () => {
  const [tokens, responsive, reset, pages, dashboard, loginStyles] = await Promise.all([
    readFile(new URL("../src/styles/tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/reset.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/styles/pages.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/allocations/AllocationOverview.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/allocations/AllocationDetail.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile(new URL("../src/features/dashboard/DashboardPage.module.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/features/auth/LoginPage.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/auth/LoginMobile.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
  ]);

  assert.match(tokens, /--font-size-xs:\s*12px;/);
  assert.match(tokens, /--font-size-sm:\s*12\.5px;/);
  assert.match(tokens, /--mobile-page-gutter:\s*16px;/);
  assert.match(tokens, /--mobile-section-gap:\s*16px;/);
  assert.match(tokens, /--mobile-card-padding:\s*16px;/);
  assert.match(tokens, /--mobile-control-height:\s*44px;/);
  assert.match(tokens, /--mobile-native-control-font-size:\s*16px;/);
  assert.match(tokens, /--mobile-financial-meta-size:\s*12px;/);
  assert.match(reset, /body \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(responsive, /@media \(max-width: 820px\)[\s\S]*--font-size-xs:\s*12px;[\s\S]*--font-size-sm:\s*12\.5px;[\s\S]*--font-size-body-sm:\s*13px;[\s\S]*--font-size-body:\s*14px;/);
  assert.match(responsive, /@media \(max-width: 820px\)[\s\S]*--font-weight-semibold:\s*550;[\s\S]*--font-weight-bold:\s*650;/);
  assert.match(dashboard, /\.mobile-finance-summary span \{ font-size:\s*var\(--font-size-xs\);/);
  assert.match(dashboard, /\.mobile-transaction-item > div small \{[^}]*font-size:\s*var\(--font-size-xs\);/);
  assert.doesNotMatch(pages, /\.premium-/);
  assert.match(loginStyles, /\.login-mobile-google-button \{[^}]*min-height:\s*54px;/);
  assert.doesNotMatch(pages, /\.shared-account-panel \{/);
  const dashboardStart = dashboard.indexOf(".shared-account-panel {");
  const dashboardEnd = dashboard.indexOf(".shared-empty-state {", dashboardStart);
  assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart, "Blok dashboard desktop harus tetap ditemukan di bundle fitur Dashboard");
  const dashboardStyles = dashboard.slice(dashboardStart, dashboardEnd);
  assert.doesNotMatch(dashboardStyles, /font-size:\s*(?:8|9|10)px;/);

  const [mobileHistoryStyles, reportsStyles] = await Promise.all([
    readFile(new URL("../src/features/transactions/components/MobileTransactionHistory.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/reports/ReportsPage.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(mobileHistoryStyles, /\.pager button \{[^}]*width:\s*var\(--mobile-control-height\);[^}]*height:\s*var\(--mobile-control-height\);/s);
  assert.match(mobileHistoryStyles, /\.iconFilter \{[^}]*width:\s*var\(--mobile-control-height\);[^}]*height:\s*var\(--mobile-control-height\);/s);
  assert.match(mobileHistoryStyles, /\.typeChip,[\s\S]*\.typeChipActive \{[^}]*min-height:\s*var\(--mobile-control-height\);/);
  assert.doesNotMatch(mobileHistoryStyles, /font-size:\s*(?:8(?:\.5)?|9(?:\.5)?|10)px;/);
  assert.doesNotMatch(reportsStyles, /font-size:\s*(?:8(?:\.5)?|9(?:\.5)?|10)px;/);
  assert.match(loginStyles, /\.login-mobile-security \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(loginStyles, /\.login-mobile-eyebrow \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(loginStyles, /\.login-mobile-hero__kicker \{[^}]*font-size:\s*var\(--font-size-xs\);/s);
  assert.match(loginStyles, /\.login-mobile-description \{[^}]*font-size:\s*var\(--font-size-body-sm\);/s);
});

test("kontrol app-owned menjaga target minimum 44px dan teks operasional tidak turun di bawah 12px", async () => {
  const [app, components, pages, dashboard, budgets, transactionForm, transactions, feedback, desktopAccounts, loginStyles] = await Promise.all([
    readFile(new URL("../src/styles/app.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/components.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/styles/pages.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/allocations/AllocationOverview.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/allocations/AllocationDetail.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile(new URL("../src/features/dashboard/DashboardPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/budgets/BudgetsPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/TransactionForm.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/TransactionsPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/feedback/FeedbackProvider.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/accounts/components/DesktopAccountsWorkspace.module.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/features/auth/LoginPage.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/auth/LoginMobile.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
  ]);

  assert.match(app, /\.desktop-settings-button \{ width:\s*44px; height:\s*44px;/);
  assert.match(app, /\.user-avatar--md \{ width:\s*44px; height:\s*44px;/);
  assert.match(components, /\.icon-button \{ width:\s*44px; height:\s*44px;/);
  assert.match(components, /\.quick-amounts button \{ min-height:\s*44px;/);
  assert.match(feedback, /\.close \{ width:\s*2\.75rem; height:\s*2\.75rem;/);
  assert.match(pages, /\.allocation-filters button\s*\{[^}]*min-height:\s*44px;/);
  assert.match(pages, /\.allocation-card__menu\s*\{[^}]*width:\s*44px;[^}]*min-width:\s*44px;[^}]*height:\s*44px;/);
  assert.match(pages, /\.allocation-detail-back\s*\{[^}]*width:\s*max-content;[^}]*min-height:\s*44px;/);
  assert.match(dashboard, /\.shared-account-pagination button \{ width:\s*44px; height:\s*44px;/);
  assert.match(dashboard, /\.shared-account-pagination button::before \{[^}]*width:\s*22px;[^}]*height:\s*7px;[^}]*transform:\s*scaleX\(\.318\)/);
  assert.match(budgets, /\.segment \{\s*min-height:\s*var\(--control-height-md\);/);
  assert.match(budgets, /\.sortButton \{\s*min-height:\s*var\(--control-height-md\);/);
  assert.match(transactionForm, /\.quickAmounts button \{\s*min-height:\s*var\(--control-height-md\);/);
  assert.match(transactionForm, /\.impactDetails summary \{[^}]*min-height:\s*var\(--control-height-md\);/s);
  assert.match(transactions, /\.filterChip\s*\{[^}]*min-height:\s*var\(--control-height-md\);/);
  assert.match(desktopAccounts, /\.ownershipFilter \{[^}]*min-height:\s*2\.75rem;/s);
  assert.match(desktopAccounts, /\.carouselArrow \{[^}]*width:\s*2\.75rem;[^}]*height:\s*2\.75rem;/s);
  assert.match(desktopAccounts, /\.carouselDot \{[^}]*width:\s*2\.75rem;[^}]*height:\s*2\.75rem;/s);
  assert.match(desktopAccounts, /\.textAction \{[^}]*min-height:\s*2\.75rem;/s);
  assert.match(loginStyles, /\.login-desktop-brand small \{[^}]*font-size:\s*var\(--font-size-xs\);/s);

  const operationalCss = [app, components, pages, dashboard, budgets, transactionForm, transactions, feedback, desktopAccounts].join("\n");
  const tooSmall = [...operationalCss.matchAll(/font-size:\s*([0-9.]+)px/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value < 12);
  assert.deepEqual(tooSmall, []);
});

test("microtext di bawah 12px hanya tersisa pada facsimile atau dekorasi yang disetujui", async () => {
  const cssFiles = await collectCssSources(new URL("../src/", import.meta.url));
  const exceptions = [];
  for (const file of cssFiles) {
    for (const match of file.source.matchAll(/font-size:\s*([^;]+);/g)) {
      const values = [...match[1].matchAll(/([0-9]*\.?[0-9]+)\s*(px|rem)/g)]
        .map((value) => Number(value[1]) * (value[2] === "rem" ? 16 : 1));
      if (!values.length || Math.min(...values) >= 12) continue;
      const relative = file.path.split("/frontend/src/")[1];
      exceptions.push(`${relative}:${match[1].trim()}`);
    }
  }

  assert.deepEqual(exceptions.sort(), [
    "components/feedback/FinancialSuccessOverlay.module.css:.3rem",
    "components/feedback/FinancialSuccessOverlay.module.css:.4rem",
    "components/feedback/FinancialSuccessOverlay.module.css:.58rem",
    "features/accounts/components/AccountFinancialCard.module.css:.38rem",
    "features/accounts/components/AccountFinancialCard.module.css:.48rem",
    "features/auth/LoginPage.module.css:.43rem",
    "features/auth/LoginPage.module.css:.55rem",
    "features/auth/LoginPage.module.css:clamp(.74rem, 1.15vw, .98rem)",
  ].sort());
});

test("tipografi memakai Manrope canonical, fallback system, dan bobot standar tanpa synthetic weight ekstrem", async () => {
  assert.match(mainSource, /@fontsource-variable\/manrope\/wght\.css/);
  assert.match(tokenSource, /--font-sans:\s*"Manrope Variable", Manrope, ui-sans-serif, system-ui/);
  assert.match(tokenSource, /--font-mono:\s*"Cascadia Mono", "SFMono-Regular", Consolas/);
  assert.match(tokenSource, /--font-weight-regular:\s*400;/);
  assert.match(tokenSource, /--font-weight-medium:\s*500;/);
  assert.match(tokenSource, /--font-weight-semibold:\s*600;/);
  assert.match(tokenSource, /--font-weight-bold:\s*700;/);

  const sharedStyles = await Promise.all([
    "app.css",
    "components.css",
    "pages.css",
    "responsive.css",
  ].map((name) => readFile(new URL(`../src/styles/${name}`, import.meta.url), "utf8")));
  assert.doesNotMatch(sharedStyles.join("\n"), /font-weight:\s*(?:[89]\d{2}|7[5-9]\d);/);
});

test("semua CSS custom property statis terdefinisi dan alias semantic yang salah tidak kembali", async () => {
  const cssFiles = await collectCssSources(new URL("../src/", import.meta.url));
  const defined = new Set();
  const runtimeProperties = new Set([
    "--note-delay", "--note-drift", "--note-left", "--note-rotation", "--login-mobile-slide",
    "--budget-progress-scale", "--budget-pacing-scale", "--recurring-progress-scale", "--report-bar-scale", "--report-bar-height",
  ]);

  for (const file of cssFiles) {
    for (const match of file.source.matchAll(/(?<![\w-])(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(match[1]);
  }

  const unresolved = [];
  for (const file of cssFiles) {
    for (const match of file.source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)(\s*,)?/g)) {
      const [, name, fallback] = match;
      if (!defined.has(name) && !fallback && !runtimeProperties.has(name)) unresolved.push(`${name} @ ${file.path}`);
    }
  }

  assert.deepEqual(unresolved, []);
  assert.match(tokenSource, /--font-size-body:\s*16px;/);
  const combined = cssFiles.map((file) => file.source).join("\n");
  for (const invalidAlias of ["--border-subtle", "--surface-muted", "--text-primary", "--font-size-md", "--danger"]) {
    assert.doesNotMatch(combined, new RegExp(`var\\(${invalidAlias}\\)`));
  }
});

test("gradient avatar dan login menjaga focus, motion preference, dan full-screen shell", async () => {
  const [app, loginStyles, login] = await Promise.all([
    readFile(new URL("../src/styles/app.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/features/auth/LoginPage.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/auth/LoginMobile.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    Promise.all([
      "../src/features/auth/LoginPage.jsx",
      "../src/features/auth/components/LoginDesktopLayout.jsx",
      "../src/features/auth/components/LoginMobileLayout.jsx",
      "../src/features/auth/loginPresentation.js",
    ].map((relative) => readFile(new URL(relative, import.meta.url), "utf8"))).then((parts) => parts.join("\n")),
  ]);
  assert.match(app, /\.desktop-user-avatar \{[^}]*background:\s*linear-gradient\(145deg, var\(--primary\), var\(--primary-strong\)\);/s);
  assert.match(app, /\.user-avatar \{[^}]*background:\s*linear-gradient\(145deg, var\(--primary\), var\(--primary-strong\)\);/s);
  assert.match(loginStyles, /\.login-artwork-hotspot:focus-visible/);
  assert.match(loginStyles, /\.login-mobile-viewport:focus-visible/);
  assert.match(loginStyles, /min-height:\s*100dvh/);
  assert.match(loginStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.login-money-note/);
  assert.match(loginStyles, /animation: login-money-fall var\(--motion-decorative\) linear 1 both/);
  assert.doesNotMatch(loginStyles, /login-money-fall[^;]*infinite/);
  assert.doesNotMatch(login, /duration:\s*"(?:9|1[0-3]|2[2-9])s"/);
  assert.match(login, /DESKTOP_ARTWORK\[theme\]/);
  assert.doesNotMatch(app, /\.desktop-user-avatar \{[^}]*var\(--secondary\)/s);
  assert.doesNotMatch(app, /\.user-avatar \{[^}]*var\(--secondary\)/s);
});

test("mobile form tidak memicu auto-zoom dan gesture rekening tidak memblokir scroll vertikal", async () => {
  const [
    responsive,
    accountStyles,
    indexHtml,
    components,
    modalStyles,
    reset,
    dashboard,
    transactionFormStyles,
    mobileHistoryStyles,
    reconciliationStyles,
  ] = await Promise.all([
    readFile(new URL("../src/styles/responsive.css", import.meta.url), "utf8"),
    Promise.all([
      readFile(new URL("../src/features/accounts/AccountsPage.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/accounts/components/MobileAccountActivity.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/accounts/components/MobileAccountsExperience.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/features/accounts/components/MobileAccountTransferAction.module.css", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/components.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/Modal.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/reset.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/dashboard/DashboardPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/TransactionForm.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/components/MobileTransactionHistory.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/reconciliations/ReconciliationsPage.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokenSource, /--mobile-native-control-font-size:\s*16px;/);
  assert.match(components, /\.field input,\s*\n\.field select,\s*\n\.field textarea,\s*\n\.toolbar select,\s*\n\.search-field \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(responsive, /:root body input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*\n\s*:root body select,\s*\n\s*:root body textarea \{ font-size:\s*var\(--mobile-native-control-font-size\); \}/);
  assert.match(accountStyles, /\.mobileHistoryPeriodControl input \{[^}]*padding:\s*0;[^}]*font-size:\s*var\(--mobile-native-control-font-size\);/s);
  assert.match(transactionFormStyles, /\.fieldControlInput > :global\(input\),\s*\n\s*\.fieldControlInput > :global\(select\) \{[^}]*font-size:\s*var\(--mobile-native-control-font-size\);/s);
  assert.match(transactionFormStyles, /\.form :global\(\.field\) > input,\s*\n\s*\.form :global\(\.field\) > select,\s*\n\s*\.form :global\(\.field\) > textarea \{[^}]*font-size:\s*var\(--mobile-native-control-font-size\);/s);
  assert.match(mobileHistoryStyles, /\.filterSelect select \{[^}]*font-size:\s*var\(--mobile-native-control-font-size\);/s);
  assert.match(reconciliationStyles, /@media \(max-width:\s*820px\) \{[\s\S]*\.accountField \.selectShell select,[\s\S]*font-size:\s*var\(--mobile-native-control-font-size\);/);
  assert.match(reconciliationStyles, /\.historyFilter select \{[^}]*min-height:\s*var\(--mobile-control-height\);[^}]*font-size:\s*var\(--mobile-native-control-font-size\);/s);
  assert.match(dashboard, /\.shared-transaction-tools label \{[^}]*min-height:\s*var\(--control-height-md\);/s);
  assert.match(responsive, /scrollbar-width:\s*none;/);
  assert.match(responsive, /html::-webkit-scrollbar,\s*\n\s*body::-webkit-scrollbar \{[^}]*display:\s*none;/s);
  assert.match(responsive, /overflow-x:\s*hidden;/);
  assert.doesNotMatch(responsive, /overflow-y:\s*hidden/);
  assert.match(accountStyles, /\.mobileStackStage[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.match(accountStyles, /\.mobileStackCard\[aria-pressed="true"\][^{]*\{[^}]*touch-action: pan-x pinch-zoom;/s);
  assert.doesNotMatch(accountStyles, /touch-action: none/);
  assert.doesNotMatch(indexHtml, /user-scalable=no|maximum-scale=1/i);
  assert.doesNotMatch(components, /\.modal(?:-backdrop|--lg|__header|__body|__footer|\s*\{)/);
  assert.match(modalStyles, /max-height: min\(94dvh, 57\.5rem\)/);
  assert.match(reset, /body \{ margin: 0; min-width: 0;/);
  assert.match(reset, /body \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.match(reset, /#root \{[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/);
  assert.doesNotMatch(reset, /body \{[^}]*overflow:\s*hidden/);
  assert.match(responsive, /\.app-shell--accounts \.app-content \{ padding-top:\s*0; color:\s*var\(--on-hero\); \}/);
});

test("polish mobile menjaga microcopy penting >=12px dan target sentuh lokal >=44px", async () => {
  const [
    visualChoice,
    categories,
    planning,
    transactionForm,
    budgets,
    budgetCard,
    pages,
  ] = await Promise.all([
    readFile(new URL("../src/components/common/VisualChoiceGroup.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/categories/CategoriesPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/planning/PlanningPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/TransactionForm.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/budgets/BudgetsPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/budgets/components/BudgetInsightCard.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/allocations/AllocationDetail.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(visualChoice, /\.label \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(visualChoice, /\.helper \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(categories, /\.categoryStatus \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(categories, /\.iconOption span \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(planning, /\.tab span \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(transactionForm, /@media \(max-width: 820px\)[\s\S]*?\.categoryQuickChoices > small \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
  assert.match(transactionForm, /\.form \.notesField textarea \{[\s\S]*?min-height:\s*3\.25rem;/);
  assert.doesNotMatch(transactionForm, /\.notesField textarea \{[\s\S]*?!important/);
  assert.match(budgets, /@media \(max-width: 820px\) \{[\s\S]*?\.segment,[\s\S]*?\.sortButton \{[\s\S]*?min-height:\s*var\(--mobile-control-height\);/);
  assert.match(budgetCard, /@media \(max-width: 820px\) \{[\s\S]*?\.detailButton \{[\s\S]*?min-height:\s*var\(--mobile-control-height\);/);
  assert.match(pages, /@media \(max-width: 820px\) \{[\s\S]*?\.allocation-detail-back,[\s\S]*?\.allocation-needs-gap :global\(\.button\),[\s\S]*?\.allocation-limit-row__actions :global\(\.button\) \{[\s\S]*?min-height:\s*var\(--mobile-control-height\);/);
  assert.match(pages, /@media \(max-width: 820px\) \{[\s\S]*?\.allocation-detail-panel__header p,[\s\S]*?\.allocation-related-row small \{[\s\S]*?font-size:\s*var\(--font-size-xs\);/);
});

test("!important hanya tersisa untuk reduced-motion compatibility yang terdokumentasi", async () => {
  const cssFiles = await collectCssSources(new URL("../src/", import.meta.url));
  const withImportant = cssFiles.filter((file) => file.source.includes("!important"));
  assert.equal(withImportant.length, 2);

  const components = withImportant.find((file) => file.path.endsWith("/styles/components.css"))?.source || "";
  const login = withImportant.find((file) => file.path.endsWith("/features/auth/LoginMobile.module.css"))?.source || "";
  assert.match(components, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?!important/);
  assert.match(login, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?--login-mobile-parallax-soft:\s*0px !important/);
});
