import { FiChevronRight } from "react-icons/fi";
import { Link } from "react-router";
import UserAvatar from "../../components/common/UserAvatar.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { MOBILE_SETTINGS_GROUPS } from "./settingsNavigation.js";
import { backendPresentation, roleLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";


const SettingsNavigationRow = ({ item, maintenanceMode }) => {
  const Icon = item.icon;
  const maintenanceLabel = item.maintenanceAware && maintenanceMode ? "Maintenance" : "";
  return (
    <Link className={styles.settingsListRow} to={item.to}>
      <span className={styles.settingsListIcon}><Icon aria-hidden="true" /></span>
      <span className={styles.settingsListCopy}>
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      <span className={styles.settingsListMeta}>
        {maintenanceLabel ? <span className={styles.settingsListAlert}>{maintenanceLabel}</span> : null}
        <FiChevronRight aria-hidden="true" />
      </span>
    </Link>
  );
};

const MobileSettingsOverview = ({ user, backend, timezone, maintenanceMode }) => {
  const ownerMode = user?.role === "owner";
  const displayName = String(user?.name || "").trim();
  const email = String(user?.email || "").trim();
  const primaryIdentity = displayName || email || "Akun aktif";
  const showEmail = Boolean(displayName && email && displayName !== email);

  return (
    <section className={styles.settingsMobileOverview} aria-label="Ringkasan dan navigasi pengaturan mobile">
      <section className={styles.settingsAccountCard} aria-label="Akun dan status sistem">
        <div className={styles.settingsAccountIdentity}>
          <UserAvatar user={user} className={styles.settingsAccountAvatar} />
          <div className={styles.settingsAccountCopy}>
            <strong>{primaryIdentity}</strong>
            {showEmail ? <small>{email}</small> : null}
            <span>{roleLabel(user?.role)} · {timezone}</span>
          </div>
        </div>
        <div className={styles.settingsAccountStatus}>
          <span className={`status-badge status-badge--${backend.tone}`} role="status" aria-live="polite">{backend.label}</span>
          <p>{backend.summary}</p>
        </div>
      </section>

      {MOBILE_SETTINGS_GROUPS.map((group) => {
        const visibleItems = group.items.filter((item) => !item.ownerOnly || ownerMode);
        if (!visibleItems.length) return null;
        return (
          <section className={styles.settingsGroup} key={group.id} aria-labelledby={`settings-group-${group.id}`}>
            <h2 id={`settings-group-${group.id}`}>{group.label}</h2>
            <div className={styles.settingsList}>
              {visibleItems.map((item) => (
                <SettingsNavigationRow key={item.to} item={item} maintenanceMode={maintenanceMode} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
};

const DesktopSettingsOverview = ({ user, backend, timezone, maintenanceMode }) => (
  <section className={styles.settingsDesktopOverview} aria-labelledby="settings-desktop-overview-title">
    <div className={styles.settingsDesktopOverviewIntro}>
      <h2 id="settings-desktop-overview-title">Ringkasan pengaturan</h2>
      <p>Pilih kategori di kiri lalu submenu yang ingin dikelola. Panel ini hanya merangkum akun dan kondisi aplikasi agar desktop tetap lapang tanpa mengulang seluruh menu mobile.</p>
    </div>
    <dl className={styles.settingsDesktopFacts}>
      <div>
        <dt>Akun</dt>
        <dd>{user?.email || "Akun aktif"}</dd>
      </div>
      <div>
        <dt>Akses</dt>
        <dd>{roleLabel(user?.role)}</dd>
      </div>
      <div>
        <dt>Zona waktu</dt>
        <dd>{timezone}</dd>
      </div>
      <div>
        <dt>Backend</dt>
        <dd><span className={`status-badge status-badge--${backend.tone}`} role="status" aria-live="polite">{backend.label}</span></dd>
      </div>
      <div>
        <dt>Mode operasi</dt>
        <dd>{maintenanceMode ? "Maintenance" : "Normal"}</dd>
      </div>
    </dl>
    <p className={styles.settingsDesktopBackendSummary}>{backend.summary}</p>
  </section>
);

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap } = useFinance();
  const healthResource = useApiResource("system.health");
  const backend = backendPresentation(healthResource);
  const timezone = bootstrap?.config?.timezone || healthResource.data?.timezone || "Asia/Jakarta";
  const maintenanceMode = Boolean(healthResource.data?.maintenanceMode);

  return (
    <section className={styles.settingsHome} aria-label="Ringkasan pengaturan">
      <RefreshWarning error={healthResource.refreshError} onRetry={healthResource.reload} />
      <DesktopSettingsOverview user={user} backend={backend} timezone={timezone} maintenanceMode={maintenanceMode} />
      <MobileSettingsOverview user={user} backend={backend} timezone={timezone} maintenanceMode={maintenanceMode} />
    </section>
  );
};

export default SettingsPage;
