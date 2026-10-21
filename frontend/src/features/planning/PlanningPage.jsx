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

const PLANNING_HELP = "Atur dana dari rekening untuk tiap Alokasi dan Kebutuhan. Gunakan pintasan Tagihan rutin, Cicilan & utang, atau Target tabungan untuk melihat fitur lainnya. Kegiatan yang terkait Alokasi tetap bisa dibuka dari detail Alokasi. Pemasukan yang sudah tercatat otomatis menambah dana rekening dan tidak perlu direncanakan ulang di sini.";

const allocationListLocation = (location) => {
  const params = new URLSearchParams(location.search);
  params.delete("allocation");
  return { pathname: location.pathname, search: params.toString() ? `?${params}` : "" };
};

const PlanningOverviewHeader = ({ location, allocationDetailOpen }) => <>
  <div className={styles.desktopHeader}>
    <PageHeader
      title="Atur Dana"
      description="Atur alokasi dana keluarga sesuai tujuanmu."
      help={PLANNING_HELP}
    />
  </div>
  <header className={styles.mobileHeader}>
    <ContextBack to={allocationDetailOpen ? allocationListLocation(location) : "/"} label={allocationDetailOpen ? "Alokasi Dana" : "Beranda"} className={styles.mobileBack} ariaLabel={allocationDetailOpen ? "Kembali ke daftar Alokasi Dana" : "Kembali ke Beranda"} />
    <h1>{allocationDetailOpen ? "Alokasi Dana" : "Atur Dana"}</h1>
    {allocationDetailOpen ? <span aria-hidden="true" /> : <PageInfoButton className={styles.mobileHelp} title="Tentang Atur Dana">{PLANNING_HELP}</PageInfoButton>}
  </header>
</>;

const PlanningPage = () => {
  const location = useLocation();
  const surface = planningSurfaceFromPath(location.pathname);
  const allocationDetailOpen = surface === "overview" && Boolean(new URLSearchParams(location.search).get("allocation"));

  return <div className={`page-stack ${styles.page}`}>
    {surface === "overview" ? <PlanningOverviewHeader location={location} allocationDetailOpen={allocationDetailOpen} /> : null}
    <Suspense fallback={<NativePageSkeleton kind="planning" variant="panel" label="Memuat pengaturan dana…" />}>
      {surface === "overview" ? <AllocationsPage embedded /> : null}
      {surface === "recurring" ? <PlanningDetailShell><RecurringPage embedded expenseOnly /></PlanningDetailShell> : null}
      {surface === "commitments" ? <PlanningDetailShell><CommitmentsPage embedded /></PlanningDetailShell> : null}
    </Suspense>
  </div>;
};

export default PlanningPage;
