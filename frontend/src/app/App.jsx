import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import LoadingScreen from "../components/feedback/LoadingScreen.jsx";
import RequireAuth from "../features/auth/RequireAuth.jsx";
import LoginPage from "../features/auth/LoginPage.jsx";
import AppShell from "../layouts/AppShell.jsx";

const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage.jsx"));
const TransactionsPage = lazy(() => import("../features/transactions/TransactionsPage.jsx"));
const BudgetsPage = lazy(() => import("../features/budgets/BudgetsPage.jsx"));
const AllocationsPage = lazy(() => import("../features/allocations/AllocationsPage.jsx"));
const RecurringPage = lazy(() => import("../features/recurring/RecurringPage.jsx"));
const GoalsPage = lazy(() => import("../features/goals/GoalsPage.jsx"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage.jsx"));
const AccountsPage = lazy(() => import("../features/accounts/AccountsPage.jsx"));
const CategoriesPage = lazy(() => import("../features/categories/CategoriesPage.jsx"));
const ReconciliationsPage = lazy(() => import("../features/reconciliations/ReconciliationsPage.jsx"));
const SettingsLayout = lazy(() => import("../features/settings/SettingsLayout.jsx"));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage.jsx"));
const DeviceNotificationsPage = lazy(() => import("../features/settings/DeviceNotificationsPage.jsx"));
const GoogleIntegrationsPage = lazy(() => import("../features/settings/GoogleIntegrationsPage.jsx"));
const MembersSettingsPage = lazy(() => import("../features/settings/MembersSettingsPage.jsx"));
const ExportDataPage = lazy(() => import("../features/settings/ExportDataPage.jsx"));
const ImportTransactionsPage = lazy(() => import("../features/settings/ImportTransactionsPage.jsx"));
const BackupPage = lazy(() => import("../features/settings/BackupPage.jsx"));
const RecoveryPage = lazy(() => import("../features/settings/RecoveryPage.jsx"));
const PeriodControlPage = lazy(() => import("../features/settings/PeriodControlPage.jsx"));
const AuditPage = lazy(() => import("../features/settings/AuditPage.jsx"));
const NotFoundPage = lazy(() => import("../features/settings/NotFoundPage.jsx"));

const App = () => (
  <Suspense fallback={<LoadingScreen />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="transaksi" element={<TransactionsPage />} />
          <Route path="anggaran" element={<BudgetsPage />} />
          <Route path="alokasi" element={<AllocationsPage />} />
          <Route path="tagihan" element={<RecurringPage />} />
          <Route path="target" element={<GoalsPage />} />
          <Route path="laporan" element={<ReportsPage />} />
          <Route path="rekening" element={<AccountsPage />} />
          <Route path="rekonsiliasi" element={<ReconciliationsPage />} />
          <Route path="kategori" element={<CategoriesPage />} />
          <Route path="pengaturan" element={<SettingsLayout />}>
            <Route index element={<SettingsPage />} />
            <Route path="notifikasi" element={<DeviceNotificationsPage />} />
            <Route path="integrasi" element={<GoogleIntegrationsPage />} />
            <Route path="anggota" element={<MembersSettingsPage />} />
            <Route path="export" element={<ExportDataPage />} />
            <Route path="import" element={<ImportTransactionsPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="pemulihan" element={<RecoveryPage />} />
            <Route path="periode" element={<PeriodControlPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Route>
    </Routes>
  </Suspense>
);

export default App;
