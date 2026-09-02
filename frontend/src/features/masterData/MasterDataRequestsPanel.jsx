import { useState } from "react";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import styles from "../../components/common/RequestPanel.module.css";

const statusLabel = (status) => ({ pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" }[status] || status);
const statusClass = (status) => ({ pending: styles.statusPending, approved: styles.statusApproved, rejected: styles.statusRejected }[status] || "");

const requestTitle = (request) => {
  const payload = request.payload || {};
  return payload.name || (request.request_type === "account" ? "Rekening baru" : "Kategori baru");
};

const requestMeta = (request) => {
  const payload = request.payload || {};
  if (request.request_type === "account") {
    const owner = payload.owner_scope === "shared" ? "Bersama" : "Pribadi";
    return <>Rekening · {owner} · saldo awal <Money value={Number(payload.initial_balance || 0)} /></>;
  }
  return <>Kategori · {payload.transaction_type === "expense" ? "Pengeluaran" : payload.transaction_type === "income" ? "Pemasukan" : "Pengembalian dana"}</>;
};

const MasterDataRequestsPanel = ({ items = [], ownerMode = false, title, onApprove, onReject, busyId = "", unresolvedIntent = null, onRetryUnresolved }) => {
  const [rejectTarget, setRejectTarget] = useState(null);
  const visible = ownerMode ? items.filter((item) => item.status === "pending") : items.slice(0, 6);
  if (!visible.length && !ownerMode) return null;
  return <section className={styles.panel} aria-labelledby="master-data-requests-title">
    <div className={styles.heading}><div><h2 id="master-data-requests-title">{title || (ownerMode ? "Pengajuan menunggu persetujuan" : "Pengajuan saya")}</h2><p>{ownerMode ? "Periksa sebelum data menjadi aktif dan memengaruhi pilihan aplikasi." : "Pengajuan belum menjadi data aktif sebelum Administrator menyetujuinya."}</p></div></div>
    {unresolvedIntent ? <div className="notice notice--warning" role="alert"><strong>Hasil keputusan pengajuan belum pasti.</strong><p>Keputusan dan alasan dikunci sampai request yang sama memperoleh hasil definitif.</p><Button type="button" disabled={Boolean(busyId)} loading={busyId === unresolvedIntent.request.request_id} onClick={onRetryUnresolved}>Coba lagi keputusan yang sama</Button></div> : null}
    {visible.length ? <div className={styles.list}>{visible.map((request) => <article className={styles.item} key={request.request_id}>
      <div className={styles.top}><div><strong>{requestTitle(request)}</strong><small>{request.requester_name || request.requester_email || "Saya"}</small></div><span className={`${styles.status} ${statusClass(request.status)}`}>{statusLabel(request.status)}</span></div>
      <div className={styles.meta}>{requestMeta(request)}</div>
      {request.review_reason ? <small className={styles.meta}>Catatan: {request.review_reason}</small> : null}
      {ownerMode && request.status === "pending" ? <div className={styles.actions}><Button type="button" variant="primary" disabled={Boolean(busyId) || Boolean(unresolvedIntent)} loading={busyId === request.request_id} onClick={() => onApprove(request)}>Setujui</Button><Button type="button" disabled={Boolean(busyId) || Boolean(unresolvedIntent)} onClick={() => setRejectTarget(request)}>Tolak</Button></div> : null}
    </article>)}</div> : <p className={styles.empty}>Tidak ada pengajuan yang menunggu persetujuan.</p>}
    <ConfirmationModal open={Boolean(rejectTarget)} title="Tolak pengajuan?" description={rejectTarget ? `${requestTitle(rejectTarget)} tidak akan menjadi data aktif.` : ""} confirmLabel="Tolak pengajuan" reasonLabel="Alasan penolakan" requireReason busy={busyId === rejectTarget?.request_id} onCancel={() => !busyId && setRejectTarget(null)} onConfirm={async (reason) => { if (!rejectTarget) return; const target = rejectTarget; const outcome = await onReject(target, reason); if (outcome?.ok || outcome?.outcomeUnknown) setRejectTarget(null); }} />
  </section>;
};

export default MasterDataRequestsPanel;
