import { useState } from "react";
import Button from "../../../components/common/Button.jsx";
import ConfirmationModal from "../../../components/common/ConfirmationModal.jsx";
import { useFeedback } from "../../../components/feedback/feedbackContext.js";
import { isOutcomeUnknownError } from "../../../services/api/errors.js";
import { reviewGoalDeletion, withdrawGoalDeletion } from "../goalDeletionRequests.api.js";
import styles from "../../../components/common/RequestPanel.module.css";

const LABELS = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Ditarik" };
const STATES = { pending: styles.statusPending, approved: styles.statusApproved, rejected: styles.statusRejected, cancelled: styles.statusRejected };

const GoalDeletionRequestsPanel = ({ items = [], ownerMode = false, onChanged, title }) => {
  const { notify } = useFeedback();
  const [intent, setIntent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [unknown, setUnknown] = useState(false);
  const submit = async (reason) => {
    if (!intent || busy || unknown) return;
    const { request, decision } = intent;
    setBusy(true);
    setError(null);
    try {
      if (decision === "withdraw") await withdrawGoalDeletion({ request_id: request.request_id, row_version: request.row_version, reason }, { rowVersion: request.row_version });
      else await reviewGoalDeletion({ request_id: request.request_id, row_version: request.row_version, decision, reason }, { rowVersion: request.row_version });
      setIntent(null);
      notify({ message: decision === "withdraw" ? "Pengajuan ditarik. Target kembali terlihat." : decision === "approve" ? "Penghapusan Target disetujui." : "Pengajuan ditolak. Target kembali terlihat untuk pemohon.", tone: "success", dedupeKey: `goal-request:${request.request_id}:${decision}` });
      try { await onChanged?.(); } catch { notify({ message: "Keputusan tersimpan, tetapi daftar belum diperbarui. Muat ulang halaman.", tone: "warning" }); }
    } catch (failure) {
      setUnknown(isOutcomeUnknownError(failure));
      setError(isOutcomeUnknownError(failure) ? new Error("Hasil tindakan belum pasti. Muat ulang Pengajuan untuk memastikan statusnya sebelum bertindak kembali.") : failure);
    } finally { setBusy(false); }
  };
  const open = (request, decision) => { setIntent({ request, decision }); setError(null); setUnknown(false); };
  if (!items.length) return null;
  return <section className={styles.panel} aria-label={title || "Pengajuan hapus Target"}>
    <div className={styles.heading}><div><h2>{title || "Pengajuan hapus Target"}</h2><p>{ownerMode ? "Putuskan permintaan anggota tanpa mengubah saldo sebelum disetujui." : "Target disembunyikan dari daftar kamu selama menunggu persetujuan."}</p></div></div>
    <div className={styles.list}>{items.slice(0, ownerMode ? 100 : 20).map((request) => <article className={styles.item} key={request.request_id}>
      <div className={styles.top}><div><strong>{request.goal_name}</strong><small>{ownerMode ? request.requester_name || "Anggota" : "Pengajuan saya"}</small></div><span className={`${styles.status} ${STATES[request.status] || ""}`}>{LABELS[request.status] || request.status}</span></div>
      <div className={styles.meta}>Alasan: {request.reason}</div>
      {request.review_reason ? <small className={styles.meta}>Catatan admin: {request.review_reason}</small> : null}
      {request.status === "pending" ? <div className={styles.actions}>{ownerMode
        ? <><Button type="button" disabled={busy || unknown} onClick={() => open(request, "reject")}>Tolak</Button><Button type="button" variant="primary" disabled={busy || unknown} onClick={() => open(request, "approve")}>Setujui</Button></>
        : <Button type="button" disabled={busy || unknown} onClick={() => open(request, "withdraw")}>Tarik pengajuan</Button>}</div> : null}
    </article>)}</div>
    <ConfirmationModal open={Boolean(intent)} title={intent?.decision === "withdraw" ? "Tarik pengajuan hapus Target?" : intent?.decision === "reject" ? "Tolak penghapusan Target?" : "Setujui penghapusan Target?"} description={intent?.decision === "approve" ? `Target ${intent.request.goal_name} akan dihapus jika belum pernah dipakai, atau diarsipkan bila memiliki histori. Saldo dan transaksi tetap dilindungi.` : intent?.decision === "withdraw" ? `Target ${intent.request.goal_name} akan muncul kembali di daftar kamu.` : `Target ${intent?.request.goal_name || ""} akan muncul kembali untuk pemohon.`} confirmLabel={intent?.decision === "withdraw" ? "Tarik pengajuan" : intent?.decision === "reject" ? "Tolak pengajuan" : "Setujui penghapusan"} reasonLabel={intent?.decision === "approve" ? "Catatan keputusan (opsional)" : "Alasan keputusan"} requireReason={intent?.decision !== "approve"} busy={busy} retryOnly={unknown} error={error} onCancel={() => !busy && setIntent(null)} onConfirm={submit} />
  </section>;
};

export default GoalDeletionRequestsPanel;
