import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { readInvestmentContinuation } from "../../shared/workflows/investmentContinuation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./InvestmentsPage.module.css";

const InvestmentOverview = lazy(() => import("./InvestmentOverview.jsx"));
const InvestmentHoldingDetail = lazy(() => import("./InvestmentHoldingDetail.jsx"));
const InvestmentDialog = lazy(() => import("./InvestmentDialog.jsx"));
const InvestmentSetupDialog = lazy(() => import("./InvestmentSetupDialog.jsx"));

const investmentRdnAccountId = (portfolio) => String(portfolio?.rdn_account_id || portfolio?.account_id || "");
const portfolioForRdn = (portfolios, rdnAccountId) => portfolios.find((item) => investmentRdnAccountId(item) === String(rdnAccountId || "")) || null;

const investmentSuccessMessage = (mode) => ({
  buy: "Pembelian investasi berhasil dicatat.",
  sell: "Penjualan investasi berhasil dicatat.",
  price: "Nilai investasi berhasil diperbarui.",
})[mode] || "Catatan investasi berhasil disimpan.";

const useLegacyInvestmentContinuation = ({ location, navigate, data, ready, setSetupOpen, setDialog, setHoldingDetail }) => {
  useEffect(() => {
    if (!ready) return;
    const continuation = readInvestmentContinuation(location.state);
    if (!continuation) return;
    const portfolio = portfolioForRdn(data.portfolios || [], continuation.payload.rdnAccountId);
    if (continuation.action === "buy" && portfolio?.can_operate !== false) {
      setDialog({ mode: "buy", portfolio, initialDraft: continuation.payload.draft || null });
    } else if (continuation.action === "view-investment" && portfolio?.holdings?.length) {
      setHoldingDetail({ portfolio, holding: portfolio.holdings[0] });
    } else {
      setSetupOpen(true);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [data, location.pathname, location.state, navigate, ready, setDialog, setHoldingDetail, setSetupOpen]);
};

const InvestmentOverlays = ({ page }) => {
  const { data, user, setupOpen, setSetupOpen, holdingDetail, setHoldingDetail, dialog, setDialog, onSetupSuccess, onInvestmentSuccess, openAction } = page;
  return <Suspense fallback={<LazyActionFallback surface="modal" title="Investasi" label="Menyiapkan aksi Investasi..." />}>
    {setupOpen ? <InvestmentSetupDialog
      instruments={data.instruments || []}
      portfolios={data.portfolios || []}
      owner={user?.role === "owner"}
      onClose={() => setSetupOpen(false)}
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
      onClose={() => setDialog(null)}
      onSuccess={onInvestmentSuccess}
    /> : null}
  </Suspense>;
};

const EmptyInvestmentState = ({ onAdd }) => <section className={styles.firstInvestment} aria-labelledby="investment-first-title">
  <div className={styles.firstInvestmentIntro}>
    <div className={styles.firstInvestmentVisual} aria-hidden="true"><span /><span /><span /></div>
    <div>
      <h2 id="investment-first-title">Mulai catat aset investasi</h2>
      <p>Tambahkan saham atau reksa dana yang sudah Anda miliki. Tidak perlu membuat broker, portfolio, atau RDN terlebih dahulu.</p>
    </div>
  </div>
  <div className={styles.firstInvestmentChips} aria-label="Yang dapat dicatat"><span>Saham LQ45</span><span>Reksa Dana</span><span>Nilai & aktivitas</span></div>
  <div className={styles.firstInvestmentSetup}>
    <span className={styles.firstInvestmentEyebrow}>Langkah pertama</span>
    <h3>Pilih aset lalu masukkan posisi</h3>
    <p>Catat jumlah, harga rata-rata/modal, nilai saat ini, dan tanggal. Semua hanya pencatatan manual; aplikasi tidak mengirim order atau memindahkan saldo rekening.</p>
    <Button variant="primary" icon={FiPlus} data-preload-action="investmentSetup" onClick={onAdd}>Tambah investasi</Button>
  </div>
</section>;

const InvestmentsPage = () => {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const overview = useApiResource("investments.overview");
  const [setupOpen, setSetupOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [holdingDetail, setHoldingDetail] = useState(null);
  const data = overview.data || { summary: {}, portfolios: [], instruments: [], activity: [] };
  const assetCount = useMemo(() => (data.portfolios || []).reduce((total, portfolio) => total + (portfolio.holdings || []).length, 0), [data.portfolios]);

  const openAction = (mode, portfolio, options = {}) => setDialog({ mode, portfolio, ...options });
  const onSetupSuccess = (_saved, asset) => {
    notify({ message: `${asset?.ticker || "Aset investasi"} berhasil ditambahkan.`, tone: "success", dedupeKey: "investments:asset:create" });
    overview.reload().catch(() => {});
  };
  const onInvestmentSuccess = (mode) => {
    notify({ message: investmentSuccessMessage(mode), tone: "success", dedupeKey: `investments:${mode}` });
    overview.reload().catch(() => {});
  };

  useLegacyInvestmentContinuation({ location, navigate, data, ready: overview.status === "ready" && !overview.isRefreshing, setSetupOpen, setDialog, setHoldingDetail });
  useEffect(() => {
    if (!attention || !["investment_reconciliation_stale", "investment_reconciliation_difference"].includes(attention.attentionType)) return;
    notify({ message: "Pencatatan investasi kini berbasis aset. Rekonsiliasi RDN lama tetap tersimpan sebagai histori dan tidak diperlukan untuk pencatatan baru.", tone: "info", dedupeKey: "investments:legacy-reconciliation" });
    consumeAttention();
  }, [attention, consumeAttention, notify]);

  if (overview.status === "loading") return <NativePageSkeleton kind="investments" label="Memuat investasi…" />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;

  const page = { data, user, setupOpen, setSetupOpen, holdingDetail, setHoldingDetail, dialog, setDialog, onSetupSuccess, onInvestmentSuccess, openAction };
  return <div className={`page-stack ${styles.page}`}>
    <RefreshWarning error={overview.refreshError} onRetry={() => overview.reload().catch(() => {})} />
    <PageHeader
      title="Investasi"
      description="Catat saham dan reksa dana langsung sebagai aset, tanpa wadah broker atau portfolio di tampilan."
      actions={<Button className={styles.setupAction} variant="primary" icon={FiPlus} data-preload-action="investmentSetup" onClick={() => setSetupOpen(true)} aria-label="Tambah investasi">Tambah investasi</Button>}
      help="Investasi adalah pencatatan manual. Saldo Bersama tidak terhubung ke broker, tidak mengirim order beli/jual, tidak memindahkan saldo rekening, dan tidak mengambil harga pasar live."
    />
    {assetCount === 0 ? <EmptyInvestmentState onAdd={() => setSetupOpen(true)} /> : <Suspense fallback={<NativePageSkeleton kind="investments" label="Menyiapkan rincian investasi…" />}>
      <InvestmentOverview data={data} onHolding={(portfolio, holding) => setHoldingDetail({ portfolio, holding })} />
    </Suspense>}
    <InvestmentOverlays page={page} />
  </div>;
};

export default InvestmentsPage;
