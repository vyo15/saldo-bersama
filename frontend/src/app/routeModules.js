const routeLoaders = Object.freeze({
  login: () => import("../features/auth/LoginPage.jsx"),
  dashboard: () => import("../features/dashboard/DashboardPage.jsx"),
  transactions: () => import("../features/transactions/TransactionsPage.jsx"),
  planning: () => import("../features/planning/PlanningPage.jsx"),
  budgets: () => import("../features/budgets/BudgetsPage.jsx"),
  goals: () => import("../features/goals/GoalsPage.jsx"),
  reports: () => import("../features/reports/ReportsPage.jsx"),
  accounts: () => import("../features/accounts/AccountsPage.jsx"),
  investments: () => import("../features/investments/InvestmentsPage.jsx"),
  categories: () => import("../features/categories/CategoriesPage.jsx"),
  approvals: () => import("../features/approvals/ApprovalCenterPage.jsx"),
  reconciliations: () => import("../features/reconciliations/ReconciliationsPage.jsx"),
  notifications: () => import("../features/notifications/NotificationsPage.jsx"),
  settingsLayout: () => import("../features/settings/SettingsLayout.jsx"),
  settings: () => import("../features/settings/SettingsPage.jsx"),
  deviceNotifications: () => import("../features/settings/DeviceNotificationsPage.jsx"),
  activeSessions: () => import("../features/settings/ActiveSessionsPage.jsx"),
  googleIntegrations: () => import("../features/settings/GoogleIntegrationsPage.jsx"),
  members: () => import("../features/settings/MembersSettingsPage.jsx"),
  dataStorage: () => import("../features/settings/DataStoragePage.jsx"),
  exportData: () => import("../features/settings/ExportDataPage.jsx"),
  importTransactions: () => import("../features/settings/ImportTransactionsPage.jsx"),
  backup: () => import("../features/settings/BackupPage.jsx"),
  recovery: () => import("../features/settings/RecoveryPage.jsx"),
  maintenance: () => import("../features/settings/MaintenanceDataPage.jsx"),
  periodControl: () => import("../features/settings/PeriodControlPage.jsx"),
  audit: () => import("../features/settings/AuditPage.jsx"),
  notFound: () => import("../features/settings/NotFoundPage.jsx"),
});

export const {
  login: loadLoginPage,
  dashboard: loadDashboardPage,
  transactions: loadTransactionsPage,
  planning: loadPlanningPage,
  budgets: loadBudgetsPage,
  goals: loadGoalsPage,
  reports: loadReportsPage,
  accounts: loadAccountsPage,
  investments: loadInvestmentsPage,
  categories: loadCategoriesPage,
  approvals: loadApprovalCenterPage,
  reconciliations: loadReconciliationsPage,
  notifications: loadNotificationsPage,
  settingsLayout: loadSettingsLayout,
  settings: loadSettingsPage,
  deviceNotifications: loadDeviceNotificationsPage,
  activeSessions: loadActiveSessionsPage,
  googleIntegrations: loadGoogleIntegrationsPage,
  members: loadMembersSettingsPage,
  dataStorage: loadDataStoragePage,
  exportData: loadExportDataPage,
  importTransactions: loadImportTransactionsPage,
  backup: loadBackupPage,
  recovery: loadRecoveryPage,
  maintenance: loadMaintenanceDataPage,
  periodControl: loadPeriodControlPage,
  audit: loadAuditPage,
  notFound: loadNotFoundPage,
} = routeLoaders;

const SETTINGS_LAYOUT = routeLoaders.settingsLayout;
const ROUTE_PREFETCH = new Map([
  ["/", [routeLoaders.dashboard]],
  ["/transaksi", [routeLoaders.transactions]],
  ["/perencanaan", [routeLoaders.planning]],
  ["/perencanaan/kantong", [routeLoaders.planning]],
  ["/perencanaan/jadwal", [routeLoaders.planning]],
  ["/alokasi", [routeLoaders.planning]],
  ["/tagihan", [routeLoaders.planning]],
  ["/anggaran", [routeLoaders.budgets]],
  ["/perencanaan/kebutuhan", [routeLoaders.budgets]],
  ["/target", [routeLoaders.goals]],
  ["/laporan", [routeLoaders.reports]],
  ["/rekening", [routeLoaders.accounts]],
  ["/investasi", [routeLoaders.investments]],
  ["/kategori", [routeLoaders.categories]],
  ["/anggota", [routeLoaders.members]],
  ["/persetujuan", [routeLoaders.approvals]],
  ["/rekonsiliasi", [routeLoaders.reconciliations]],
  ["/notifikasi", [routeLoaders.notifications]],
  ["/pengaturan", [SETTINGS_LAYOUT, routeLoaders.settings]],
  ["/pengaturan/notifikasi", [SETTINGS_LAYOUT, routeLoaders.deviceNotifications]],
  ["/pengaturan/perangkat", [SETTINGS_LAYOUT, routeLoaders.activeSessions]],
  ["/pengaturan/integrasi", [SETTINGS_LAYOUT, routeLoaders.googleIntegrations]],
  ["/pengaturan/anggota", [routeLoaders.members]],
  ["/pengaturan/data", [SETTINGS_LAYOUT, routeLoaders.dataStorage]],
  ["/pengaturan/export", [SETTINGS_LAYOUT, routeLoaders.exportData]],
  ["/pengaturan/import", [SETTINGS_LAYOUT, routeLoaders.importTransactions]],
  ["/pengaturan/backup", [SETTINGS_LAYOUT, routeLoaders.backup]],
  ["/pengaturan/pemulihan", [SETTINGS_LAYOUT, routeLoaders.recovery]],
  ["/pengaturan/pemeliharaan", [SETTINGS_LAYOUT, routeLoaders.maintenance]],
  ["/pengaturan/reset-data", [SETTINGS_LAYOUT, routeLoaders.maintenance]],
  ["/pengaturan/reset-semua", [SETTINGS_LAYOUT, routeLoaders.maintenance]],
  ["/pengaturan/periode", [SETTINGS_LAYOUT, routeLoaders.periodControl]],
  ["/pengaturan/audit", [SETTINGS_LAYOUT, routeLoaders.audit]],
  ["/404", [routeLoaders.notFound]],
]);

const prefetchedPaths = new Set();

const normalizeRoutePath = (pathname) => {
  const raw = String(pathname || "/").split(/[?#]/, 1)[0];
  const normalized = `/${raw.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
};

export const preloadRoute = async (pathname) => {
  const normalized = normalizeRoutePath(pathname);
  const loaders = ROUTE_PREFETCH.get(normalized);
  if (!loaders?.length || prefetchedPaths.has(normalized)) return false;
  prefetchedPaths.add(normalized);
  try {
    await Promise.all(loaders.map((loader) => loader()));
    return true;
  } catch {
    prefetchedPaths.delete(normalized);
    return false;
  }
};

