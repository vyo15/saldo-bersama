import { lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
const AllocationsPage = lazy(() => import("../allocations/AllocationsPage.jsx"));
const RecurringPage = lazy(() => import("../recurring/RecurringPage.jsx"));
const CommitmentsPage = lazy(() => import("../commitments/CommitmentsPage.jsx"));
import styles from "./PlanningPage.module.css";

const PLANNING_TABS = ["allocation", "jadwal", "komitmen"];
const tabFromPath = (pathname) => pathname.includes("/komitmen") ? "komitmen" : pathname.includes("/jadwal") ? "jadwal" : "allocation";

const PlanningPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = tabFromPath(location.pathname);
  const selectTab = (tab, { focus = false } = {}) => {
    const path = tab === "jadwal" ? "/perencanaan/jadwal" : tab === "komitmen" ? "/perencanaan/komitmen" : "/perencanaan/kantong";
    if (path !== location.pathname) navigate(path);
    if (focus) globalThis.requestAnimationFrame?.(() => document.getElementById(`planning-tab-${tab}`)?.focus());
  };
  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") selectTab("allocation", { focus: true });
    else if (event.key === "End") selectTab("komitmen", { focus: true });
    else {
      const index = PLANNING_TABS.indexOf(activeTab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      selectTab(PLANNING_TABS[(index + offset + PLANNING_TABS.length) % PLANNING_TABS.length], { focus: true });
    }
  };

  return <div className={`page-stack ${styles.page}`}>
    <PageHeader
      title="Perencanaan"
      description="Atur Alokasi Dana, Jadwal Rutin, dan Kewajiban dalam satu tempat."
      help="Alokasi Dana memisahkan dana berdasarkan tujuan. Jadwal Rutin menentukan kapan transaksi diperkirakan terjadi. Kewajiban memantau KPR, cicilan, pinjaman, dan Arisan sampai selesai. Kewajiban yang dananya sudah siap di Alokasi dapat tercatat otomatis saat jatuh tempo."
    />
    <div className={styles.tabs} role="tablist" aria-label="Perencanaan keuangan">
      <button id="planning-tab-allocation" type="button" role="tab" aria-controls="planning-tabpanel" aria-selected={activeTab === "allocation"} tabIndex={activeTab === "allocation" ? 0 : -1} className={`${styles.tab}${activeTab === "allocation" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("allocation")} onKeyDown={handleTabKeyDown}>
        <strong>Alokasi Dana</strong><span>Dana berdasarkan tujuan dan kebutuhan</span>
      </button>
      <button id="planning-tab-jadwal" type="button" role="tab" aria-controls="planning-tabpanel" aria-selected={activeTab === "jadwal"} tabIndex={activeTab === "jadwal" ? 0 : -1} className={`${styles.tab}${activeTab === "jadwal" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("jadwal")} onKeyDown={handleTabKeyDown}>
        <strong>Jadwal Rutin</strong><span>Pembayaran dan pemasukan berulang</span>
      </button>
      <button id="planning-tab-komitmen" type="button" role="tab" aria-controls="planning-tabpanel" aria-selected={activeTab === "komitmen"} tabIndex={activeTab === "komitmen" ? 0 : -1} className={`${styles.tab}${activeTab === "komitmen" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("komitmen")} onKeyDown={handleTabKeyDown}>
        <strong>Kewajiban</strong><span>KPR, cicilan, pinjaman, dan Arisan</span>
      </button>
    </div>
    <section id="planning-tabpanel" role="tabpanel" aria-labelledby={`planning-tab-${activeTab}`}>
      <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat perencanaan…" />}>
        {activeTab === "allocation" ? <AllocationsPage embedded onOpenRecurring={() => selectTab("jadwal")} /> : activeTab === "jadwal" ? <RecurringPage embedded /> : <CommitmentsPage embedded />}
      </Suspense>
    </section>
  </div>;
};

export default PlanningPage;
