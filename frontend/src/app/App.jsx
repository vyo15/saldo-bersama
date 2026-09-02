import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import LoadingScreen from "../components/feedback/LoadingScreen.jsx";
import RequireAuth from "../features/auth/RequireAuth.jsx";

const AppShell = lazy(() => import("../layouts/AppShell.jsx"));
const LoginPage = lazy(() => import("../features/auth/LoginPage.jsx"));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage.jsx"));
const TransactionsPage = lazy(() => import("../features/transactions/TransactionsPage.jsx"));
const PlanningPage = lazy(() => import("../features/planning/PlanningPage.jsx"));
const BudgetsPage = lazy(() => import("../features/budgets/BudgetsPage.jsx"));
const GoalsPage = lazy(() => import("../features/goals/GoalsPage.jsx"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage.jsx"));
const AccountsPage = lazy(() => import("../features/accounts/AccountsPage.jsx"));
const CategoriesPage = lazy(() => import("../features/categories/CategoriesPage.jsx"));
const ApprovalCenterPage = lazy(() => import("../features/approvals/ApprovalCenterPage.jsx"));
const ReconciliationsPage = lazy(() => import("../features/reconciliations/ReconciliationsPage.jsx"));
const SettingsLayout = lazy(() => import("../features/settings/SettingsLayout.jsx"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage.jsx"));
const DeviceNotificationsPage = lazy(() => import("../features/settings/DeviceNotificationsPage.jsx"));
const ActiveSessionsPage = lazy(() => import("../features/settings/ActiveSessionsPage.jsx"));
const GoogleIntegrationsPage = lazy(() => import("../features/settings/GoogleIntegrationsPage.jsx"));
const MembersSettingsPage = lazy(() => import("../features/settings/MembersSettingsPage.jsx"));
const ExportDataPage = lazy(() => import("../features/settings/ExportDataPage.jsx"));
const ImportTransactionsPage = lazy(() => import("../features/settings/ImportTransactionsPage.jsx"));
const BackupPage = lazy(() => import("../features/settings/BackupPage.jsx"));
const RecoveryPage = lazy(() => import("../features/settings/RecoveryPage.jsx"));
const ResetDataPage = lazy(() => import("../features/settings/ResetDataPage.jsx"));
const FullResetPage = lazy(() => import("../features/settings/FullResetPage.jsx"));
const PeriodControlPage = lazy(() => import("../features/settings/PeriodControlPage.jsx"));
const AuditPage = lazy(() => import("../features/settings/AuditPage.jsx"));
const NotFoundPage = lazy(() => import("../features/settings/NotFoundPage.jsx"));

const routeElement = (Component, { loadingVariant = "content" } = {}) => (
  <Suspense fallback={<LoadingScreen variant={loadingVariant} />}><Component /></Suspense>
);

const developmentRouteElement = (Component) => import.meta.env.MODE === "development" ? routeElement(Component) : <Navigate to="/404" replace />;

const LegacyPlanningRedirect = ({ to }) => {
  const location = useLocation();
  return <Navigate to={to} replace state={location.state} />;
};

const App = () => (
  <Routes>
    <Route path="/login" element={routeElement(LoginPage, { loadingVariant: "page" })} />
    <Route element={<RequireAuth />}>
      <Route element={routeElement(AppShell, { loadingVariant: "page" })}>
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
        <Route path="rekonsiliasi" element={routeElement(ReconciliationsPage)} />
        <Route path="kategori" element={routeElement(CategoriesPage)} />
        <Route path="anggota" element={routeElement(MembersSettingsPage)} />
        <Route path="persetujuan" element={routeElement(ApprovalCenterPage)} />
        <Route path="pengaturan" element={routeElement(SettingsLayout)}>
          <Route index element={routeElement(SettingsPage)} />
          <Route path="notifikasi" element={routeElement(DeviceNotificationsPage)} />
          <Route path="perangkat" element={routeElement(ActiveSessionsPage)} />
          <Route path="integrasi" element={routeElement(GoogleIntegrationsPage)} />
          <Route path="anggota" element={<Navigate to="/anggota" replace />} />
          <Route path="export" element={routeElement(ExportDataPage)} />
          <Route path="import" element={routeElement(ImportTransactionsPage)} />
          <Route path="backup" element={routeElement(BackupPage)} />
          <Route path="pemulihan" element={routeElement(RecoveryPage)} />
          <Route path="reset-data" element={developmentRouteElement(ResetDataPage)} />
          <Route path="reset-semua" element={routeElement(FullResetPage)} />
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
