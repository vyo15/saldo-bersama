import { useEffect, useMemo, useState } from "react";
import {
  FiArrowDownLeft,
  FiArrowLeft,
  FiArrowUpRight,
  FiChevronRight,
  FiHome,
  FiRepeat,
  FiTarget,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { useNavigate } from "react-router";
import Modal from "../common/Modal.jsx";
import Button from "../common/Button.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { formatRupiah } from "../../domain/money.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import {
  QUICK_RECORD_ACTIONS,
  commitmentPaymentNavigation,
  quickRecordNavigation,
  quickRecordTransactionOptions,
} from "../../shared/workflows/quickRecord.js";
import styles from "./QuickRecordMenu.module.css";

const ICONS = Object.freeze({
  expense: FiArrowUpRight,
  commitment: FiHome,
  income: FiArrowDownLeft,
  transfer: FiRepeat,
  goal: FiTarget,
  investment: FiTrendingUp,
});

const commitmentInstallmentLabel = (item) => {
  const total = Math.max(0, Number(item?.total_installments || 0));
  const paid = Math.max(0, Number(item?.installments_paid || 0));
  if (!total) return "";
  const next = Math.min(total, paid + 1);
  return `Cicilan ${next} dari ${total}`;
};

const commitmentDueLabel = (item) => item?.next_due_date
  ? formatDateLongIndonesia(item.next_due_date)
  : "Jadwal berikutnya belum tersedia";

const PRIMARY_ACTION_IDS = Object.freeze(["expense", "income", "transfer", "commitment"]);
const FUTURE_ACTION_IDS = Object.freeze(["goal", "investment"]);
const ACTION_PRESENTATION = Object.freeze({
  expense: Object.freeze({ label: "Pengeluaran", description: "Belanja & kebutuhan" }),
  income: Object.freeze({ label: "Pemasukan", description: "Gaji & uang masuk" }),
  transfer: Object.freeze({ label: "Transfer", description: "Antar rekening" }),
  commitment: Object.freeze({ label: "Kewajiban", description: "KPR & cicilan" }),
  goal: Object.freeze({ label: "Target", description: "Setor tujuan" }),
  investment: Object.freeze({ label: "Investasi", description: "Beli aset" }),
});

const quickRecordActionById = new Map(QUICK_RECORD_ACTIONS.map((action) => [action.id, action]));

const ActionCard = ({ actionId, onSelect, secondary = false }) => {
  const action = quickRecordActionById.get(actionId);
  const presentation = ACTION_PRESENTATION[actionId] || action;
  const Icon = ICONS[actionId];
  if (!action || !Icon) return null;
  return <button
    type="button"
    className={`${styles.actionCard} ${secondary ? styles.actionCardSecondary : ""}`.trim()}
    onClick={() => onSelect(actionId)}
    aria-label={action.label}
  >
    <span className={styles.actionIcon} aria-hidden="true"><Icon /></span>
    <span className={styles.actionCopy}><strong>{presentation.label}</strong><small>{presentation.description}</small></span>
  </button>;
};

const ActionList = ({ onSelect }) => <div className={styles.actionMenu}>
  <div className={styles.primaryGrid}>
    {PRIMARY_ACTION_IDS.map((actionId) => <ActionCard key={actionId} actionId={actionId} onSelect={onSelect} />)}
  </div>
  <div className={styles.futureLabel}><span>Untuk masa depan</span></div>
  <div className={styles.futureGrid}>
    {FUTURE_ACTION_IDS.map((actionId) => <ActionCard key={actionId} actionId={actionId} onSelect={onSelect} secondary />)}
  </div>
</div>;

const CommitmentStatus = ({ resource }) => {
  if (resource.status === "loading" || resource.status === "refreshing") return <div className={styles.state} role="status">Menyiapkan kewajiban aktif…</div>;
  if (resource.status === "error") return <div className={styles.state} role="alert"><strong>Kewajiban belum dapat dimuat.</strong><Button type="button" onClick={resource.reload}>Coba lagi</Button></div>;
  return null;
};

const CommitmentList = ({ resource, onBack, onPay }) => {
  const items = useMemo(() => (resource.data?.items || []).filter((item) => item.status === "active"), [resource.data?.items]);
  return <div className={styles.commitmentStep}>
    <button type="button" className={styles.backAction} onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua aktivitas</button>
    <CommitmentStatus resource={resource} />
    {resource.status === "ready" && !items.length ? <div className={styles.state}><strong>Belum ada kewajiban aktif.</strong><span>Tambahkan KPR, cicilan, pinjaman, atau Arisan dari menu Kewajiban terlebih dahulu.</span></div> : null}
    {resource.status === "ready" && items.length ? <div className={styles.commitmentList}>
      {items.map((item) => {
        const payment = commitmentPaymentNavigation(item);
        const arisan = item.commitment_type === "arisan";
        const installmentLabel = commitmentInstallmentLabel(item);
        const amount = Math.max(0, Number(item.next_due_remaining || item.installment_amount || 0));
        return <button key={item.commitment_id} type="button" className={styles.commitmentRow} disabled={!payment} onClick={() => payment && onPay(payment)}>
          <span className={styles.commitmentIcon} aria-hidden="true">{arisan ? <FiUsers /> : <FiHome />}</span>
          <span className={styles.commitmentCopy}>
            <span className={styles.commitmentHeading}><strong>{item.name}</strong><b>{formatRupiah(amount)}</b></span>
            <small>{[item.provider, installmentLabel].filter(Boolean).join(" · ") || (arisan ? "Setoran rutin" : "Kewajiban rutin")}</small>
            <small>{commitmentDueLabel(item)}{item.budget_id ? " · Alokasi terhubung" : ""}</small>
          </span>
          <FiChevronRight className={styles.chevron} aria-hidden="true" />
        </button>;
      })}
    </div> : null}
  </div>;
};

const QuickRecordMenu = ({ open, onClose, onOpenTransaction }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState("actions");
  const commitmentResource = useApiResource("commitments.list", {}, { enabled: open && step === "commitments" });

  useEffect(() => {
    if (!open) setStep("actions");
  }, [open]);

  const openNavigation = (navigation) => {
    if (!navigation) return;
    onClose();
    navigate(navigation.to, { state: navigation.state });
  };

  const handleAction = (actionId) => {
    if (actionId === "commitment") {
      setStep("commitments");
      return;
    }
    const transactionOptions = quickRecordTransactionOptions(actionId);
    if (transactionOptions) {
      onClose();
      onOpenTransaction(transactionOptions);
      return;
    }
    openNavigation(quickRecordNavigation(actionId));
  };

  const commitmentStep = step === "commitments";
  return <Modal
    open={open}
    onClose={onClose}
    dismissible
    mobileSwipeToClose
    size="sm"
    className={styles.modal}
    title={commitmentStep ? "Bayar kewajiban" : "Catat aktivitas"}
    description={commitmentStep ? "Pilih kewajiban yang ingin dibayar. Progres, Alokasi, dan transaksi akan diperbarui dari alur pembayaran yang sama." : "Pilih yang baru saja terjadi."}
  >
    {commitmentStep
      ? <CommitmentList resource={commitmentResource} onBack={() => setStep("actions")} onPay={openNavigation} />
      : <ActionList onSelect={handleAction} />}
  </Modal>;
};

export default QuickRecordMenu;
