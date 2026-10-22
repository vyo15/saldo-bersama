import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
const cssFiles = {
  allocations: "features/allocations/AllocationOverview.module.css",
  allocationDetail: "features/allocations/AllocationDetail.module.css",
  dashboard: "features/dashboard/DashboardMobile.module.css",
  dashboardDesktop: "features/dashboard/DashboardDesktop.module.css",
  goals: "features/goals/components/GoalCards.module.css",
  recurring: "features/recurring/RecurringHero.module.css",
  commitments: "features/commitments/CommitmentsPage.module.css",
  transactions: "features/transactions/components/MobileTransactionHistory.module.css",
  transactionForm: "features/transactions/TransactionForm.module.css",
  mobileFields: "features/transactions/MobileTransactionFields.module.css",
  accounts: "features/accounts/components/MobileAccountsExperience.module.css",
  reports: "features/reports/ReportsPage.module.css",
  investments: "features/investments/InvestmentsPage.module.css",
  investmentHero: "features/investments/InvestmentHero.module.css",
  settings: "features/settings/Settings.module.css",
  members: "features/settings/MembersSettings.module.css",
  wishlist: "features/wishlist/WishlistPage.module.css",
  shopping: "features/shopping/ShoppingPage.module.css",
  categories: "features/categories/CategoriesPage.module.css",
  notifications: "features/notifications/NotificationsPage.module.css",
};

const rgb = (hex) => Array.from({ length: 3 }, (_, i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
const lum = (hex) => rgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const themeTokens = (css, which) => {
  const start = which === "light" ? css.indexOf(':root,\n:root[data-theme="light"] {') : css.indexOf(':root[data-theme="dark"] {');
  assert.ok(start >= 0);
  const part = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...part.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
};

test("approved tonal surfaces use accessible color endpoints for light and dark", async () => {
  const tokens = await read("styles/tokens.css");
  for (const [theme, textColor] of [["light", "--text"], ["dark", "--text"]]) {
    const values = themeTokens(tokens, theme);
    for (const family of ["brand", "ocean", "purple", "green", "sand"]) {
      for (const endpoint of ["start", "end"]) {
        assert.ok(contrast(values[textColor], values[`--tonal-${family}-${endpoint}`]) >= 4.5,
          `${theme}/${family}/${endpoint}: text must meet WCAG AA even on the weakest gradient stop`);
      }
      assert.match(tokens, new RegExp(`--tonal-gradient-${family}: linear-gradient\\(`));
    }
    assert.ok(contrast(values["--text"], values["--tonal-neutral"]) >= 4.5);
    for (const family of ["brand", "ocean", "purple", "green", "sand"]) {
      for (const endpoint of ["start", "end"]) {
        assert.ok(contrast(values["--focus-ring"], values[`--tonal-${family}-${endpoint}`]) >= 3,
          `${theme}/${family}/${endpoint}: focus ring must remain visible on the actual hero surface`);
      }
    }
    assert.match(tokens, /--tonal-hero-art-filter: saturate\(/);
  }
});

test("V3 uses feature-scoped CSS modules, not broad preview selectors or important overrides", async () => {
  const files = await Promise.all(Object.values(cssFiles).map(read));
  for (const file of files) {
    const v3 = file.split("/* Approved V3 tonal surfaces — scoped to this feature module. */")[1]?.split("/* End approved V3 mobile surfaces. */")[0];
    assert.ok(v3, "a canonical feature CSS module is missing its approved surface rule");
    assert.doesNotMatch(v3, /!important|\[class\*=|body\.is-after|\bfilter:\s*brightness\(/);
  }
  const allocation = await read(cssFiles.allocations);
  const dashboard = await read(cssFiles.dashboard);
  const investment = await read(cssFiles.investments);
  const accounts = await read(cssFiles.accounts);
  assert.match(allocation, /\.allocation-shortcuts__link\[data-tone="recurring"\]\s*\{\s*background: var\(--tonal-gradient-ocean\)/);
  assert.match(allocation, /\.allocation-shortcuts__link\[data-tone="commitment"\]\s*\{\s*background: var\(--tonal-gradient-purple\)/);
  assert.match(allocation, /\.allocation-shortcuts__link\[data-tone="goal"\]\s*\{\s*background: var\(--tonal-gradient-green\)/);
  assert.match(dashboard, /\.mobile-family-hero__art img\s*\{\s*filter: var\(--tonal-hero-art-filter\)/);
  assert.match(investment, /\.emptyInvestmentArtwork\s*\{\s*filter: drop-shadow\([^;]*var\(--tonal-hero-art-filter\)/);
  assert.doesNotMatch(accounts.split("/* Approved V3 tonal surfaces")[1], /\b(?:img|logo|bankCard|mobileStackCard)\b/);
});

test("asset tuning does not override financial status, focus controls, or accessibility semantics", async () => {
  const files = await Promise.all(Object.values(cssFiles).map(read));
  const appended = files.map((source) => source.split("/* Approved V3 tonal surfaces — scoped to this feature module. */")[1]?.split("/* End approved V3 mobile surfaces. */")[0]).join("\n");
  assert.doesNotMatch(appended, /\b(?:positive|negative|warning|focus-ring|on-primary|status-badge|error|invalid)\s*:/);
  assert.doesNotMatch(appended, /\b(?::focus-visible|aria-|data-state|data-pace)\b/);
  for (const file of files) assert.doesNotMatch(file.split("/* Approved V3 tonal surfaces — scoped to this feature module. */")[1]?.split("/* End approved V3 mobile surfaces. */")[0], /(?:cursor|pointer-events|display|position):/);
});
