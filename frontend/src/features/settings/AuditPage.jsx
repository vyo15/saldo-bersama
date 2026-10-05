import { useMemo, useState } from "react";
import {
  FiActivity, FiAlertTriangle, FiCheckCircle, FiChevronRight, FiDatabase,
  FiSettings, FiShield, FiUsers,
} from "react-icons/fi";
import { BalanceIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../components/common/Modal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import MaintenanceRecoveryPanel from "./MaintenanceRecoveryPanel.jsx";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { useMaintenanceRecovery } from "./useMaintenanceRecovery.js";
import {
  auditActionLabel, auditCategory, auditDetailLabel, auditEntityLabel, auditResultLabel, backendPresentation, roleLabel,
} from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const AUDIT_FILTERS = Object.freeze([
  ["all", "Semua"], ["finance", "Keuangan"], ["access", "Akses"], ["system", "Sistem"],
]);

const CATEGORY_ICONS = Object.freeze({ finance: BalanceIcon, access: FiUsers, system: FiSettings });
const JAKARTA_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
const JAKARTA_TIME = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
const JAKARTA_DAY_KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta" });

const dateKey = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "unknown" : JAKARTA_DAY_KEY.format(parsed);
};

const dateHeading = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Tanggal tidak diketahui";
  const now = new Date();
  const today = JAKARTA_DAY_KEY.format(now);
  const yesterday = JAKARTA_DAY_KEY.format(new Date(now.getTime() - 86400000));
  const key = JAKARTA_DAY_KEY.format(parsed);
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return JAKARTA_DATE.format(parsed);
};

const timeLabel = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Waktu tidak diketahui" : JAKARTA_TIME.format(parsed).replace(".", ":");
};

const fullDateLabel = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Waktu tidak diketahui" : `${JAKARTA_DATE.format(parsed)} · ${timeLabel(value)}`;
};

const AuditResultMark = ({ result }) => {
  const failed = result === "failed";
  const Icon = failed ? FiAlertTriangle : FiCheckCircle;
  return <span className={styles.auditResultMark} data-tone={failed ? "danger" : "success"}><Icon aria-hidden="true" /><span>{auditResultLabel(result)}</span></span>;
};

const actorPresentation = (entry, memberLookup) => {
  const member = memberLookup.get(String(entry.actor_email || "").toLowerCase());
  return {
    name: member?.name || entry.actor_email || "Sistem",
    detail: member ? roleLabel(member.role) : (entry.actor_email ? "" : "Aktivitas sistem"),
  };
};

const AuditActivityRow = ({ entry, memberLookup, onOpen }) => {
  const category = auditCategory(entry);
  const Icon = CATEGORY_ICONS[category] || FiActivity;
  const actor = actorPresentation(entry, memberLookup);
  const detail = auditDetailLabel(entry.detail_code);
  return (
    <button type="button" className={styles.auditActivityRow} onClick={() => onOpen(entry)}>
      <span className={styles.auditActivityIcon} data-category={category}><Icon aria-hidden="true" /></span>
      <span className={styles.auditActivityCopy}>
        <span className={styles.auditActivityTitleLine}><strong>{auditActionLabel(entry.action, entry.entity_type)}</strong><AuditResultMark result={entry.result} /></span>
        <span className={styles.auditActivityMeta}>{actor.name} · {timeLabel(entry.timestamp)}</span>
        <span className={styles.auditActivityEntity}>{auditEntityLabel(entry.entity_type)}{detail ? ` · ${detail}` : ""}</span>
      </span>
      <FiChevronRight className={styles.auditActivityChevron} aria-hidden="true" />
    </button>
  );
};

const AuditDetailModal = ({ entry, memberLookup, onClose }) => {
  if (!entry) return null;
  const actor = actorPresentation(entry, memberLookup);
  const detail = auditDetailLabel(entry.detail_code);
  return (
    <Modal open title={auditActionLabel(entry.action, entry.entity_type)} description={`${fullDateLabel(entry.timestamp)} · oleh ${actor.name}`} onClose={onClose} size="sm" mobileSwipeToClose>
      <div className={styles.auditDetailBody}>
        <div className={styles.auditDetailStatus}><AuditResultMark result={entry.result} />{actor.detail ? <span>{actor.detail}</span> : null}</div>
        <section className={styles.auditDetailSection} aria-labelledby="audit-object-heading">
          <h3 id="audit-object-heading">Yang berubah</h3>
          <strong>{auditEntityLabel(entry.entity_type)}</strong>
          {entry.entity_id ? <span className={styles.auditDetailEntityId}>{entry.entity_id}</span> : <span>Tidak ada ID objek.</span>}
          {detail ? <p className={styles.auditDetailReason}>{detail}</p> : null}
        </section>
        <section className={styles.auditTechnicalSection} aria-labelledby="audit-technical-heading">
          <h3 id="audit-technical-heading">Detail teknis</h3>
          <dl>
            <div><dt>Aksi</dt><dd>{entry.action || "-"}</dd></div>
            <div><dt>Entity</dt><dd>{entry.entity_type || "-"}</dd></div>
            <div><dt>Actor</dt><dd>{entry.actor_email || "Sistem"}</dd></div>
            <div><dt>Request</dt><dd>{entry.request_id || "-"}</dd></div>
            <div><dt>Audit ID</dt><dd>{entry.audit_id || "-"}</dd></div>
          </dl>
        </section>
      </div>
    </Modal>
  );
};

const SystemStatus = ({ healthResource, backend }) => {
  const maintenance = Boolean(healthResource.data?.maintenanceMode);
  const verified = healthResource.status === "ready" && healthResource.data?.status === "ok" && Number(healthResource.data?.schemaVersion || 0) > 0;
  const headline = maintenance ? "Maintenance aktif" : healthResource.status === "loading" ? "Memeriksa status sistem" : healthResource.status === "error" ? "Status sistem belum tersedia" : "Sistem beroperasi normal";
  return (
    <section className={styles.auditSystemStatus} aria-labelledby="audit-system-status-heading">
      <span className={styles.auditSystemIcon} data-tone={maintenance ? "danger" : "active"}><FiDatabase aria-hidden="true" /></span>
      <div className={styles.auditSystemCopy}>
        <h3 id="audit-system-status-heading">{headline}</h3>
        <p role="status" aria-live="polite">{backend.summary}</p>
      </div>
      <span className={`status-badge status-badge--${backend.tone}`}>{verified ? "Terverifikasi" : backend.label}</span>
    </section>
  );
};

const AuditPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const { invalidate, refreshAll } = useFinance();
  const healthResource = useApiResource("system.health", {}, { enabled: ownerMode });
  const auditResource = useApiResource("audit.list", { limit: 50 }, { enabled: ownerMode });
  const membersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const backend = backendPresentation(healthResource);
  const memberLookup = useMemo(() => new Map((membersResource.data?.items || []).map((member) => [String(member.email || "").toLowerCase(), member])), [membersResource.data]);
  const visibleEntries = useMemo(() => {
    const entries = auditResource.data?.items || [];
    return filter === "all" ? entries : entries.filter((entry) => auditCategory(entry) === filter);
  }, [auditResource.data?.items, filter]);
  const groupedEntries = useMemo(() => {
    const groups = [];
    for (const entry of visibleEntries) {
      const key = dateKey(entry.timestamp);
      const current = groups.at(-1);
      if (current?.key === key) current.items.push(entry);
      else groups.push({ key, label: dateHeading(entry.timestamp), items: [entry] });
    }
    return groups;
  }, [visibleEntries]);

  const { recoveryBusy, recoverMaintenance } = useMaintenanceRecovery({
    invalidate,
    setResult,
    onSuccess: () => Promise.allSettled([healthResource.reload(), auditResource.reload(), refreshAll()]),
  });

  return (
    <OwnerSettingsGuard>
      <section className={`${styles.pageContent} ${styles.auditPage}`} aria-labelledby="audit-settings-title">
        <RefreshWarning error={healthResource.error || healthResource.refreshError || auditResource.refreshError || membersResource.refreshError} onRetry={() => Promise.allSettled([healthResource.reload(), auditResource.reload(), membersResource.reload()])} />
        <div className={styles.pageHeading}>
          <h2 id="audit-settings-title">Audit aktivitas</h2>
          <p>Riwayat perubahan penting untuk membantu meninjau akses, aktivitas keuangan, dan kondisi sistem.</p>
        </div>
        <SettingsNotice result={result} />
        <MaintenanceRecoveryPanel maintenanceMode={Boolean(healthResource.data?.maintenanceMode)} busy={recoveryBusy} onRecover={recoverMaintenance} description="Database sedang berada pada mode maintenance. Recovery hanya membuka akses tulis setelah integrity check lulus dan audit recovery tersimpan." />
        <SystemStatus healthResource={healthResource} backend={backend} />

        <section className={styles.auditActivitySection} aria-labelledby="audit-activity-heading">
          <div className={styles.auditActivityHeader}>
            <div><h3 id="audit-activity-heading">Aktivitas terbaru</h3><p>50 aktivitas terakhir, diurutkan dari yang paling baru.</p></div>
            <FiShield aria-hidden="true" />
          </div>
          <div className={styles.auditFilters} role="group" aria-label="Filter aktivitas audit">
            {AUDIT_FILTERS.map(([value, label]) => <button type="button" key={value} className={styles.auditFilter} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>

          {auditResource.status === "loading" ? <p className="empty-inline-message" role="status">Memuat aktivitas...</p> : null}
          {auditResource.status === "error" ? <div className="notice notice--danger" role="alert"><span>{auditResource.error?.message || "Audit belum dapat dimuat."}</span></div> : null}
          {visibleEntries.length ? (
            <>
              <div className={`${styles.auditDesktopTable} desktop-data-table`} role="region" aria-label="Aktivitas audit terbaru">
                <table className="data-table"><thead><tr><th>Waktu</th><th>Aktivitas</th><th>Dilakukan oleh</th><th>Objek</th><th>Status</th><th><span className="sr-only">Detail</span></th></tr></thead><tbody>
                  {visibleEntries.map((entry) => { const actor = actorPresentation(entry, memberLookup); return <tr key={entry.audit_id}><td>{fullDateLabel(entry.timestamp)}</td><td><strong>{auditActionLabel(entry.action, entry.entity_type)}</strong>{entry.detail_code ? <small>{auditDetailLabel(entry.detail_code)}</small> : null}</td><td><strong>{actor.name}</strong>{actor.detail ? <small>{actor.detail}</small> : null}</td><td>{auditEntityLabel(entry.entity_type)}</td><td><AuditResultMark result={entry.result} /></td><td className={styles.auditDetailCell}><button type="button" className={styles.auditDetailButton} onClick={() => setSelectedEntry(entry)} aria-label={`Buka detail ${auditActionLabel(entry.action, entry.entity_type)}`}><FiChevronRight aria-hidden="true" /></button></td></tr>; })}
                </tbody></table>
              </div>
              <div className={`${styles.auditTimeline} mobile-data-list`} aria-label="Aktivitas audit terbaru">
                {groupedEntries.map((group) => <section className={styles.auditDayGroup} key={group.key} aria-labelledby={`audit-day-${group.key}`}><h4 id={`audit-day-${group.key}`}>{group.label}</h4><div className={styles.auditDayList}>{group.items.map((entry) => <AuditActivityRow key={entry.audit_id} entry={entry} memberLookup={memberLookup} onOpen={setSelectedEntry} />)}</div></section>)}
              </div>
            </>
          ) : auditResource.status === "ready" ? <div className={styles.auditEmptyState}><FiActivity aria-hidden="true" /><strong>{filter === "all" ? "Belum ada aktivitas" : "Belum ada aktivitas pada kategori ini"}</strong><span>{filter === "all" ? "Perubahan penting akan tercatat di sini." : "Coba pilih filter lain untuk melihat riwayat audit."}</span></div> : null}
        </section>
      </section>
      <AuditDetailModal entry={selectedEntry} memberLookup={memberLookup} onClose={() => setSelectedEntry(null)} />
    </OwnerSettingsGuard>
  );
};

export default AuditPage;
