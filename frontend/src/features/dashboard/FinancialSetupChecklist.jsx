import { FiAlertCircle, FiCheck, FiCircle } from "react-icons/fi";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import styles from "./FinancialSetupChecklist.module.css";

const activeAccountIds = (accounts) => new Set(accounts.map((item) => item.account_id));
const stepStatus = (ready, blocked = false) => ready ? "ready" : blocked ? "blocked" : "attention";

const accountStep = ({ operableAccounts, owner }) => {
  const ready = operableAccounts.length > 0;
  return {
    key: "accounts", label: "Rekening", status: ready ? "ready" : "attention",
    detail: ready ? "Siap" : owner ? "Belum ada rekening aktif" : "Ajukan rekening untuk dipakai setelah disetujui",
    to: ready ? null : "/rekening",
  };
};

const categoryStep = ({ categories, owner }) => {
  const hasIncome = categories.some((item) => item.transaction_type === "income");
  const hasExpense = categories.some((item) => item.transaction_type === "expense");
  const ready = hasIncome && hasExpense;
  let detail = "Pemasukan dan pengeluaran siap";
  if (!hasIncome && !hasExpense) detail = owner ? "Kategori pemasukan dan pengeluaran belum siap" : "Ajukan kategori yang masih dibutuhkan";
  else if (!hasIncome) detail = "Kategori pemasukan belum siap";
  else if (!hasExpense) detail = "Kategori pengeluaran belum siap";
  return { key: "categories", label: "Kategori", status: stepStatus(ready), detail, to: ready ? null : "/kategori" };
};

const planningStep = ({ key, label, ready, blocked, readyDetail, attentionDetail, blockedDetail, to }) => ({
  key, label, status: stepStatus(ready, blocked), detail: ready ? readyDetail : blocked ? blockedDetail : attentionDetail, to: ready ? null : to,
});

const setupState = ({ bootstrap, overview, user }) => {
  const actor = bootstrap?.user || user || {};
  const accounts = (bootstrap?.accounts || []).filter((item) => item.status === "active");
  const accountIds = activeAccountIds(accounts);
  const operableAccounts = accounts.filter((item) => item.can_transact !== false);
  const sharedAccounts = operableAccounts.filter((item) => item.owner_scope === "shared");
  const categories = (bootstrap?.categories || []).filter((item) => item.status === "active");
  const envelopes = (overview?.envelopes || []).filter((item) => item.status === "active" && item.source_account_id && accountIds.has(item.source_account_id));
  const usableEnvelopes = envelopes.filter((item) => item.can_manage_needs === true);
  const goals = (overview?.goals || []).filter((item) => item.status === "active" && item.account_id && accountIds.has(item.account_id) && item.scope === "shared");
  const owner = actor.role === "owner";
  return [
    accountStep({ operableAccounts, owner }),
    categoryStep({ categories, owner }),
    planningStep({ key: "envelopes", label: "Alokasi Dana", ready: usableEnvelopes.length > 0, blocked: operableAccounts.length === 0, readyDetail: "Siap", attentionDetail: "Belum ada Alokasi Dana", blockedDetail: "Butuh rekening yang dapat digunakan", to: "/perencanaan/kantong" }),
    planningStep({ key: "goals", label: "Target", ready: goals.length > 0, blocked: sharedAccounts.length === 0, readyDetail: "Siap menerima setoran", attentionDetail: "Belum ada Target Bersama", blockedDetail: "Butuh rekening Bersama aktif", to: sharedAccounts.length ? "/target" : "/rekening" }),
  ];
};

const SetupStep = ({ step, index }) => {
  const ready = step.status === "ready";
  const blocked = step.status === "blocked";
  const attention = step.status === "attention";
  const Icon = ready ? FiCheck : attention || blocked ? FiAlertCircle : FiCircle;
  const content = <><span className={styles.icon}><Icon aria-hidden="true" /></span><span><strong>{index + 1}. {step.label}</strong><small>{step.detail}</small></span></>;
  const className = [styles.step, ready ? styles.ready : "", attention ? styles.attention : "", blocked ? styles.blocked : ""].filter(Boolean).join(" ");
  return step.to && !ready ? <Link className={className} to={step.to} state={{ setupFlow: true }}>{content}</Link> : <div className={className}>{content}</div>;
};

const FinancialSetupChecklist = ({ bootstrap, overview, user }) => {
  const steps = setupState({ bootstrap, overview, user });
  if (steps.every((step) => step.status === "ready")) return null;
  const completed = steps.filter((step) => step.status === "ready").length;
  return <Card className={styles.card} aria-labelledby="financial-setup-title">
    <details className={styles.details} defaultOpen={completed === 0}>
      <summary className={styles.summary}><span><strong id="financial-setup-title">Penyiapan awal · {completed}/{steps.length} selesai</strong><small>{completed === 0 ? "Mulai dari Rekening agar fitur keuangan siap dipakai" : "Lanjutkan penyiapan keuangan"}</small></span><span aria-hidden="true">›</span></summary>
      <div className={styles.expanded}><p>Lengkapi fondasi yang belum siap. Pengajuan rekening/kategori Member baru aktif setelah disetujui Administrator.</p><div className={styles.steps}>{steps.map((step, index) => <SetupStep key={step.key} step={step} index={index} />)}</div></div>
    </details>
  </Card>;
};

export default FinancialSetupChecklist;
