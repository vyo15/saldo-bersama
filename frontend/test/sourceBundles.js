import { readFile } from "node:fs/promises";

const srcRoot = new URL("../src/", import.meta.url);
const readSource = (relativePath) => readFile(new URL(relativePath, srcRoot), "utf8");
const readCombined = (paths) => Promise.all(paths.map(readSource)).then((parts) => parts.join("\n"));

// Source-contract tests assert feature behavior across responsibility modules rather than
// forcing extracted logic back into the orchestration shell after maintainability refactors.
export const readDesktopDashboardSource = () => readCombined([
  "features/dashboard/components/DesktopFinanceDashboard.jsx",
  "features/dashboard/components/desktopDashboardModel.js",
  "features/dashboard/components/DesktopDashboardSummary.jsx",
  "features/dashboard/components/DesktopDashboardTransactions.jsx",
  "features/dashboard/components/DesktopDashboardInsights.jsx",
  "features/dashboard/components/DesktopDashboardPlanning.jsx",
]);

export const readCategoryFeatureSource = () => readCombined([
  "features/categories/CategoriesPage.jsx",
  "features/categories/CategoryDialogs.jsx",
  "features/categories/CategoryIconPicker.jsx",
  "features/categories/categoryUi.js",
]);

export const readMobileAccountStackSource = () => readCombined([
  "features/accounts/components/MobileAccountsExperience.jsx",
  "features/accounts/components/useMobileAccountStack.js",
]);
