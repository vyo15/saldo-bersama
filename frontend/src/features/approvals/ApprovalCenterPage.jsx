import { useState } from "react";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useMasterDataRequestReview } from "../../hooks/useMasterDataRequestReview.js";
import MasterDataRequestsPanel from "../masterData/MasterDataRequestsPanel.jsx";
import TransferRequestsPanel from "../transactions/TransferRequestsPanel.jsx";
import { useTransferRequestReview } from "../transactions/useTransferRequestReview.js";
import OwnerSettingsGuard from "../settings/OwnerSettingsGuard.jsx";
import styles from "./ApprovalCenterPage.module.css";

const TABS = Object.freeze([
  { key: "all", label: "Semua" },
  { key: "account", label: "Rekening" },
  { key: "category", label: "Kategori" },
  { key: "transfer", label: "Transfer" },
]);
const APPROVAL_REFRESH_KEYS = Object.freeze(["accounts.list", "categories.list", "transactions.list", "reports.monthly", "dashboard.overview", "app.initialState"]);

const approvalView = (tab, masterItems) => ({
  visibleMasterItems: tab === "all" ? masterItems : masterItems.filter((item) => item.request_type === tab),
  showMaster: ["all", "account", "category"].includes(tab),
  showTransfer: ["all", "transfer"].includes(tab),
});

const ApprovalCenterContent = ({
  tab,
  setTab,
  masterItems,
  transferItems,
  visibleMasterItems,
  showMaster,
  showTransfer,
  masterRequests,
  transferRequests,
  masterReview,
  transferReview,
  accounts,
}) => {
  const pendingCount = masterItems.length + transferItems.length;
  return <OwnerSettingsGuard returnTo="/" returnLabel="Kembali ke Beranda">
    <RefreshWarning error={masterRequests.refreshError || transferRequests.refreshError} onRetry={() => Promise.allSettled([masterRequests.reload(), transferRequests.reload()])} />
    <section className={styles.summary} aria-label="Ringkasan persetujuan"><strong>{pendingCount}</strong><span>pengajuan menunggu keputusan</span></section>
    <div className={styles.tabs} role="tablist" aria-label="Jenis persetujuan">
      {TABS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? styles.tabActive : styles.tab} onClick={() => setTab(item.key)}>{item.label}</button>)}
    </div>
    {showMaster ? <MasterDataRequestsPanel items={visibleMasterItems} ownerMode title={tab === "all" ? "Rekening dan kategori" : `Pengajuan ${tab === "account" ? "rekening" : "kategori"}`} busyId={masterReview.busyId} onApprove={(request) => masterReview.reviewRequest(request, "approve")} onReject={(request, reason) => masterReview.reviewRequest(request, "reject", reason)} /> : null}
    {showTransfer ? <TransferRequestsPanel items={transferItems} accounts={accounts} ownerMode busyId={transferReview.busyId} onApprove={(request, reason) => transferReview.reviewTransferRequest(request, "approve", reason)} onReject={(request, reason) => transferReview.reviewTransferRequest(request, "reject", reason)} /> : null}
    {!pendingCount ? <p className={styles.empty}>Tidak ada pengajuan yang menunggu persetujuan.</p> : null}
  </OwnerSettingsGuard>;
};

const ApprovalCenterPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { notify } = useFeedback();
  const { bootstrap, invalidate, refreshAll } = useFinance();
  const [tab, setTab] = useState("all");
  const masterRequests = useApiResource("masterDataRequests.list", { status: "pending" }, { enabled: ownerMode });
  const transferRequests = useApiResource("transferRequests.list", { status: "pending" }, { enabled: ownerMode });
  const masterItems = masterRequests.data?.items || [];
  const transferItems = transferRequests.data?.items || [];
  const { visibleMasterItems, showMaster, showTransfer } = approvalView(tab, masterItems);

  const reloadApprovedMasterData = async () => {
    invalidate(APPROVAL_REFRESH_KEYS);
    await refreshAll();
  };
  const masterReview = useMasterDataRequestReview({
    requestsResource: masterRequests,
    reloadApproved: reloadApprovedMasterData,
    notify,
    entityLabel: "data",
    dedupePrefix: "approvals:master-data",
  });
  const transferReview = useTransferRequestReview({
    transferRequests,
    invalidate,
    refreshKeys: APPROVAL_REFRESH_KEYS,
    transactionResource: null,
    refreshOverview: refreshAll,
  });

  if (ownerMode && (masterRequests.status === "loading" || transferRequests.status === "loading")) return <LoadingScreen label="Memuat persetujuan..." />;
  if (ownerMode && masterRequests.status === "error") return <ErrorState error={masterRequests.error} onRetry={masterRequests.reload} />;
  if (ownerMode && transferRequests.status === "error") return <ErrorState error={transferRequests.error} onRetry={transferRequests.reload} />;

  return <div className="page-stack">
    <PageHeader title="Persetujuan" description="Tinjau pengajuan rekening, kategori, dan transfer di satu tempat." help="Backend tetap memvalidasi role, rekening, status, versi record, idempotency, dan seluruh aturan finansial saat keputusan dikirim." />
    <ApprovalCenterContent
      tab={tab}
      setTab={setTab}
      masterItems={masterItems}
      transferItems={transferItems}
      visibleMasterItems={visibleMasterItems}
      showMaster={showMaster}
      showTransfer={showTransfer}
      masterRequests={masterRequests}
      transferRequests={transferRequests}
      masterReview={masterReview}
      transferReview={transferReview}
      accounts={bootstrap?.accounts || []}
    />
  </div>;
};

export default ApprovalCenterPage;
