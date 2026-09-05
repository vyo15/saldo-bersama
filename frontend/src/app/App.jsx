import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import DelayedLoadingScreen from "../components/feedback/DelayedLoadingScreen.jsx";
import LoadingScreen from "../components/feedback/LoadingScreen.jsx";
import RequireAuth from "../features/auth/RequireAuth.jsx";
import {
  loadActiveSessionsPage,
  loadApprovalCenterPage,
  loadAccountsPage,
  loadAuditPage,
  loadBackupPage,
  loadBudgetsPage,
  loadCategoriesPage,
  loadDashboardPage,
  loadDataStoragePage,
  loadDeviceNotificationsPage,
  loadExportDataPage,
  loadGoalsPage,
  loadGoogleIntegrationsPage,
  loadImportTransactionsPage,
  loadInvestmentsPage,
  loadLoginPage,
  loadMaintenanceDataPage,
  loadMembersSettingsPage,
  loadNotFoundPage,
  loadNotificationsPage,
  loadPeriodControlPage,
  loadPlanningPage,
  loadReconciliationsPage,
  loadRecoveryPage,
  loadReportsPage,
  loadSettingsLayout,
  loadSettingsPage,
  loadTransactionsPage,
} from "./routeModules.js";

const AppShell = lazy(() => import("../layouts/AppShell.jsx"));
const LoginPage = lazy(loadLoginPage);
const DashboardPage = lazy(loadDashboardPage);
const TransactionsPage = lazy(loadTransactionsPage);
const PlanningPage = lazy(loadPlanningPage);
const BudgetsPage = lazy(loadBudgetsPage);
const GoalsPage = lazy(loadGoalsPage);
const ReportsPage = lazy(loadReportsPage);
const AccountsPage = lazy(loadAccountsPage);
const InvestmentsPage = lazy(loadInvestmentsPage);
const CategoriesPage = lazy(loadCategoriesPage);
const ApprovalCenterPage = lazy(loadApprovalCenterPage);
const ReconciliationsPage = lazy(loadReconciliationsPage);
const NotificationsPage = lazy(loadNotificationsPage);
const SettingsLayout = lazy(loadSettingsLayout);
const SettingsPage = lazy(loadSettingsPage);
const DeviceNotificationsPage = lazy(loadDeviceNotificationsPage);
const ActiveSessionsPage = lazy(loadActiveSessionsPage);
const GoogleIntegrationsPage = lazy(loadGoogleIntegrationsPage);
const MembersSettingsPage = lazy(loadMembersSettingsPage);
const DataStoragePage = lazy(loadDataStoragePage);
const ExportDataPage = lazy(loadExportDataPage);
const ImportTransactionsPage = lazy(loadImportTransactionsPage);
const BackupPage = lazy(loadBackupPage);
const RecoveryPage = lazy(loadRecoveryPage);
const MaintenanceDataPage = lazy(loadMaintenanceDataPage);
const PeriodControlPage = lazy(loadPeriodControlPage);
const AuditPage = lazy(loadAuditPage);
const NotFoundPage = lazy(loadNotFoundPage);

const RouteMotion = ({ children }) => {
  const location = useLocation();
  return <div key={location.pathname} className="route-content-enter">{children}</div>;
};

const routeElement = (Component, {
  loadingVariant = "content",
  delayedLoader = loadingVariant === "content",
  motion = true,
} = {}) => {
  const fallback = delayedLoader
    ? <DelayedLoadingScreen variant={loadingVariant} />
    : <LoadingScreen variant={loadingVariant} />;

  return (
    <Suspense fallback={fallback}>
      {motion ? <RouteMotion><Component /></RouteMotion> : <Component />}
    </Suspense>
  );
};

const LegacyPlanningRedirect = ({ to }) => {
  const location = useLocation();
  return <Navigate to={to} replace state={location.state} />;
};

const App = () => (
  <Routes>
    <Route path="/login" element={routeElement(LoginPage, { loadingVariant: "page", delayedLoader: false, motion: false })} />
    <Route element={<RequireAuth />}>
      <Route element={routeElement(AppShell, { loadingVariant: "page", delayedLoader: false, motion: false })}>
        <Route index element={routeElement(DashboardPage)} />
        <Route path="transaksi" element={routeElement(TransactionsPage)} />
        <Route path="perencanaan" element={<Navigate to="/perencanaan/kantong" replace />} />
        <Route path="perencanaan/kantong" element={routeElement(PlanningPage)} />
        <Route path="perencanaan/jadwal" element={routeElement(PlanningPage)} />
        <Route path="anggaran" element={routeElement(BudgetsPage)} />
        <Route path="perencanaan/kebutuhan" element={<Navigate to="/anggaran" replace />} />
        <Route path="alokasi" element={<LegacyPlanningRedirect to="/perencanaan/kantong" />} />
        <Route path="tagihan" element={<LegacyPlanningRedirect to="/perencanaan/jadwal" />} />
        <Route path="target" element={routeElement(GoalsPage)} />
        <Route path="laporan" element={routeElement(ReportsPage)} />
        <Route path="rekening" element={routeElement(AccountsPage)} />
        <Route path="investasi" element={routeElement(InvestmentsPage)} />
        <Route path="rekonsiliasi" element={routeElement(ReconciliationsPage)} />
        <Route path="notifikasi" element={routeElement(NotificationsPage)} />
        <Route path="kategori" element={routeElement(CategoriesPage)} />
        <Route path="anggota" element={routeElement(MembersSettingsPage)} />
        <Route path="persetujuan" element={routeElement(ApprovalCenterPage)} />
        <Route path="pengaturan" element={routeElement(SettingsLayout, { motion: false })}>
          <Route index element={routeElement(SettingsPage)} />
          <Route path="notifikasi" element={routeElement(DeviceNotificationsPage)} />
          <Route path="perangkat" element={routeElement(ActiveSessionsPage)} />
          <Route path="integrasi" element={routeElement(GoogleIntegrationsPage)} />
          <Route path="anggota" element={<Navigate to="/anggota" replace />} />
          <Route path="data" element={routeElement(DataStoragePage)} />
          <Route path="export" element={routeElement(ExportDataPage)} />
          <Route path="import" element={routeElement(ImportTransactionsPage)} />
          <Route path="backup" element={routeElement(BackupPage)} />
          <Route path="pemulihan" element={routeElement(RecoveryPage)} />
          <Route path="pemeliharaan" element={routeElement(MaintenanceDataPage)} />
          <Route path="reset-data" element={<Navigate to="/pengaturan/pemeliharaan" replace />} />
          <Route path="reset-semua" element={<Navigate to="/pengaturan/pemeliharaan?tab=semua" replace />} />
          <Route path="periode" element={routeElement(PeriodControlPage)} />
          <Route path="audit" element={routeElement(AuditPage)} />
        </Route>
        <Route path="404" element={routeElement(NotFoundPage)} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Route>
  </Routes>
);

export default App;
