import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { investmentContinuationState, investmentRdnAccountSetupState, readInvestmentContinuation } from "../../shared/workflows/investmentContinuation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./InvestmentsPage.module.css";

const InvestmentOverview = lazy(() => import("./InvestmentOverview.jsx"));
const InvestmentHoldingDetail = lazy(() => import("./InvestmentHoldingDetail.jsx"));
const InvestmentDialog = lazy(() => import("./InvestmentDialog.jsx"));
const InvestmentSetupDialog = lazy(() => import("./InvestmentSetupDialog.jsx"));

const investmentRdnAccountId = (portfolio) => String(portfolio?.rdn_account_id || portfolio?.account_id || "");
const activeInvestmentInstruments = (data) => (data?.instruments || []).filter((item) => item.status === "active");
const portfolioForRdn = (portfolios, rdnAccountId) => portfolios.find((item) => investmentRdnAccountId(item) === String(rdnAccountId || "")) || null;
const portfolioForId = (portfolios, portfolioId) => portfolios.find((item) => item.portfolio_id === String(portfolioId || "")) || null;

const investmentSuccessMessage = (mode) => ({
  buy: "Pembelian investasi berhasil dicatat.",
  sell: "Penjualan investasi berhasil dicatat.",
  price: "Nilai manual investasi berhasil diperbarui.",
  correction: "Koreksi investasi berhasil dicatat.",
  opening_position: "Posisi awal berhasil dicatat.",
})[mode] || "Catatan investasi berhasil disimpan.";

const SetupContinuation = ({ continuation, portfolio, data, owner, onDismiss, onStartNew, onStartExisting, onAddOpening }) => {
  if (!continuation) return null;
  if (!portfolio) {
    return <CompactNotice tone="info" title="Catatan tersimpan." role="status">Menyinkronkan Cash RDN dan holding terbaru sebelum langkah berikutnya tersedia.</CompactNotice>;
  }
  if (continuation.stage === "opening") {
    return <div>
      <CompactNotice tone="success" title="Posisi awal dicatat." role="status">Kondisi awal portfolio tersimpan sebagai event posisi awal, bukan transaksi pembelian palsu. Anda dapat menambahkan aset lain selama fase posisi awal masih terbuka.</CompactNotice>
      <div className="form-actions">
        <Button type="button" variant="primary" onClick={onDismiss}>Selesai</Button>
        {portfolio?.opening_position_available !== false ? <Button type="button" onClick={() => onAddOpening(portfolio)}>Tambah posisi awal lain</Button> : null}
      </div>
    </div>;
  }
  return <div>
    <CompactNotice tone="success" title="Portofolio siap. Saya mau mulai dari:" role="status">Pilih apakah Anda akan mencatat transaksi baru atau memasukkan kondisi investasi yang sudah ada. Cash RDN dan posisi awal tidak perlu direkonstruksi sebagai transaksi masa lalu.</CompactNotice>
    <div className="form-actions">
      <Button type="button" variant="primary" onClick={() => onStartNew(portfolio)}>Mulai mencatat transaksi baru</Button>
      <Button type="button" onClick={() => onStartExisting(portfolio, data, owner)}>Saya sudah punya investasi</Button>
      <Button type="button" onClick={onDismiss}>Nanti</Button>
    </div>
  </div>;
};

const SellContinuation = ({ continuation, onDismiss, onWithdraw, onBuyAgain }) => continuation ? <div>
  <CompactNotice tone="success" title="Penjualan investasi selesai dicatat." role="status"><Money value={continuation.amount} /> sudah menjadi Cash RDN. Dana tetap berada di aset internal; penarikan ke rekening tidak dilakukan otomatis.</CompactNotice>
  <div className="form-actions">
    <Button type="button" variant="primary" onClick={onDismiss}>Selesai</Button>
    <Button type="button" onClick={onWithdraw}>Tarik ke rekening</Button>
    {continuation.canBuyAgain ? <Button type="button" onClick={onBuyAgain}>Catat pembelian lain</Button> : null}
  </div>
</div> : null;

const useInvestmentRouteContinuation = ({ location, navigate, overview, accountsResource, portfolios, setSetupMode, setSetupRdnAccountId, setSetupOpen, setDialog, setHoldingDetail }) => {
  useEffect(() => {
    const continuation = readInvestmentContinuation(location.state);
    if (!continuation || !overview.data || !accountsResource.data || overview.isRefreshing || accountsResource.isRefreshing) return;
    const rdnAccountId = String(continuation.payload.rdnAccountId || "");
    const portfolio = portfolioForRdn(portfolios, rdnAccountId);
    if (continuation.action === "setup-portfolio") {
      setSetupMode("portfolio");
      setSetupRdnAccountId(rdnAccountId);
      setSetupOpen(true);
    } else if (continuation.action === "buy") {
      if (portfolio?.can_operate !== false) setDialog({ mode: "buy", portfolio, initialDraft: continuation.payload.draft || null });
      else if (!portfolio && continuation.payload.ensureSetup) {
        setSetupMode("portfolio");
        setSetupRdnAccountId(rdnAccountId);
        setSetupOpen(true);
      }
    } else if (continuation.action === "view-investment") {
      if (portfolio?.holdings?.length === 1) setHoldingDetail({ portfolio, holding: portfolio.holdings[0] });
      else if (!portfolio && continuation.payload.ensureSetup) {
        setSetupMode("portfolio");
        setSetupRdnAccountId(rdnAccountId);
        setSetupOpen(true);
      }
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [accountsResource.data, accountsResource.isRefreshing, location.pathname, location.state, navigate, overview.data, overview.isRefreshing, portfolios, setDialog, setHoldingDetail, setSetupMode, setSetupOpen, setSetupRdnAccountId]);
};

const useInvestmentAttentionReconciliation = ({ attention, consumeAttention, overview, accountsResource, portfolios, setDialog, notify }) => {
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current || !attention || !["investment_reconciliation_stale", "investment_reconciliation_difference"].includes(attention.attentionType)) return;
    if (!overview.data || !accountsResource.data || overview.isRefreshing || accountsResource.isRefreshing) return;
    handledRef.current = true;
    const portfolio = portfolioForRdn(portfolios, attention.attentionRdnAccountId);
    if (portfolio) setDialog({ mode: "reconcile", portfolio, returnTo: attention.attentionSource === "notification-center" ? "/notifikasi" : "" });
    else notify({ message: "Portfolio investasi pada notifikasi sudah tidak tersedia. Daftar investasi terbaru tetap ditampilkan.", tone: "info", dedupeKey: "investments:attention-portfolio-missing" });
    consumeAttention();
  }, [accountsResource.data, accountsResource.isRefreshing, attention, consumeAttention, notify, overview.data, overview.isRefreshing, portfolios, setDialog]);
};

const InvestmentOverlays = ({ page }) => {
  const navigate = useNavigate();
  const {
    accounts, needsRdnRepair, data, dialog, setDialog, setupOpen, setupMode, setupRdnAccountId, setSetupOpen, setSetupRdnAccountId,
    holdingDetail, setHoldingDetail, user, onSetupSuccess, onInvestmentSuccess, fundRdnForPortfolio, openAction, onReviewHistory,
  } = page;
  return <Suspense fallback={null}>
    {setupOpen ? <InvestmentSetupDialog
      accounts={accounts}
      instruments={data.instruments || []}
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
      key={`${dialog.mode}:${dialog.portfolio?.portfolio_id || ""}:${dialog.initialInstrumentId || ""}:${dialog.initialDraft ? "draft" : "fresh"}`}
      mode={dialog.mode}
      portfolio={dialog.portfolio}
      instruments={data.instruments || []}
      userRole={user?.role}
      initialInstrumentId={dialog.initialInstrumentId || ""}
      initialDraft={dialog.initialDraft || null}
      onClose={() => { const returnTo = dialog.returnTo; setDialog(null); if (returnTo) navigate(returnTo); }}
      onSuccess={onInvestmentSuccess}
      onOpenCorrection={(portfolio) => setDialog({ mode: "correction", portfolio, returnTo: dialog.returnTo || "" })}
      onReviewHistory={onReviewHistory}
      onFundRdn={fundRdnForPortfolio}
    /> : null}
  </Suspense>;
};

const InvestmentsPageContent = ({ page }) => {
  const {
    user, overview, accountsResource, accounts, data, setupContinuation, setSetupContinuation, tradeContinuation, setTradeContinuation,
    openRdnAccountSetup, openSetup, openRdnTransfer, openAction, setHoldingDetail, startOpeningPosition,
  } = page;
  const candidatePortfolio = portfolioForId(data.portfolios, setupContinuation?.portfolioId) || setupContinuation?.portfolio || null;
  const continuationPortfolio = candidatePortfolio && (!setupContinuation?.rowVersion || Number(candidatePortfolio.row_version || 0) >= Number(setupContinuation.rowVersion))
    ? candidatePortfolio
    : null;
  const emptyAction = accounts.length
    ? <Button icon={FiPlus} onClick={() => openSetup("portfolio")}>Siapkan catatan portofolio</Button>
    : <Button icon={FiPlus} onClick={openRdnAccountSetup}>Buat rekening RDN</Button>;
  return <div className={`page-stack ${styles.page}`}>
    <RefreshWarning error={overview.refreshError || accountsResource.refreshError} onRetry={() => { overview.reload().catch(() => {}); accountsResource.reload().catch(() => {}); }} />
    <PageHeader
      title="Investasi"
      description="Catat dan pantau portofolio yang Anda miliki. Pembelian atau penjualan tetap dilakukan di aplikasi investasi Anda."
      actions={data.portfolios.length && user?.role === "owner" ? <Button className={styles.setupAction} icon={FiPlus} onClick={() => openSetup("instrument")} aria-label="Tambah saham">Tambah saham</Button> : null}
      help="Investasi adalah fitur pencatatan portofolio manual. Saldo Bersama tidak terhubung ke broker, tidak mengambil harga pasar live, dan tidak mengirim order beli atau jual. Saham baru pada prototype dipilih dari daftar LQ45 yang sudah disediakan."
    />
    <SetupContinuation
      continuation={setupContinuation}
      portfolio={continuationPortfolio}
      data={data}
      owner={user?.role === "owner"}
      onDismiss={() => setSetupContinuation(null)}
      onStartNew={(portfolio) => { if (!portfolio) return; setSetupContinuation(null); openAction("buy", portfolio); }}
      onStartExisting={startOpeningPosition}
      onAddOpening={startOpeningPosition}
    />
    <SellContinuation
      continuation={tradeContinuation}
      onDismiss={() => setTradeContinuation(null)}
      onWithdraw={() => { const continuation = tradeContinuation; setTradeContinuation(null); openRdnTransfer("withdraw", continuation?.portfolio, continuation?.amount); }}
      onBuyAgain={() => { const continuation = tradeContinuation; setTradeContinuation(null); openAction("buy", continuation?.portfolio); }}
    />
    {data.portfolios.length === 0 ? <EmptyState
      title={accounts.length ? "Belum ada catatan portofolio" : "Belum ada rekening RDN"}
      description={accounts.length ? "Pilih rekening Investasi/RDN yang sudah ada, lalu pasangkan dengan catatan aset Anda." : "Mulai dengan membuat rekening jenis Investasi sebagai RDN. Setelah rekening siap, Anda akan diarahkan kembali untuk menyiapkan catatan investasi."}
      action={emptyAction}
    /> : <Suspense fallback={<LoadingScreen label="Menyiapkan rincian investasi" />}><InvestmentOverview
      data={data}
      owner={user?.role === "owner"}
      onAction={openAction}
      onSetup={openSetup}
      onTransfer={openRdnTransfer}
      onHolding={(portfolio, holding) => setHoldingDetail({ portfolio, holding })}
    /></Suspense>}
    <InvestmentOverlays page={page} />
  </div>;
};

const useInvestmentUiState = () => {
  const [dialog, setDialog] = useState(null);
  const [holdingDetail, setHoldingDetail] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState("portfolio");
  const [setupRdnAccountId, setSetupRdnAccountId] = useState("");
  const [setupContinuation, setSetupContinuation] = useState(null);
  const [tradeContinuation, setTradeContinuation] = useState(null);
  const [pendingOpeningPortfolioId, setPendingOpeningPortfolioId] = useState("");
  return {
    dialog, setDialog, holdingDetail, setHoldingDetail, setupOpen, setSetupOpen, setupMode, setSetupMode,
    setupRdnAccountId, setSetupRdnAccountId, setupContinuation, setSetupContinuation, tradeContinuation,
    setTradeContinuation, pendingOpeningPortfolioId, setPendingOpeningPortfolioId,
  };
};

const createNavigationActions = ({ accounts, navigate, openTransactionComposer, ui }) => {
  const openRdnAccountSetup = () => navigate("/rekening", { state: investmentRdnAccountSetupState() });
  const openSetup = (mode = "portfolio") => {
    if (mode === "portfolio" && !accounts.length) { openRdnAccountSetup(); return; }
    ui.setSetupMode(mode === "instrument" ? "instrument" : "portfolio");
    ui.setSetupOpen(true);
  };
  const openRdnTransfer = (direction, portfolio, suggestedAmount = 0, continuation = null, suggestedDate = "") => {
    const rdnAccountId = investmentRdnAccountId(portfolio);
    if (!rdnAccountId) return;
    const deposit = direction === "fund";
    const defaultContinuation = investmentContinuationState({ action: "view-investment", payload: { rdnAccountId }, includeLegacy: false });
    openTransactionComposer({
      initialType: TRANSACTION_TYPES.TRANSFER,
      initialSourceAccountId: deposit ? "" : rdnAccountId,
      initialDraft: {
        transaction_type: TRANSACTION_TYPES.TRANSFER,
        source_account_id: deposit ? "" : rdnAccountId,
        destination_account_id: deposit ? rdnAccountId : "",
        amount: suggestedAmount > 0 ? String(suggestedAmount) : "",
        ...(suggestedDate ? { transaction_date: suggestedDate } : {}),
      },
      continuation: continuation || defaultContinuation,
    });
  };
  return { openRdnAccountSetup, openSetup, openRdnTransfer };
};

const createOpeningPositionAction = ({ data, user, notify, ui, openSetup }) => (portfolio, sourceData = data, owner = user?.role === "owner") => {
  if (!portfolio) return;
  if (portfolio.opening_position_available === false) {
    notify({ message: "Fase posisi awal sudah ditutup karena portfolio memiliki aktivitas reguler. Gunakan Koreksi bila ada selisih yang sudah diverifikasi.", tone: "warning", dedupeKey: "investments:opening-closed" });
    return;
  }
  if (!activeInvestmentInstruments(sourceData).length) {
    if (!owner) {
      notify({ message: "Belum ada saham aktif. Daftar saham baru dikelola Administrator.", tone: "warning", dedupeKey: "investments:opening-no-instrument" });
      return;
    }
    ui.setPendingOpeningPortfolioId(portfolio.portfolio_id);
    openSetup("instrument");
    return;
  }
  ui.setSetupContinuation(null);
  ui.setDialog({ mode: "opening_position", portfolio });
};

const createWorkflowActions = ({ data, user, notify, overview, ui, openSetup, openRdnTransfer }) => {
  const fundRdnForPortfolio = (portfolio, shortage = 0, draft = null) => {
    const rdnAccountId = investmentRdnAccountId(portfolio);
    ui.setDialog(null);
    openRdnTransfer(
      "fund",
      portfolio,
      shortage,
      investmentContinuationState({ action: "buy", payload: { rdnAccountId, ensureSetup: true, draft: draft || {} }, includeLegacy: false }),
      draft?.trade_date || "",
    );
  };
  const startOpeningPosition = createOpeningPositionAction({ data, user, notify, ui, openSetup });
  const onSetupSuccess = (mode, form, saved) => {
    notify({ message: mode === "portfolio" ? "Catatan portofolio investasi berhasil disimpan." : "Saham berhasil ditambahkan ke daftar pencatatan.", tone: "success", dedupeKey: `investments:setup:${mode}` });
    if (mode === "portfolio") {
      ui.setSetupContinuation({ stage: "choice", portfolioId: saved?.portfolio_id || "", rdnAccountId: String(saved?.rdn_account_id || form.rdn_account_id || ""), rowVersion: Number(saved?.row_version || 1) });
      overview.reload().catch(() => {});
      return;
    }
    if (!ui.pendingOpeningPortfolioId) return;
    const portfolioId = ui.pendingOpeningPortfolioId;
    ui.setPendingOpeningPortfolioId("");
    overview.reload().then((fresh) => {
      const portfolio = portfolioForId(fresh?.portfolios || [], portfolioId);
      if (portfolio) ui.setDialog({ mode: "opening_position", portfolio });
    }).catch(() => {});
  };
  const onInvestmentSuccess = (mode, portfolio, result) => {
    if (mode === "reconcile") return;
    notify({ message: investmentSuccessMessage(mode), tone: "success", dedupeKey: `investments:${mode}` });
    if (mode === "sell") ui.setTradeContinuation({ portfolio, amount: Number(result?.cash_amount || 0), canBuyAgain: activeInvestmentInstruments(data).length > 0 });
    if (mode === "opening_position") {
      ui.setSetupContinuation({ stage: "opening", portfolioId: portfolio.portfolio_id, rdnAccountId: investmentRdnAccountId(portfolio), rowVersion: Number(result?.row_version || portfolio.row_version || 0) });
      overview.reload().catch(() => {});
    }
  };
  const onReviewHistory = (portfolio, result) => {
    ui.setDialog(null);
    const firstDifference = (result?.holding_differences || []).find((item) => Number(item.difference || 0) !== 0);
    const holding = firstDifference ? portfolio.holdings.find((item) => item.instrument_id === firstDifference.instrument_id) : null;
    if (holding) ui.setHoldingDetail({ portfolio, holding });
    else notify({ message: "Periksa Aktivitas saham terbaru dan riwayat transfer RDN sebelum mencatat koreksi.", tone: "info", dedupeKey: "investments:review-history" });
  };
  const openAction = (mode, portfolio, options = {}) => ui.setDialog({ mode, portfolio, ...options });
  return { fundRdnForPortfolio, startOpeningPosition, onSetupSuccess, onInvestmentSuccess, onReviewHistory, openAction };
};

const InvestmentsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const { openTransactionComposer } = useTransactionComposer();
  const location = useLocation();
  const navigate = useNavigate();
  const overview = useApiResource("investments.overview");
  const accountsResource = useApiResource("accounts.list");
  const ui = useInvestmentUiState();
  const accounts = useMemo(() => (accountsResource.data?.items || []).filter((item) => item.status === "active" && item.account_type === "investment" && item.can_transact && !Number(item.allow_negative)), [accountsResource.data]);
  const portfolios = useMemo(() => overview.data?.portfolios || [], [overview.data?.portfolios]);
  const data = overview.data || { summary: {}, portfolios: [], instruments: [] };
  const needsRdnRepair = !accounts.length && (accountsResource.data?.items || []).some((item) => item.account_type === "investment");
  const navigation = createNavigationActions({ accounts, navigate, openTransactionComposer, ui });
  const workflow = createWorkflowActions({ data, user, notify, overview, ui, openSetup: navigation.openSetup, openRdnTransfer: navigation.openRdnTransfer });

  useInvestmentRouteContinuation({ location, navigate, overview, accountsResource, portfolios, setSetupMode: ui.setSetupMode, setSetupRdnAccountId: ui.setSetupRdnAccountId, setSetupOpen: ui.setSetupOpen, setDialog: ui.setDialog, setHoldingDetail: ui.setHoldingDetail });
  useInvestmentAttentionReconciliation({ attention, consumeAttention, overview, accountsResource, portfolios, setDialog: ui.setDialog, notify });

  if (overview.status === "loading" || accountsResource.status === "loading") return <LoadingScreen label="Memuat investasi..." />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;

  return <InvestmentsPageContent page={{ user, overview, accountsResource, accounts, needsRdnRepair, data, ...ui, ...navigation, ...workflow }} />;
};

export default InvestmentsPage;
