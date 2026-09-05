import { lazy, Suspense } from "react";
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { useSearchParams } from "react-router";
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
      <section className={styles.maintenanceHub} aria-labelledby="maintenance-data-title">
        <div className={`${styles.pageHeading} ${styles.maintenanceHubHeading}`}>
          <h2 id="maintenance-data-title">Pemeliharaan data</h2>
          <p>Bersihkan data testing atau kembalikan seluruh dataset ke kondisi awal dari satu tempat. Kedua proses tetap memakai pemeriksaan, preview, dan konfirmasi masing-masing.</p>
        </div>

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
            <span>
              <strong>Reset Testing</strong>
              <small>Data uji & saldo</small>
            </span>
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
            <span>
              <strong>Reset Semua</strong>
              <small>Danger zone</small>
            </span>
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
