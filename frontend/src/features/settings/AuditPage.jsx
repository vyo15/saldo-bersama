import { FiDatabase, FiShield } from "react-icons/fi";
import Card from "../../components/common/Card.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import { auditDetailLabel, auditResultLabel, backendPresentation } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const AuditPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const healthResource = useApiResource("system.health", {}, { enabled: ownerMode });
  const auditResource = useApiResource("audit.list", { limit: 50 }, { enabled: ownerMode });
  const backend = backendPresentation(healthResource);
  const entries = auditResource.data?.items || [];

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="audit-settings-title">
        <RefreshWarning error={healthResource.refreshError || auditResource.refreshError} onRetry={() => Promise.all([healthResource.reload(), auditResource.reload()])} />
        <div className={styles.pageHeading}>
          <h2 id="audit-settings-title">Audit aktivitas</h2>
        </div>
        <Card className="panel">
          <div className="panel__header"><div><h2>Status layanan</h2><p role="status" aria-live="polite">{backend.summary}</p></div><FiDatabase aria-hidden="true" /></div>
          <div className="compact-list compact-list--stacked"><div><span><strong>Mode operasi</strong><small>{healthResource.data?.maintenanceMode ? "Maintenance aktif" : "Operasi normal"}</small></span><span className={`status-badge status-badge--${backend.tone}`}>{backend.label}</span></div></div>
        </Card>
        <Card className="panel">
          <div className="panel__header"><div><h2>Aktivitas terbaru</h2></div><FiShield aria-hidden="true" /></div>
          {auditResource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat audit...</p> : null}
          {auditResource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{auditResource.error?.message || "Audit belum dapat dimuat."}</span></div> : null}
          {entries.length ? (
            <>
              <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Aksi</th><th>Entity</th><th>Hasil</th><th>Detail</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.audit_id}><td>{entry.timestamp}</td><td>{entry.actor_email}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td>{auditResultLabel(entry.result)}</td><td>{auditDetailLabel(entry.detail_code) || "-"}</td></tr>)}</tbody></table></div>
              <div className={`mobile-data-list ${styles.auditList}`} aria-label="Aktivitas audit terbaru">{entries.map((entry) => <article className={`mobile-data-card ${styles.auditCard}`} key={entry.audit_id}><div className={styles.auditCardHeader}><strong>{entry.action}</strong><span className={`status-badge status-badge--${entry.result === "success" ? "active" : "warning"}`}>{auditResultLabel(entry.result)}</span></div><small>{entry.timestamp}</small><dl><div><dt>Actor</dt><dd>{entry.actor_email}</dd></div><div><dt>Entity</dt><dd>{entry.entity_type}</dd></div>{entry.detail_code ? <div><dt>Alasan</dt><dd>{auditDetailLabel(entry.detail_code)}</dd></div> : null}</dl></article>)}</div>
            </>
          ) : auditResource.status === "ready" ? <p className="empty-inline-message">Belum ada aktivitas audit untuk ditampilkan.</p> : null}
        </Card>
      </section>
    </OwnerSettingsGuard>
  );
};

export default AuditPage;
