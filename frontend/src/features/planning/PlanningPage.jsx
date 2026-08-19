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
  const selectTab = (tab) => {
    const path = tab === "jadwal" ? "/perencanaan/jadwal" : "/perencanaan/kantong";
    if (path !== location.pathname) navigate(path);
  };

  return <div className={`page-stack ${styles.page}`}>
    <PageHeader
      title="Perencanaan"
      description="Atur Alokasi Dana dan transaksi rutin dalam satu tempat."
      help="Alokasi Dana memisahkan dana berdasarkan tujuan. Kebutuhan di dalamnya memakai kategori untuk mengatur anggaran. Halaman Anggaran hanya merangkum seluruh Kebutuhan. Jadwal Rutin menentukan kapan transaksi diperkirakan terjadi. Saldo hanya berubah setelah transaksi aktual disimpan."
    />
    <div className={styles.tabs} role="tablist" aria-label="Perencanaan keuangan">
      <button type="button" role="tab" aria-selected={activeTab === "allocation"} className={`${styles.tab}${activeTab === "allocation" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("allocation")}>
        <strong>Alokasi Dana</strong><span>Dana berdasarkan tujuan dan kebutuhan</span>
      </button>
      <button type="button" role="tab" aria-selected={activeTab === "jadwal"} className={`${styles.tab}${activeTab === "jadwal" ? ` ${styles.tabActive}` : ""}`} onClick={() => selectTab("jadwal")}>
        <strong>Jadwal Rutin</strong><span>Transaksi berulang dan konfirmasi aktual</span>
      </button>
    </div>
    <section role="tabpanel" aria-label={activeTab === "allocation" ? "Alokasi Dana" : "Jadwal Rutin"}>
      <Suspense fallback={<div className="notice notice--info" role="status">Memuat perencanaan...</div>}>
        {activeTab === "allocation" ? <AllocationsPage embedded onOpenRecurring={() => selectTab("jadwal")} /> : <RecurringPage embedded />}
      </Suspense>
    </section>
  </div>;
};

export default PlanningPage;
