import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import PageInfoButton from "../../components/common/PageInfoButton.jsx";
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

const PLANNING_HELP = "Atur penggunaan dana untuk pengeluaran dari satu tempat. Alokasi, jadwal, kewajiban, dan target tetap saling terhubung di belakang layar dan tampil sebagai satu daftar Aktif yang ringkas. Pemasukan yang sudah tercatat otomatis menambah dana rekening dan tidak perlu direncanakan ulang di sini.";

const PlanningOverviewHeader = () => <>
  <div className={styles.desktopHeader}>
    <PageHeader
      title="Atur Dana"
      description="Atur alokasi dana keluarga sesuai tujuanmu."
      help={PLANNING_HELP}
    />
  </div>
  <header className={styles.mobileHeader}>
    <ContextBack to="/" label="Beranda" className={styles.mobileBack} ariaLabel="Kembali ke Beranda" />
    <h1>Atur Dana</h1>
    <PageInfoButton className={styles.mobileHelp} title="Tentang Atur Dana">{PLANNING_HELP}</PageInfoButton>
  </header>
</>;

const PlanningPage = () => {
  const location = useLocation();
  const surface = planningSurfaceFromPath(location.pathname);

  return <div className={`page-stack ${styles.page}`}>
    {surface === "overview" ? <PlanningOverviewHeader /> : null}
    <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat pengaturan dana…" />}>
      {surface === "overview" ? <AllocationsPage embedded /> : null}
      {surface === "recurring" ? <PlanningDetailShell><RecurringPage embedded expenseOnly /></PlanningDetailShell> : null}
      {surface === "commitments" ? <PlanningDetailShell><CommitmentsPage embedded /></PlanningDetailShell> : null}
    </Suspense>
  </div>;
};

export default PlanningPage;
