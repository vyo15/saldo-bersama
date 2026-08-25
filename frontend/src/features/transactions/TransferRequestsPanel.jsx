import { useState } from "react";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import styles from "../../components/common/RequestPanel.module.css";

const statusLabel = (status) => ({ pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak" }[status] || status);
const displayAccount = (lookup, accountId, fallback) => lookup[accountId] ? accountDisplayLabel(lookup[accountId]) : fallback;

const TransferRequestCard = ({ request, lookup, ownerMode, busyId, onDecision }) => {
  const payload = request.payload || {};
  const fromLabel = displayAccount(lookup, payload.source_account_id, "Rekening Bersama");
  const toLabel = displayAccount(lookup, payload.destination_account_id, "Rekening pribadi");
  const showActions = ownerMode && request.status === "pending";
  return <article className={styles.item}>
    <div className={styles.top}>
      <div><strong><Money value={Number(payload.amount || 0)} /></strong><small>{request.requester_name || request.requester_email || "Saya"}</small></div>
      <span className={styles.status}>{statusLabel(request.status)}</span>
    </div>
    <div className={styles.meta}>{fromLabel} → {toLabel} · {payload.transaction_date || ""}</div>
    {payload.description ? <small className={styles.meta}>{payload.description}</small> : null}
    {request.review_reason ? <small className={styles.meta}>Catatan: {request.review_reason}</small> : null}
    {showActions ? <div className={styles.actions}>
      <Button type="button" variant="primary" disabled={Boolean(busyId)} onClick={() => onDecision("approve", request)}>Setujui</Button>
      <Button type="button" disabled={Boolean(busyId)} onClick={() => onDecision("reject", request)}>Tolak</Button>
    </div> : null}
  </article>;
};

const TransferDecisionModal = ({ target, lookup, busyId, onApprove, onReject, onClose }) => {
  const request = target?.request || null;
  const payload = request?.payload || {};
  const approving = target?.decision === "approve";
  const sourceLabel = displayAccount(lookup, payload.source_account_id, "Rekening Bersama");
  const destinationLabel = displayAccount(lookup, payload.destination_account_id, "Rekening pribadi");
  const confirm = async (reason) => {
    if (!request) return;
    if (approving) await onApprove(request, reason);
    else await onReject(request, reason);
    onClose();
  };
  return <ConfirmationModal
    open={Boolean(target)}
    title={approving ? "Setujui transfer dana Bersama?" : "Tolak pengajuan transfer?"}
    description={request ? `${sourceLabel} → ${destinationLabel}. Saldo hanya berubah jika persetujuan berhasil diproses server.` : ""}
    confirmLabel={approving ? "Setujui dan transfer" : "Tolak pengajuan"}
    reasonLabel={approving ? "Catatan persetujuan (opsional)" : "Alasan penolakan"}
    requireReason={!approving}
    busy={busyId === request?.request_id}
    onCancel={() => !busyId && onClose()}
    onConfirm={confirm}
  >{request ? <div className="notice notice--warning"><span>Nominal <Money value={Number(payload.amount || 0)} /></span></div> : null}</ConfirmationModal>;
};

const TransferRequestsPanel = ({ items = [], accounts = [], ownerMode = false, busyId = "", onApprove, onReject }) => {
  const [decisionTarget, setDecisionTarget] = useState(null);
  const lookup = Object.fromEntries(accounts.map((item) => [item.account_id, item]));
  const visible = ownerMode ? items.filter((item) => item.status === "pending") : items.slice(0, 6);
  if (!visible.length) return null;
  return <section className={styles.panel} aria-labelledby="transfer-requests-title">
    <div className={styles.heading}><div><h2 id="transfer-requests-title">{ownerMode ? "Transfer menunggu persetujuan" : "Pengajuan transfer saya"}</h2><p>{ownerMode ? "Dana Bersama belum bergerak sebelum pengajuan disetujui." : "Saldo belum berubah sampai Administrator menyetujui pengajuan."}</p></div></div>
    <div className={styles.list}>{visible.map((request) => <TransferRequestCard key={request.request_id} request={request} lookup={lookup} ownerMode={ownerMode} busyId={busyId} onDecision={(decision, targetRequest) => setDecisionTarget({ decision, request: targetRequest })} />)}</div>
    <TransferDecisionModal target={decisionTarget} lookup={lookup} busyId={busyId} onApprove={onApprove} onReject={onReject} onClose={() => setDecisionTarget(null)} />
  </section>;
};

export default TransferRequestsPanel;
