import { useState } from "react";
import { FiMonitor, FiRefreshCw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { formatDateTimeJakarta } from "../../domain/dates.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import useGuardedMutation from "../../hooks/useGuardedMutation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { invalidateSettingsActions, runSettingsAction } from "./settings.api.js";
import styles from "./Settings.module.css";

const displayTime = (value) => formatDateTimeJakarta(value, { fallback: "Waktu tidak tersedia" });

const revocationDialogCopy = (target) => {
  if (target?.kind === "all") {
    return {
      title: "Keluar dari semua perangkat?",
      description: "Semua sesi login Anda, termasuk perangkat ini, akan dicabut. Anda harus login kembali pada perangkat yang masih digunakan.",
      confirmLabel: "Keluar dari semua",
    };
  }
  if (target?.session?.is_current) {
    return {
      title: "Keluar dari perangkat ini?",
      description: "Sesi perangkat ini akan dicabut dan Anda akan kembali ke halaman login.",
      confirmLabel: "Keluar",
    };
  }
  return {
    title: "Cabut sesi perangkat?",
    description: `${target?.session?.device_label || "Perangkat"} tidak dapat mengakses aplikasi lagi tanpa login ulang.`,
    confirmLabel: "Cabut sesi",
  };
};

const ActiveSessionToolbar = ({ sessionCount, busy, loading, refreshing, onReload, onRevokeAll }) => (
  <div className={styles.serviceActions}>
    <Button type="button" icon={FiRefreshCw} disabled={loading || refreshing || busy} onClick={onReload}>Muat ulang</Button>
    {sessionCount > 1 ? <Button type="button" variant="danger" disabled={busy} onClick={onRevokeAll}>Keluar dari semua perangkat</Button> : null}
  </div>
);

const ActiveSessionNotices = ({ resource, mutationError, target, sessionCount }) => (
  <>
    {resource.status === "loading" ? <p role="status">Memuat sesi aktif...</p> : null}
    {resource.status === "error" ? <div className="notice notice--danger" role="alert">Sesi aktif belum dapat dimuat. Tidak ada sesi yang diubah.</div> : null}
    {resource.refreshError ? <div className="notice notice--warning" role="status">Daftar sesi belum dapat diperbarui. Data terakhir tetap ditampilkan.</div> : null}
    {mutationError && !target ? <div className="notice notice--danger" role="alert">{mutationError.message}</div> : null}
    {resource.status !== "loading" && !sessionCount && resource.status !== "error" ? (
      <div className="notice notice--info">Tidak ada sesi aktif lain yang dapat ditampilkan.</div>
    ) : null}
  </>
);

const ActiveSessionItem = ({ session, busy, onSelect }) => (
  <article className={styles.serviceTile}>
    <span className={styles.serviceIcon}><FiMonitor aria-hidden="true" /></span>
    <div className={styles.serviceCopy}>
      <h3>{session.device_label || "Perangkat"}</h3>
      <p>{session.is_current ? "Perangkat ini" : "Sesi perangkat lain"} · terakhir aktif {displayTime(session.last_seen_at)}</p>
      <small>Login {displayTime(session.issued_at)} · berakhir {displayTime(session.expires_at)}</small>
    </div>
    <div className={styles.sessionAction}>
      {session.is_current ? <span className="status-badge status-badge--success">Saat ini</span> : null}
      <Button type="button" variant={session.is_current ? "secondary" : "danger"} disabled={busy} onClick={() => onSelect(session)}>
        {session.is_current ? "Keluar" : "Cabut sesi"}
      </Button>
    </div>
  </article>
);

const ActiveSessionList = ({ sessions, busy, onSelect }) => {
  if (!sessions.length) return null;
  return (
    <div className={styles.sessionList} aria-label="Daftar sesi aktif">
      {sessions.map((session) => <ActiveSessionItem key={session.session_id} session={session} busy={busy} onSelect={onSelect} />)}
    </div>
  );
};

const RevocationDialog = ({ target, busy, error, onCancel, onConfirm }) => {
  const copy = revocationDialogCopy(target);
  return (
    <ConfirmationModal
      open={Boolean(target)}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
};

const ActiveSessionsPage = () => {
  const resource = useApiResource("sessions.listOwn");
  const mutation = useGuardedMutation();
  const { logout } = useAuth();
  const { notify } = useFeedback();
  const [target, setTarget] = useState(null);
  const sessions = resource.data?.items || [];

  const finishRevocation = async (result, message) => {
    invalidateSettingsActions("sessions.listOwn");
    setTarget(null);
    if (result?.revokedCurrent) {
      await logout();
      return;
    }
    await resource.reload().catch(() => null);
    notify({ message, tone: "info" });
  };

  const revokeTarget = () => mutation.run(async () => {
    const revokeAll = target?.kind === "all";
    const result = revokeAll
      ? await runSettingsAction("sessions.revokeAllOwn", {}, {})
      : await runSettingsAction("sessions.revokeOwn", { session_id: target?.session?.session_id }, {});
    await finishRevocation(result, revokeAll ? "Semua sesi aktif sudah dicabut." : "Sesi perangkat sudah dicabut.");
  }).catch(() => {});

  return (
    <section className={styles.pageContent} aria-labelledby="active-sessions-title">
      <div className={styles.pageHeading}>
        <h2 id="active-sessions-title">Perangkat &amp; sesi aktif</h2>
        <p>Kelola perangkat yang masih memiliki sesi login. Mencabut sesi tidak menghapus transaksi, saldo, atau data keuangan.</p>
      </div>

      <ActiveSessionToolbar
        sessionCount={sessions.length}
        busy={mutation.busy}
        loading={resource.status === "loading"}
        refreshing={resource.isRefreshing}
        onReload={() => resource.reload().catch(() => {})}
        onRevokeAll={() => setTarget({ kind: "all" })}
      />
      <ActiveSessionNotices resource={resource} mutationError={mutation.error} target={target} sessionCount={sessions.length} />
      <ActiveSessionList sessions={sessions} busy={mutation.busy} onSelect={(session) => setTarget({ kind: "one", session })} />
      <RevocationDialog
        target={target}
        busy={mutation.busy}
        error={mutation.error}
        onCancel={() => !mutation.busy && setTarget(null)}
        onConfirm={revokeTarget}
      />
    </section>
  );
};

export default ActiveSessionsPage;
