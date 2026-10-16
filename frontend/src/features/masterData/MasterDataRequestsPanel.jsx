import { useState } from "react";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { withdrawMasterDataRequest } from "../../services/masterDataRequests.js";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import styles from "../../components/common/RequestPanel.module.css";

const statusLabel = (status) => ({ pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Ditarik" }[status] || status);
const statusClass = (status) => ({ pending: styles.statusPending, approved: styles.statusApproved, rejected: styles.statusRejected, cancelled: styles.statusRejected }[status] || "");

const requestTitle = (request) => {
  const payload = request.payload || {};
  return payload.name || (request.request_type === "account" ? "Rekening baru" : "Kategori baru");
};

const requestMeta = (request) => {
  const payload = request.payload || {};
  if (request.request_type === "account") {
    const owner = payload.owner_scope === "shared" ? "Bersama" : "Dipegang anggota";
    return <>Rekening · {owner} · saldo awal <Money value={Number(payload.initial_balance || 0)} /></>;
  }
  return <>Kategori · {payload.transaction_type === "expense" ? "Pengeluaran" : payload.transaction_type === "income" ? "Pemasukan" : "Pengembalian dana"}</>;
};

const MasterDataRequestsPanel = ({ items = [], ownerMode = false, title, onApprove, onReject, busyId = "", unresolvedIntent = null, onRetryUnresolved, onChanged }) => {
  const { notify } = useFeedback();
  const [rejectTarget, setRejectTarget] = useState(null);
  const [withdrawTarget, setWithdrawTarget] = useState(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const withdrawPending = async (reason) => {
    if (!withdrawTarget || withdrawBusy) return;
    const current = withdrawTarget;
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      await withdrawMasterDataRequest({ request_id: current.request_id, row_version: current.row_version, reason }, { rowVersion: current.row_version });
      setWithdrawTarget(null);
      notify({ message: "Pengajuan berhasil ditarik. Tidak ada data keuangan yang berubah.", tone: "success", dedupeKey: `requests:withdraw:${current.request_id}` });
      // A refresh failure must not turn an already completed withdrawal into a
      // misleading "withdraw failed" message or tempt the user to submit again.
      try { await onChanged?.(); } catch { notify({ message: "Pengajuan ditarik, tetapi daftar belum dapat dimuat ulang. Segarkan halaman untuk melihat status terbaru.", tone: "warning" }); }
    } catch (error) {
      setWithdrawError(isOutcomeUnknownError(error)
        ? new Error("Hasil permintaan belum pasti. Muat ulang Pengajuan Saya sebelum mencoba lagi agar tidak mengulang tindakan yang sudah berhasil.")
        : error);
    } finally { setWithdrawBusy(false); }
  };
  const visible = ownerMode ? items.filter((item) => item.status === "pending") : items.slice(0, 6);
  if (!visible.length && !ownerMode) return null;
  return <section className={styles.panel} aria-labelledby="master-data-requests-title">
    <div className={styles.heading}><div><h2 id="master-data-requests-title">{title || (ownerMode ? "Pengajuan menunggu persetujuan" : "Pengajuan saya")}</h2><p>{ownerMode ? "Periksa sebelum data menjadi aktif dan memengaruhi pilihan aplikasi." : "Pengajuan belum menjadi data aktif sebelum Pengelola Keluarga menyetujuinya."}</p></div></div>
    {unresolvedIntent ? <div className="notice notice--warning" role="alert"><strong>Hasil keputusan pengajuan belum pasti.</strong><p>Keputusan dan alasan dikunci sampai request yang sama memperoleh hasil definitif.</p><Button type="button" disabled={Boolean(busyId)} loading={busyId === unresolvedIntent.request.request_id} onClick={onRetryUnresolved}>Coba lagi keputusan yang sama</Button></div> : null}
    {visible.length ? <div className={styles.list}>{visible.map((request) => <article className={styles.item} key={request.request_id}>
      <div className={styles.top}><div><strong>{requestTitle(request)}</strong><small>{request.requester_name || request.requester_email || "Saya"}</small></div><span className={`${styles.status} ${statusClass(request.status)}`}>{statusLabel(request.status)}</span></div>
      <div className={styles.meta}>{requestMeta(request)}</div>
      {request.review_reason ? <small className={styles.meta}>Catatan: {request.review_reason}</small> : null}
      {!ownerMode && request.status === "pending" ? <div className={styles.actions}><Button type="button" variant="danger" disabled={withdrawBusy} onClick={() => { setWithdrawError(null); setWithdrawTarget(request); }}>Tarik pengajuan</Button></div> : null}
      {ownerMode && request.status === "pending" ? <div className={styles.actions}><Button type="button" disabled={Boolean(busyId) || Boolean(unresolvedIntent)} onClick={() => setRejectTarget(request)}>Tolak</Button><Button type="button" variant="primary" disabled={Boolean(busyId) || Boolean(unresolvedIntent)} loading={busyId === request.request_id} onClick={() => onApprove(request)}>Setujui</Button></div> : null}
    </article>)}</div> : <p className={styles.empty}>Tidak ada pengajuan yang menunggu persetujuan.</p>}
    <ConfirmationModal open={Boolean(withdrawTarget)} title="Tarik pengajuan ini?" description={withdrawTarget ? `${requestTitle(withdrawTarget)} tidak akan diajukan lagi. Histori pengajuan tetap disimpan.` : ""} confirmLabel="Tarik pengajuan" reasonLabel="Alasan penarikan" requireReason busy={withdrawBusy} error={withdrawError} onCancel={() => !withdrawBusy && setWithdrawTarget(null)} onConfirm={withdrawPending} />
    <ConfirmationModal open={Boolean(rejectTarget)} title="Tolak pengajuan?" description={rejectTarget ? `${requestTitle(rejectTarget)} tidak akan menjadi data aktif.` : ""} confirmLabel="Tolak pengajuan" reasonLabel="Alasan penolakan" requireReason busy={busyId === rejectTarget?.request_id} onCancel={() => !busyId && setRejectTarget(null)} onConfirm={async (reason) => { if (!rejectTarget) return; const target = rejectTarget; const outcome = await onReject(target, reason); if (outcome?.ok || outcome?.outcomeUnknown) setRejectTarget(null); }} />
  </section>;
};

export default MasterDataRequestsPanel;
