import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./InvestmentsPage.module.css";

const InvestmentOverview = lazy(() => import("./InvestmentOverview.jsx"));
const InvestmentHoldingDetail = lazy(() => import("./InvestmentHoldingDetail.jsx"));
const InvestmentDialog = lazy(() => import("./InvestmentDialog.jsx"));
const InvestmentSetupDialog = lazy(() => import("./InvestmentSetupDialog.jsx"));

const investmentRdnAccountId = (portfolio) => String(portfolio?.rdn_account_id || portfolio?.account_id || "");

const investmentSuccessMessage = (mode) => ({
  buy: "Pembelian saham berhasil dicatat.",
  sell: "Penjualan saham berhasil dicatat.",
  price: "Harga manual saham berhasil disimpan.",
  correction: "Koreksi pencatatan investasi berhasil disimpan.",
})[mode] || "Catatan investasi berhasil disimpan.";

const InvestmentContinuation = ({ setup, trade, onDismissSetup, onFund, onDismissTrade, onWithdraw }) => <>
  {setup ? <div>
    <CompactNotice tone="success" title="Catatan portfolio siap." role="status">Portfolio sudah terhubung ke RDN. Tambahkan dana melalui Transfer bila Cash RDN belum cukup; transfer tidak menjadi pemasukan atau pengeluaran.</CompactNotice>
    <div className="form-actions"><Button type="button" onClick={onDismissSetup}>Selesai</Button><Button type="button" variant="primary" onClick={onFund}>Tambah dana ke RDN</Button></div>
  </div> : null}
  {trade ? <div>
    <CompactNotice tone="success" title="Penjualan saham berhasil dicatat." role="status"><Money value={trade.amount} /> sudah kembali menjadi Cash RDN. Dana tersebut masih bagian dari aset internal sampai Anda memindahkannya ke rekening lain.</CompactNotice>
    <div className="form-actions"><Button type="button" onClick={onDismissTrade}>Selesai</Button><Button type="button" variant="primary" onClick={onWithdraw}>Tarik dana ke rekening</Button></div>
  </div> : null}
</>;

const portfolioForRdn = (portfolios, rdnAccountId) => portfolios.find((item) => investmentRdnAccountId(item) === rdnAccountId) || null;

const useInvestmentRouteContinuation = ({ location, navigate, overviewData, accountsData, portfolios, setSetupMode, setSetupRdnAccountId, setSetupOpen, setDialog, setHoldingDetail }) => {
  useEffect(() => {
    const workflow = location.state;
    if (!workflow?.workflowAction || !overviewData || !accountsData) return;
    const rdnAccountId = String(workflow.rdnAccountId || "");
    const portfolio = portfolioForRdn(portfolios, rdnAccountId);
    const requestedAction = workflow.openAction === "buy" ? "buy" : "";
    if (workflow.workflowAction === "setup-portfolio") {
      setSetupMode("portfolio");
      setSetupRdnAccountId(rdnAccountId);
      setSetupOpen(true);
    } else if (workflow.workflowAction === "continue-after-rdn-funding") {
      if (portfolio && portfolio.can_operate !== false) setDialog({ mode: requestedAction || "buy", portfolio });
      else if (!portfolio) {
        setSetupMode("portfolio");
        setSetupRdnAccountId(rdnAccountId);
        setSetupOpen(true);
      }
    } else if (workflow.workflowAction === "view-investment") {
      if (portfolio?.holdings?.length === 1) setHoldingDetail({ portfolio, holding: portfolio.holdings[0] });
      else if (!portfolio && workflow.ensureSetup) {
        setSetupMode("portfolio");
        setSetupRdnAccountId(rdnAccountId);
        setSetupOpen(true);
      }
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [accountsData, location.pathname, location.state, navigate, overviewData, portfolios, setDialog, setHoldingDetail, setSetupMode, setSetupOpen, setSetupRdnAccountId]);
};

const InvestmentOverlays = ({ page }) => {
  const { accounts, needsRdnRepair, data, dialog, setDialog, setupOpen, setupMode, setupRdnAccountId, setSetupOpen, setSetupRdnAccountId, holdingDetail, setHoldingDetail, user, onSetupSuccess, onInvestmentSuccess, fundRdnForPortfolio, openAction } = page;
  return <Suspense fallback={null}>
    {setupOpen ? <InvestmentSetupDialog
      accounts={accounts}
      owner={user?.role === "owner"}
      mode={setupMode}
      initialRdnAccountId={setupRdnAccountId}
      needsRdnRepair={needsRdnRepair}
      onClose={() => { setSetupOpen(false); setSetupRdnAccountId(""); }}
      onSuccess={onSetupSuccess}
    /> : null}
    {holdingDetail ? <InvestmentHoldingDetail
      portfolio={holdingDetail.portfolio}
      holding={holdingDetail.holding}
      onClose={() => setHoldingDetail(null)}
      onAction={(mode, portfolio, options = {}) => { setHoldingDetail(null); openAction(mode, portfolio, options); }}
    /> : null}
    {dialog ? <InvestmentDialog
      key={`${dialog.mode}:${dialog.portfolio?.portfolio_id || ""}:${dialog.initialInstrumentId || ""}`}
      mode={dialog.mode}
      portfolio={dialog.portfolio}
      instruments={data.instruments || []}
      userRole={user?.role}
      initialInstrumentId={dialog.initialInstrumentId || ""}
      onClose={() => setDialog(null)}
      onSuccess={onInvestmentSuccess}
      onOpenCorrection={(portfolio) => setDialog({ mode: "correction", portfolio })}
      onFundRdn={fundRdnForPortfolio}
    /> : null}
  </Suspense>;
};

const InvestmentsPageContent = ({ page }) => {
  const {
    user, overview, accountsResource, accounts, data, setupContinuation, setSetupContinuation, tradeContinuation, setTradeContinuation,
    openRdnAccountSetup, openSetup, setSetupMode, openRdnTransfer, openAction, setHoldingDetail,
  } = page;
  const emptyAction = accounts.length
    ? <Button icon={FiPlus} onClick={() => openSetup("portfolio")}>Siapkan catatan portfolio</Button>
    : <Button icon={FiPlus} onClick={openRdnAccountSetup}>Buat rekening RDN</Button>;
  return <div className={`page-stack ${styles.page}`}>
    <RefreshWarning error={overview.refreshError || accountsResource.refreshError} onRetry={() => { overview.reload().catch(() => {}); accountsResource.reload().catch(() => {}); }} />
    <PageHeader
      eyebrow="Pencatatan manual"
      title="Investasi"
      description="Catat saham yang benar-benar Anda miliki dan transaksi yang sudah dilakukan di aplikasi investasi. Saldo Bersama tidak terhubung ke aplikasi investasi, tidak mengambil harga live, dan tidak mengirim order beli/jual."
      actions={<Button icon={FiPlus} onClick={() => openSetup("portfolio")}>{accounts.length ? "Siapkan catatan" : "Buat RDN"}</Button>}
      help="Investasi memakai rekening jenis Investasi sebagai RDN. Isi/tarik dana RDN dilakukan melalui Transfer internal; transaksi saham yang sudah terjadi di aplikasi investasi dicatat di sini dan tidak menjadi pemasukan/pengeluaran biasa."
    />
    <InvestmentContinuation
      setup={setupContinuation}
      trade={tradeContinuation}
      onDismissSetup={() => setSetupContinuation(null)}
      onFund={() => { const continuation = setupContinuation; setSetupContinuation(null); openRdnTransfer("fund", { rdn_account_id: continuation?.rdnAccountId }); }}
      onDismissTrade={() => setTradeContinuation(null)}
      onWithdraw={() => { const continuation = tradeContinuation; setTradeContinuation(null); openRdnTransfer("withdraw", continuation?.portfolio, continuation?.amount); }}
    />
    {data.portfolios.length === 0 ? <EmptyState
      title={accounts.length ? "Belum ada catatan portfolio" : "Belum ada rekening RDN"}
      description={accounts.length ? "Pilih rekening Investasi/RDN yang sudah ada, lalu pasangkan dengan catatan aset Anda." : "Mulai dengan membuat rekening jenis Investasi sebagai RDN. Setelah rekening siap, Anda akan diarahkan kembali untuk menyiapkan catatan investasi."}
      action={emptyAction}
    /> : <Suspense fallback={<LoadingScreen label="Menyiapkan rincian investasi" />}><InvestmentOverview data={data} owner={user?.role === "owner"} onAction={openAction} onSetup={(mode = "portfolio") => setSetupMode(mode)} onTransfer={openRdnTransfer} onHolding={(portfolio, holding) => setHoldingDetail({ portfolio, holding })} /></Suspense>}
    <InvestmentOverlays page={page} />
  </div>;
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
  const [holdingDetail, setHoldingDetail] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState("portfolio");
  const [setupRdnAccountId, setSetupRdnAccountId] = useState("");
  const [setupContinuation, setSetupContinuation] = useState(null);
  const [tradeContinuation, setTradeContinuation] = useState(null);
  const accounts = useMemo(() => (accountsResource.data?.items || []).filter((item) => item.status === "active" && item.account_type === "investment" && item.can_transact && !Number(item.allow_negative)), [accountsResource.data]);
  const needsRdnRepair = !accounts.length && (accountsResource.data?.items || []).some((item) => item.account_type === "investment");
  const portfolios = useMemo(() => overview.data?.portfolios || [], [overview.data?.portfolios]);
  useInvestmentRouteContinuation({ location, navigate, overviewData: overview.data, accountsData: accountsResource.data, portfolios, setSetupMode, setSetupRdnAccountId, setSetupOpen, setDialog, setHoldingDetail });
  if (overview.status === "loading" || accountsResource.status === "loading") return <LoadingScreen label="Memuat investasi..." />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  const data = overview.data || { summary: {}, portfolios: [], instruments: [] };
  const openRdnAccountSetup = () => navigate("/rekening", { state: { workflowSource: "investment", workflowAction: "create-rdn" } });
  const openSetup = (mode = "portfolio") => {
    if (mode === "portfolio" && !accounts.length) { openRdnAccountSetup(); return; }
    setSetupMode(mode === "instrument" ? "instrument" : "portfolio");
    setSetupOpen(true);
  };
  const openRdnTransfer = (direction, portfolio, suggestedAmount = 0) => {
    const rdnAccountId = investmentRdnAccountId(portfolio);
    if (!rdnAccountId) return;
    const deposit = direction === "fund";
    openTransactionComposer({ initialType: TRANSACTION_TYPES.TRANSFER, initialSourceAccountId: deposit ? "" : rdnAccountId, initialDraft: { transaction_type: TRANSACTION_TYPES.TRANSFER, source_account_id: deposit ? "" : rdnAccountId, destination_account_id: deposit ? rdnAccountId : "", amount: suggestedAmount > 0 ? String(suggestedAmount) : "" } });
  };
  const fundRdnForPortfolio = (portfolio) => {
    setDialog(null);
    openRdnTransfer("fund", portfolio);
  };
  const onSetupSuccess = (mode, form, saved) => {
    notify({ message: mode === "portfolio" ? "Catatan portfolio investasi berhasil disimpan." : "Instrumen investasi berhasil disimpan.", tone: "success", dedupeKey: `investments:setup:${mode}` });
    if (mode === "portfolio") setSetupContinuation({ rdnAccountId: String(saved?.rdn_account_id || form.rdn_account_id || "") });
  };
  const onInvestmentSuccess = (mode, portfolio, result) => {
    if (mode === "reconcile") return;
    notify({ message: investmentSuccessMessage(mode), tone: "success", dedupeKey: `investments:${mode}` });
    if (mode === "sell") setTradeContinuation({ portfolio, amount: Number(result?.cash_amount || 0) });
  };
  const openAction = (mode, portfolio, options = {}) => setDialog({ mode, portfolio, ...options });
  return <InvestmentsPageContent page={{ user, overview, accountsResource, accounts, needsRdnRepair, data, dialog, setDialog, holdingDetail, setHoldingDetail, setupOpen, setSetupOpen, setupMode, setSetupMode: openSetup, setupRdnAccountId, setSetupRdnAccountId, setupContinuation, setSetupContinuation, tradeContinuation, setTradeContinuation, openRdnAccountSetup, openSetup, openRdnTransfer, onSetupSuccess, onInvestmentSuccess, openAction, fundRdnForPortfolio }} />;
};

export default InvestmentsPage;
