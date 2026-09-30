import { lazy, Suspense } from "react";
import { FiCheckCircle, FiHardDrive, FiRefreshCw, FiRotateCcw, FiShield, FiTrash2 } from "react-icons/fi";
import { Link, useSearchParams } from "react-router";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import styles from "./Settings.module.css";


const ResetDataPage = lazy(() => import("./ResetDataPage.jsx"));
const FullResetPage = lazy(() => import("./FullResetPage.jsx"));

const TAB_TESTING = "testing";
const TAB_FULL_RESET = "semua";

const resolveMaintenanceTab = (value) => value === TAB_FULL_RESET ? TAB_FULL_RESET : TAB_TESTING;

const MaintenanceDataPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveMaintenanceTab(searchParams.get("tab"));

  const changeTab = (nextTab, { focus = false } = {}) => {
    if (nextTab !== activeTab) {
      const nextParams = new URLSearchParams(searchParams);
      if (nextTab === TAB_FULL_RESET) nextParams.set("tab", TAB_FULL_RESET);
      else nextParams.delete("tab");
      setSearchParams(nextParams, { replace: true });
    }
    if (focus) globalThis.requestAnimationFrame?.(() => document.getElementById(`maintenance-tab-${nextTab}`)?.focus());
  };

  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") changeTab(TAB_TESTING, { focus: true });
    else if (event.key === "End") changeTab(TAB_FULL_RESET, { focus: true });
    else changeTab(activeTab === TAB_TESTING ? TAB_FULL_RESET : TAB_TESTING, { focus: true });
  };

  return (
    <OwnerSettingsGuard>
      <section className={styles.maintenanceHub} aria-label="Pemeliharaan data">
        <div className={styles.maintenanceCompactIntro}>
          <span className={styles.maintenanceCompactIcon}><FiShield aria-hidden="true" /></span>
          <div>
            <strong>Reset selalu dipreview terlebih dahulu</strong>
            <small>Backup keamanan dan pemeriksaan status tetap wajib sebelum eksekusi.</small>
          </div>
          <nav className={styles.maintenancePrepLinks} aria-label="Persiapan sebelum reset">
            <Link to="/pengaturan/backup"><FiHardDrive aria-hidden="true" />Backup</Link>
            <Link to="/pengaturan/periode"><FiCheckCircle aria-hidden="true" />Integritas</Link>
            <Link to="/pengaturan/pemulihan"><FiRotateCcw aria-hidden="true" />Pemulihan</Link>
          </nav>
        </div>

        <div className={styles.maintenanceModeLabel}>Pilih jenis reset</div>
        <div className={styles.maintenanceTabs} role="tablist" aria-label="Jenis pemeliharaan data">
          <button
            className={`${styles.maintenanceTab}${activeTab === TAB_TESTING ? ` ${styles.isActive}` : ""}`}
            type="button"
            role="tab"
            id="maintenance-tab-testing"
            aria-selected={activeTab === TAB_TESTING}
            aria-controls="maintenance-panel"
            tabIndex={activeTab === TAB_TESTING ? 0 : -1}
            onClick={() => changeTab(TAB_TESTING)}
            onKeyDown={handleTabKeyDown}
          >
            <FiRefreshCw aria-hidden="true" />
            <span><strong>Reset Testing</strong></span>
          </button>
          <button
            className={`${styles.maintenanceTab} ${styles.maintenanceTabDanger}${activeTab === TAB_FULL_RESET ? ` ${styles.isActive}` : ""}`}
            type="button"
            role="tab"
            id="maintenance-tab-semua"
            aria-selected={activeTab === TAB_FULL_RESET}
            aria-controls="maintenance-panel"
            tabIndex={activeTab === TAB_FULL_RESET ? 0 : -1}
            onClick={() => changeTab(TAB_FULL_RESET)}
            onKeyDown={handleTabKeyDown}
          >
            <FiTrash2 aria-hidden="true" />
            <span><strong>Reset Semua</strong></span>
          </button>
        </div>

        <div
          className={styles.maintenanceTabPanel}
          role="tabpanel"
          id="maintenance-panel"
          aria-labelledby={`maintenance-tab-${activeTab}`}
        >
          <Suspense fallback={<p className={styles.maintenanceLoading} role="status">Memuat panel pemeliharaan...</p>}>
            {activeTab === TAB_TESTING ? <ResetDataPage /> : <FullResetPage />}
          </Suspense>
        </div>
      </section>
    </OwnerSettingsGuard>
  );
};

export default MaintenanceDataPage;
