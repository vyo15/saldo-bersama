import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import ContextBack from "../../components/navigation/ContextBack.jsx";
import styles from "./PlanningPage.module.css";

const AllocationsPage = lazy(() => import("../allocations/AllocationsPage.jsx"));
const RecurringPage = lazy(() => import("../recurring/RecurringPage.jsx"));
const CommitmentsPage = lazy(() => import("../commitments/CommitmentsPage.jsx"));

const planningSurfaceFromPath = (pathname) => pathname.includes("/komitmen")
  ? "commitments"
  : pathname.includes("/jadwal") ? "recurring" : "overview";

const PlanningDetailShell = ({ children }) => <>
  <div className={styles.detailBack}><ContextBack to="/perencanaan/kantong" label="Atur Dana" /></div>
  {children}
</>;

const PlanningPage = () => {
  const location = useLocation();
  const surface = planningSurfaceFromPath(location.pathname);

  return <div className={`page-stack ${styles.page}`}>
    {surface === "overview" ? <PageHeader
      title="Atur Dana"
      help="Atur penggunaan dana untuk pengeluaran. Alokasi Dana, pembayaran rutin, dan Kewajiban tetap saling terhubung di belakang layar, sementara halaman utama menampilkan satu daftar Aktif yang sederhana. Pemasukan yang sudah tercatat otomatis menambah dana rekening dan tidak perlu direncanakan ulang di sini."
    /> : null}
    <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat pengaturan dana…" />}>
      {surface === "overview" ? <AllocationsPage embedded /> : null}
      {surface === "recurring" ? <PlanningDetailShell><RecurringPage embedded expenseOnly /></PlanningDetailShell> : null}
      {surface === "commitments" ? <PlanningDetailShell><CommitmentsPage embedded /></PlanningDetailShell> : null}
    </Suspense>
  </div>;
};

export default PlanningPage;
