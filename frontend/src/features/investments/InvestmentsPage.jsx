import { lazy, Suspense, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "../../components/common/Button.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import InvestmentOverview from "./InvestmentOverview.jsx";
import styles from "./InvestmentsPage.module.css";

const InvestmentDialog = lazy(() => import("./InvestmentDialog.jsx"));
const InvestmentSetupDialog = lazy(() => import("./InvestmentSetupDialog.jsx"));

const InvestmentsPage = () => {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const overview = useApiResource("investments.overview");
  const accountsResource = useApiResource("accounts.list");
  const [dialog, setDialog] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const accounts = useMemo(
    () => (accountsResource.data?.items || []).filter((item) => item.status === "active" && item.account_type === "investment" && item.can_transact && !Number(item.allow_negative)),
    [accountsResource.data],
  );

  if (overview.status === "loading" || accountsResource.status === "loading") return <LoadingScreen label="Memuat investasi..." />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;

  const data = overview.data || { summary: {}, portfolios: [], instruments: [] };
  return (
    <div className={`page-stack ${styles.page}`}>
      <RefreshWarning
        error={overview.refreshError || accountsResource.refreshError}
        onRetry={() => {
          overview.reload().catch(() => {});
          accountsResource.reload().catch(() => {});
        }}
      />
      <PageHeader
        eyebrow="Pencatatan manual"
        title="Investasi"
        description="Catat portfolio yang Anda miliki di Ajaib atau broker lain secara manual. Saldo Bersama tidak terhubung ke broker dan tidak mengirim order beli/jual."
        actions={<Button icon={FiPlus} onClick={() => setSetupOpen(true)}>Siapkan catatan</Button>}
        help="Investasi memakai rekening jenis Investasi sebagai RDN. Isi/tarik dana RDN dilakukan melalui Transfer rekening; transaksi saham yang sudah terjadi di broker dicatat di sini dan tidak menjadi pemasukan/pengeluaran biasa."
      />
      {data.portfolios.length === 0 ? (
        <EmptyState
          title="Belum ada catatan portfolio"
          description="Saldo Bersama mencatat investasi broker secara manual. Buat rekening jenis Investasi untuk RDN, lalu pasangkan rekening itu dengan catatan portfolio Anda."
          action={<Button icon={FiPlus} onClick={() => setSetupOpen(true)}>Siapkan catatan portfolio</Button>}
        />
      ) : (
        <InvestmentOverview
          data={data}
          owner={user?.role === "owner"}
          onAction={(mode, portfolio) => setDialog({ mode, portfolio })}
          onSetup={() => setSetupOpen(true)}
        />
      )}

      <Suspense fallback={null}>
        {setupOpen ? (
          <InvestmentSetupDialog
            accounts={accounts}
            owner={user?.role === "owner"}
            onClose={() => setSetupOpen(false)}
            onSuccess={(kind) => notify({ message: kind === "portfolio" ? "Catatan portfolio investasi berhasil disimpan." : "Instrumen investasi berhasil disimpan.", tone: "success", dedupeKey: `investments:setup:${kind}` })}
          />
        ) : null}
        {dialog ? (
          <InvestmentDialog
            mode={dialog.mode}
            portfolio={dialog.portfolio}
            instruments={data.instruments || []}
            userRole={user?.role}
            onClose={() => setDialog(null)}
            onSuccess={(mode) => {
              const messages = { buy: "Pembelian saham berhasil dicatat.", sell: "Penjualan saham berhasil dicatat.", price: "Harga manual saham berhasil disimpan.", reconcile: "Pencocokan tersimpan tanpa mengubah portfolio otomatis.", correction: "Koreksi pencatatan investasi berhasil disimpan." };
              notify({ message: messages[mode] || "Catatan investasi berhasil disimpan.", tone: "success", dedupeKey: `investments:${mode}` });
            }}
          />
        ) : null}
      </Suspense>
    </div>
  );
};

export default InvestmentsPage;
