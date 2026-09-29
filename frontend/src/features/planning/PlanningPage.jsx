import { lazy, Suspense } from "react";
import { NavLink, useLocation } from "react-router";
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

const PLANNING_TABS = Object.freeze([
  { to: "/perencanaan/kantong", label: "Aktif" },
  { to: "/perencanaan/jadwal", label: "Jadwal" },
  { to: "/perencanaan/komitmen", label: "Kewajiban" },
  { to: "/target", label: "Target" },
]);

const PlanningTabs = () => <nav className={styles.tabs} aria-label="Navigasi Atur Dana">
  {PLANNING_TABS.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `${styles.tab}${isActive ? ` ${styles.tabActive}` : ""}`}>{item.label}</NavLink>)}
</nav>;

const PlanningPage = () => {
  const location = useLocation();
  const surface = planningSurfaceFromPath(location.pathname);

  return <div className={`page-stack ${styles.page}`}>
    {surface === "overview" ? <>
      <PageHeader
        title="Atur Dana"
        description="Atur alokasi dana keluarga sesuai tujuanmu."
        help="Atur penggunaan dana untuk pengeluaran dari satu tempat. Gunakan + Tambah untuk membuat Alokasi, KPR/kewajiban, atau Jadwal Rutin; semuanya tetap saling terhubung di belakang layar dan tampil sebagai satu daftar Aktif yang ringkas. Pemasukan yang sudah tercatat otomatis menambah dana rekening dan tidak perlu direncanakan ulang di sini."
      />
      <PlanningTabs />
    </> : null}
    <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat pengaturan dana…" />}>
      {surface === "overview" ? <AllocationsPage embedded /> : null}
      {surface === "recurring" ? <PlanningDetailShell><RecurringPage embedded expenseOnly /></PlanningDetailShell> : null}
      {surface === "commitments" ? <PlanningDetailShell><CommitmentsPage embedded /></PlanningDetailShell> : null}
    </Suspense>
  </div>;
};

export default PlanningPage;
