import { useCallback, useEffect, useMemo, useState } from "react";
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
  quickRecordGoalNavigation,
  quickRecordInvestmentNavigation,
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
  commitment: Object.freeze({ label: "Bayar kewajiban", description: "KPR & cicilan" }),
  goal: Object.freeze({ label: "Target", description: "Tambah dana" }),
  investment: Object.freeze({ label: "Investasi", description: "Beli / tambah aset" }),
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
    aria-label={presentation.label}
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

const ResourceStatus = ({ resource, loadingLabel, errorTitle, isEmpty = false, empty, reloadLabel = "Coba lagi" }) => {
  if (resource.status === "loading" || resource.status === "refreshing") return <div className={styles.state} role="status">{loadingLabel}</div>;
  if (resource.status === "error") return <div className={styles.state} role="alert"><strong>{errorTitle}</strong><Button type="button" onClick={resource.reload}>{reloadLabel}</Button></div>;
  if (resource.status === "ready" && isEmpty) return empty;
  return null;
};

const StepBack = ({ onBack }) => <button type="button" className={styles.backAction} onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua aktivitas</button>;

const CommitmentList = ({ resource, onBack, onPay }) => {
  const items = useMemo(() => (resource.data?.items || []).filter((item) => item.status === "active"), [resource.data?.items]);
  return <div className={styles.commitmentStep}>
    <StepBack onBack={onBack} />
    <ResourceStatus
      resource={resource}
      loadingLabel="Menyiapkan kewajiban aktif…"
      errorTitle="Kewajiban belum dapat dimuat."
      isEmpty={!items.length}
      empty={<div className={styles.state}><strong>Belum ada kewajiban aktif.</strong><span>Tambahkan KPR, cicilan, pinjaman, atau Arisan dari menu Kewajiban terlebih dahulu.</span></div>}
    />
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

const GoalList = ({ resource, onBack, onSelect, onOpenGoals }) => {
  const items = useMemo(() => (resource.data?.items || []).filter((item) => item.status === "active"), [resource.data?.items]);
  return <div className={styles.commitmentStep}>
    <StepBack onBack={onBack} />
    <ResourceStatus
      resource={resource}
      loadingLabel="Menyiapkan Target aktif…"
      errorTitle="Target belum dapat dimuat."
      isEmpty={!items.length}
      empty={<div className={styles.state}><strong>Belum ada Target aktif.</strong><span>Buat Target terlebih dahulu agar dana yang disiapkan punya tujuan yang jelas.</span><Button type="button" variant="primary" onClick={onOpenGoals}>Buka Target</Button></div>}
    />
    {resource.status === "ready" && items.length > 1 ? <div className={styles.commitmentList}>
      {items.map((item) => <button key={item.goal_id} type="button" className={styles.commitmentRow} onClick={() => onSelect(item)}>
        <span className={styles.commitmentIcon} aria-hidden="true"><FiTarget /></span>
        <span className={styles.commitmentCopy}>
          <span className={styles.commitmentHeading}><strong>{item.name}</strong><b>{Math.max(0, Number(item.target_amount || 0)) ? `${Math.min(100, Math.round((Math.max(0, Number(item.current_amount || 0)) / Math.max(1, Number(item.target_amount || 0))) * 100))}%` : "0%"}</b></span>
          <small>Terkumpul {formatRupiah(item.current_amount || 0)} dari {formatRupiah(item.target_amount || 0)}</small>
          <small>Kurang {formatRupiah(item.remaining_amount || 0)}</small>
        </span>
        <FiChevronRight className={styles.chevron} aria-hidden="true" />
      </button>)}
    </div> : null}
  </div>;
};

const InvestmentList = ({ resource, onBack, onSelect, onOpenInvestments }) => {
  const portfolios = useMemo(() => (resource.data?.portfolios || []).filter((item) => item.can_operate !== false), [resource.data?.portfolios]);
  return <div className={styles.commitmentStep}>
    <StepBack onBack={onBack} />
    <ResourceStatus
      resource={resource}
      loadingLabel="Menyiapkan portofolio investasi…"
      errorTitle="Investasi belum dapat dimuat."
      isEmpty={!portfolios.length}
      empty={<div className={styles.state}><strong>Belum ada portofolio yang dapat dicatat.</strong><span>Tambahkan aset investasi terlebih dahulu.</span><Button type="button" variant="primary" onClick={onOpenInvestments}>Buka Investasi</Button></div>}
    />
    {resource.status === "ready" && portfolios.length > 1 ? <div className={styles.commitmentList}>
      {portfolios.map((portfolio) => <button key={portfolio.portfolio_id} type="button" className={styles.commitmentRow} onClick={() => onSelect(portfolio)}>
        <span className={styles.commitmentIcon} aria-hidden="true"><FiTrendingUp /></span>
        <span className={styles.commitmentCopy}>
          <span className={styles.commitmentHeading}><strong>{portfolio.name || "Investasi"}</strong><b>{(portfolio.holdings || []).length} aset</b></span>
          <small>{portfolio.broker || "Portofolio investasi"}</small>
          <small>Pilih portofolio lalu catat pembelian dengan form Investasi yang sama.</small>
        </span>
        <FiChevronRight className={styles.chevron} aria-hidden="true" />
      </button>)}
    </div> : null}
  </div>;
};

const QuickRecordMenu = ({ open, onClose, onOpenTransaction }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState("actions");
  const commitmentResource = useApiResource("commitments.list", {}, { enabled: open && step === "commitments" });
  const goalResource = useApiResource("goals.list", {}, { enabled: open && step === "goals" });
  const investmentResource = useApiResource("investments.overview", {}, { enabled: open && step === "investments" });

  useEffect(() => {
    if (!open) setStep("actions");
  }, [open]);

  const openNavigation = useCallback((navigation) => {
    if (!navigation) return;
    onClose();
    navigate(navigation.to, { state: navigation.state });
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open || step !== "commitments" || commitmentResource.status !== "ready") return;
    const active = (commitmentResource.data?.items || []).filter((item) => item.status === "active");
    if (active.length !== 1) return;
    const payment = commitmentPaymentNavigation(active[0]);
    if (payment) openNavigation(payment);
  }, [commitmentResource.data?.items, commitmentResource.status, open, openNavigation, step]);

  useEffect(() => {
    if (!open || step !== "goals" || goalResource.status !== "ready") return;
    const active = (goalResource.data?.items || []).filter((item) => item.status === "active");
    if (active.length === 1) openNavigation(quickRecordGoalNavigation(active[0]));
  }, [goalResource.data?.items, goalResource.status, open, openNavigation, step]);

  useEffect(() => {
    if (!open || step !== "investments" || investmentResource.status !== "ready") return;
    const operable = (investmentResource.data?.portfolios || []).filter((item) => item.can_operate !== false);
    if (operable.length === 1) openNavigation(quickRecordInvestmentNavigation(operable[0]));
  }, [investmentResource.data?.portfolios, investmentResource.status, open, openNavigation, step]);

  const handleAction = (actionId) => {
    if (actionId === "commitment") { setStep("commitments"); return; }
    if (actionId === "goal") { setStep("goals"); return; }
    if (actionId === "investment") { setStep("investments"); return; }
    const transactionOptions = quickRecordTransactionOptions(actionId);
    if (!transactionOptions) return;
    onClose();
    onOpenTransaction(transactionOptions);
  };

  const title = step === "commitments" ? "Bayar kewajiban" : step === "goals" ? "Tambah dana ke Target" : step === "investments" ? "Catat investasi" : "Catat aktivitas";
  const description = step === "commitments"
    ? "Pilih kewajiban yang ingin dibayar."
    : step === "goals"
      ? "Pilih Target bila ada lebih dari satu. Jika hanya satu, alur dilanjutkan otomatis."
      : step === "investments"
        ? "Pilih portofolio bila ada lebih dari satu. Aset dan nominal tetap dipilih di form Investasi."
        : "Pilih yang baru saja terjadi.";

  return <Modal
    open={open}
    onClose={onClose}
    dismissible
    mobileSwipeToClose
    size="sm"
    className={styles.modal}
    title={title}
    description={description}
  >
    {step === "commitments" ? <CommitmentList resource={commitmentResource} onBack={() => setStep("actions")} onPay={openNavigation} /> : null}
    {step === "goals" ? <GoalList resource={goalResource} onBack={() => setStep("actions")} onSelect={(goal) => openNavigation(quickRecordGoalNavigation(goal))} onOpenGoals={() => openNavigation(quickRecordNavigation("goal"))} /> : null}
    {step === "investments" ? <InvestmentList resource={investmentResource} onBack={() => setStep("actions")} onSelect={(portfolio) => openNavigation(quickRecordInvestmentNavigation(portfolio))} onOpenInvestments={() => openNavigation(quickRecordNavigation("investment"))} /> : null}
    {step === "actions" ? <ActionList onSelect={handleAction} /> : null}
  </Modal>;
};

export default QuickRecordMenu;
