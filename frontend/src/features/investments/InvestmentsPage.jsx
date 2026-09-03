import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import Button from "../../components/common/Button.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./InvestmentsPage.module.css";

const InvestmentOverview = lazy(() => import("./InvestmentOverview.jsx"));
const InvestmentDialog = lazy(() => import("./InvestmentDialog.jsx"));
const InvestmentSetupDialog = lazy(() => import("./InvestmentSetupDialog.jsx"));
const InvestmentHoldingDetail = lazy(() => import("./InvestmentHoldingDetail.jsx"));


const INVESTMENT_SUCCESS_MESSAGES = Object.freeze({
  buy: "Pembelian saham berhasil dicatat.",
  sell: "Penjualan saham berhasil dicatat.",
  price: "Harga manual saham berhasil disimpan.",
  reconcile: "Pencocokan tersimpan tanpa mengubah catatan otomatis.",
  correction: "Koreksi pencatatan investasi berhasil disimpan.",
});

const InvestmentLayers = ({ setupMode, setSetupMode, accountSetupState, owner, onSetupSuccess, dialog, setDialog, instruments, onAddFunds, onMutationSuccess, holdingDetail, setHoldingDetail }) => (
  <Suspense fallback={null}>
    {setupMode ? (
      <InvestmentSetupDialog
        accounts={accountSetupState.eligible}
        blockedAccounts={accountSetupState.negative}
        linkedAccounts={accountSetupState.linked}
        owner={owner}
        mode={setupMode}
        preferredRdnAccountId={accountSetupState.preferredRdnAccountId || ""}
        onClose={() => setSetupMode(null)}
        onSuccess={onSetupSuccess}
      />
    ) : null}
    {dialog ? (
      <InvestmentDialog
        mode={dialog.mode}
        portfolio={dialog.portfolio}
        instruments={instruments}
        userRole={owner ? "owner" : "member"}
        onAddFunds={onAddFunds}
        onClose={() => setDialog(null)}
        onSuccess={onMutationSuccess}
      />
    ) : null}
    {holdingDetail ? <InvestmentHoldingDetail holding={holdingDetail.holding} activity={holdingDetail.portfolio.activity || []} onClose={() => setHoldingDetail(null)} /> : null}
  </Suspense>
);

const routeIntent = (state) => ({
  rdnAccountId: typeof state?.rdnAccountId === "string" ? state.rdnAccountId : "",
  openAction: state?.openAction === "buy" ? "buy" : "",
  ensureSetup: state?.ensureSetup === true,
});

const clearInvestmentRouteIntent = (location, navigate) => {
  const next = { ...(location.state || {}) };
  delete next.rdnAccountId;
  delete next.openAction;
  delete next.ensureSetup;
  navigate(location.pathname, { replace: true, state: next });
};

const useInvestmentRouteIntent = ({ location, navigate, overview, accountsReady, dialog, setDialog, setSetupMode, setPreferredRdnAccountId }) => {
  useEffect(() => {
    const intent = routeIntent(location.state);
    if (!intent.rdnAccountId || overview.status !== "ready" || !accountsReady) return;
    const portfolio = (overview.data?.portfolios || []).find((item) => item.rdn_account_id === intent.rdnAccountId) || null;
    if (portfolio) {
      globalThis.requestAnimationFrame?.(() => document.getElementById(`investment-rdn-${intent.rdnAccountId}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
      const hasBuyInstrument = (overview.data?.instruments || []).some((item) => item.status === "active");
      if (intent.openAction === "buy" && portfolio.can_operate && hasBuyInstrument && !dialog) setDialog({ mode: "buy", portfolio });
    } else if (intent.ensureSetup) {
      setPreferredRdnAccountId(intent.rdnAccountId);
      setSetupMode("portfolio");
    }
    clearInvestmentRouteIntent(location, navigate);
  }, [accountsReady, dialog, location, navigate, overview.data, overview.status, setDialog, setPreferredRdnAccountId, setSetupMode]);
};

const InvestmentsPage = () => {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const { openTransactionComposer } = useTransactionComposer();
  const location = useLocation();
  const navigate = useNavigate();
  const overview = useApiResource("investments.overview");
  const accountsResource = useApiResource("accounts.list");
  const [dialog, setDialog] = useState(null);
  const [setupMode, setSetupMode] = useState(null);
  const [preferredRdnAccountId, setPreferredRdnAccountId] = useState("");
  const [holdingDetail, setHoldingDetail] = useState(null);

  const accountSetupState = useMemo(() => {
    const activeInvestmentAccounts = (accountsResource.data?.items || [])
      .filter((item) => item.status === "active" && item.account_type === "investment" && item.can_transact)
      .map((item) => ({ ...item, display_label: accountDisplayLabel(item) }));
    const linkedRdnIds = new Set((overview.data?.portfolios || []).map((item) => item.rdn_account_id));
    return {
      eligible: activeInvestmentAccounts.filter((item) => !Number(item.allow_negative) && !linkedRdnIds.has(item.account_id)),
      negative: activeInvestmentAccounts.filter((item) => Number(item.allow_negative)),
      linked: activeInvestmentAccounts.filter((item) => !Number(item.allow_negative) && linkedRdnIds.has(item.account_id)),
    };
  }, [accountsResource.data, overview.data?.portfolios]);
  useInvestmentRouteIntent({ location, navigate, overview, accountsReady: accountsResource.status === "ready", dialog, setDialog, setSetupMode, setPreferredRdnAccountId });

  if (overview.status === "loading" || accountsResource.status === "loading") return <LoadingScreen label="Memuat investasi..." />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;

  const data = overview.data || { summary: {}, portfolios: [], instruments: [] };
  const openRdnTransfer = (direction, portfolio) => {
    const rdnAccountId = portfolio?.rdn_account_id || "";
    if (!rdnAccountId) return;
    const deposit = direction === "deposit";
    openTransactionComposer({
      initialType: TRANSACTION_TYPES.TRANSFER,
      initialSourceAccountId: deposit ? "" : rdnAccountId,
      initialDraft: {
        transaction_type: TRANSACTION_TYPES.TRANSFER,
        source_account_id: deposit ? "" : rdnAccountId,
        destination_account_id: deposit ? rdnAccountId : "",
        description: deposit ? "Tambah dana RDN investasi" : "Tarik dana RDN investasi",
      },
    });
  };

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
        description="Catat saham yang benar-benar Anda miliki dan transaksi yang sudah dilakukan di aplikasi investasi. Saldo Bersama tidak terhubung ke aplikasi investasi, tidak mengambil harga live, dan tidak mengirim order beli/jual."
        actions={<Button icon={FiPlus} onClick={() => setSetupMode("portfolio")}>Tambah catatan RDN</Button>}
        help="Rekening jenis Investasi menyimpan Cash RDN. Catat beli/jual menyimpan perubahan aset saham secara manual; Bank ↔ RDN tetap menggunakan Transfer dan tidak menjadi pemasukan/pengeluaran biasa."
      />
      {data.portfolios.length === 0 ? (
        <EmptyState
          title="Belum ada catatan investasi"
          description="Mulai dari rekening Investasi sebagai RDN. Setelah itu Anda dapat mencatat saham apa yang dibeli, jumlah lot/lembar, harga, fee, holding, serta hasil investasi secara manual."
          action={<Button icon={FiPlus} onClick={() => setSetupMode("portfolio")}>Siapkan catatan investasi</Button>}
        />
      ) : (
        <Suspense fallback={<LoadingScreen variant="content" label="Menyiapkan rincian investasi..." />}>
          <InvestmentOverview
            data={data}
            owner={user?.role === "owner"}
            onAction={(mode, portfolio) => setDialog({ mode, portfolio })}
            onSetup={(mode = "portfolio") => setSetupMode(mode)}
            onTransfer={openRdnTransfer}
            onHoldingDetail={(portfolio, holding) => setHoldingDetail({ portfolio, holding })}
          />
        </Suspense>
      )}

      <InvestmentLayers
        setupMode={setupMode}
        setSetupMode={setSetupMode}
        accountSetupState={{ ...accountSetupState, preferredRdnAccountId }}
        owner={user?.role === "owner"}
        onSetupSuccess={(kind) => { setPreferredRdnAccountId(""); notify({ message: kind === "portfolio" ? "Catatan investasi berhasil disiapkan." : "Instrumen saham berhasil disimpan.", tone: "success", dedupeKey: `investments:setup:${kind}` }); }}
        dialog={dialog}
        setDialog={setDialog}
        instruments={data.instruments || []}
        onAddFunds={(portfolio) => openRdnTransfer("deposit", portfolio)}
        onMutationSuccess={(mode) => notify({ message: INVESTMENT_SUCCESS_MESSAGES[mode] || "Catatan investasi berhasil disimpan.", tone: "success", dedupeKey: `investments:${mode}` })}
        holdingDetail={holdingDetail}
        setHoldingDetail={setHoldingDetail}
      />
    </div>
  );
};

export default InvestmentsPage;
