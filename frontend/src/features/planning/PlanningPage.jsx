import { lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
const AllocationsPage = lazy(() => import("../allocations/AllocationsPage.jsx"));
const RecurringPage = lazy(() => import("../recurring/RecurringPage.jsx"));
import styles from "./PlanningPage.module.css";

const tabFromPath = (pathname) => pathname.includes("/jadwal") ? "jadwal" : "allocation";

const PlanningPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = tabFromPath(location.pathname);
  const selectTab = (tab, { focus = false } = {}) => {
    const path = tab === "jadwal" ? "/perencanaan/jadwal" : "/perencanaan/kantong";
    if (path !== location.pathname) navigate(path);
    if (focus) globalThis.requestAnimationFrame?.(() => document.getElementById(`planning-tab-${tab}`)?.focus());
  };
  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") selectTab("allocation", { focus: true });
    else if (event.key === "End") selectTab("jadwal", { focus: true });
    else selectTab(activeTab === "allocation" ? "jadwal" : "allocation", { focus: true });
  };

  return <div className={`page-stack ${styles.page}`}>
    <PageHeader
      title="Perencanaan"
      description="Atur Alokasi Dana dan transaksi rutin dalam satu tempat."
      help="Alokasi Dana memisahkan dana berdasarkan tujuan. Kebutuhan di dalamnya memakai kategori untuk mengatur anggaran. Halaman Anggaran hanya merangkum seluruh Kebutuhan. Jadwal Rutin menentukan kapan transaksi diperkirakan terjadi. Saldo hanya berubah setelah transaksi aktual disimpan."
    />
    <div className={styles.tabs} role="tablist" aria-label="Perencanaan keuangan">
      <button id="planning-tab-allocation" type="button" role="tab" aria-controls="planning-tabpanel" aria-selected={activeTab === "allocation"} tabIndex={activeTab === "allocation" ? 0 : -1} className={`${styles.tab}${activeTab === "allocation" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("allocation")} onKeyDown={handleTabKeyDown}>
        <strong>Alokasi Dana</strong><span>Dana berdasarkan tujuan dan kebutuhan</span>
      </button>
      <button id="planning-tab-jadwal" type="button" role="tab" aria-controls="planning-tabpanel" aria-selected={activeTab === "jadwal"} tabIndex={activeTab === "jadwal" ? 0 : -1} className={`${styles.tab}${activeTab === "jadwal" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("jadwal")} onKeyDown={handleTabKeyDown}>
        <strong>Jadwal Rutin</strong><span>Transaksi berulang dan konfirmasi aktual</span>
      </button>
    </div>
    <section id="planning-tabpanel" role="tabpanel" aria-labelledby={`planning-tab-${activeTab}`}>
      <Suspense fallback={<div className="notice notice--info" role="status">Memuat perencanaan...</div>}>
        {activeTab === "allocation" ? <AllocationsPage embedded onOpenRecurring={() => selectTab("jadwal")} /> : <RecurringPage embedded />}
      </Suspense>
    </section>
  </div>;
};

export default PlanningPage;
