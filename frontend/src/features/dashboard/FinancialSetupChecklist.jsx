import { FiAlertCircle, FiCheck, FiCircle, FiLock } from "react-icons/fi";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import styles from "./FinancialSetupChecklist.module.css";

const activeAccountIds = (accounts) => new Set(accounts.map((item) => item.account_id));
const stepStatus = (ready, blocked = false) => ready ? "ready" : blocked ? "blocked" : "attention";

const accountStep = ({ accounts, sharedAccounts, owner }) => {
  if (!owner) {
    const ready = sharedAccounts.length > 0;
    return { key: "accounts", label: "Rekening", status: ready ? "ready" : "blocked", detail: ready ? "Siap" : "Administrator menyiapkan rekening Bersama", to: null };
  }
  if (!accounts.length) return { key: "accounts", label: "Rekening", status: "attention", detail: "Belum disiapkan", to: "/rekening" };
  return { key: "accounts", label: "Rekening", status: sharedAccounts.length ? "ready" : "attention", detail: sharedAccounts.length ? "Siap" : "Rekening pribadi siap. Rekening Bersama belum dibuat.", to: "/rekening" };
};

const categoryStep = ({ categories, owner }) => {
  const hasIncome = categories.some((item) => item.transaction_type === "income");
  const hasExpense = categories.some((item) => item.transaction_type === "expense");
  const ready = hasIncome && hasExpense;
  let detail = "Pemasukan dan pengeluaran siap";
  if (!ready && !owner) detail = "Administrator menyiapkan kategori yang belum tersedia";
  else if (!hasIncome && !hasExpense) detail = "Kategori pemasukan dan pengeluaran belum siap";
  else if (!hasIncome) detail = "Kategori pemasukan belum siap";
  else if (!hasExpense) detail = "Kategori pengeluaran belum siap";
  return { key: "categories", label: "Kategori", status: stepStatus(ready, !owner), detail, to: owner ? "/kategori" : null };
};

const planningStep = ({ key, label, items, owner, memberHasSharedAccount, readyDetail, attentionDetail }) => {
  const ready = items.some((item) => owner || item.scope === "shared");
  const blocked = !owner && !memberHasSharedAccount;
  return { key, label, status: stepStatus(ready, blocked), detail: ready ? readyDetail : blocked ? "Butuh rekening Bersama aktif" : attentionDetail, to: owner || memberHasSharedAccount ? (key === "envelopes" ? "/perencanaan/kantong" : "/target") : null };
};

const setupState = ({ bootstrap, overview, user }) => {
  const accounts = (bootstrap?.accounts || []).filter((item) => item.status === "active");
  const accountIds = activeAccountIds(accounts);
  const sharedAccounts = accounts.filter((item) => item.owner_scope === "shared");
  const categories = (bootstrap?.categories || []).filter((item) => item.status === "active");
  const envelopes = (overview?.envelopes || []).filter((item) => item.status === "active" && item.source_account_id && accountIds.has(item.source_account_id));
  const goals = (overview?.goals || []).filter((item) => item.status === "active" && item.account_id && accountIds.has(item.account_id));
  const owner = user?.role === "owner";
  const memberHasSharedAccount = sharedAccounts.length > 0;
  return [
    accountStep({ accounts, sharedAccounts, owner }),
    categoryStep({ categories, owner }),
    planningStep({ key: "envelopes", label: "Alokasi Dana", items: envelopes, owner, memberHasSharedAccount, readyDetail: "Siap", attentionDetail: "Belum ada Alokasi Dana dengan rekening sumber aktif" }),
    planningStep({ key: "goals", label: "Target", items: goals, owner, memberHasSharedAccount, readyDetail: "Siap menerima setoran", attentionDetail: "Belum ada Target dengan rekening aktif" }),
  ];
};

const SetupStep = ({ step, index }) => {
  const ready = step.status === "ready";
  const blocked = step.status === "blocked";
  const attention = step.status === "attention";
  const Icon = ready ? FiCheck : blocked ? FiLock : attention ? FiAlertCircle : FiCircle;
  const content = <><span className={styles.icon}><Icon aria-hidden="true" /></span><span><strong>{index + 1}. {step.label}</strong><small>{step.detail}</small></span></>;
  const className = [styles.step, ready ? styles.ready : "", attention ? styles.attention : "", blocked ? styles.blocked : ""].filter(Boolean).join(" ");
  return step.to && !ready ? <Link className={className} to={step.to} state={{ setupFlow: true }}>{content}</Link> : <div className={className}>{content}</div>;
};

const FinancialSetupChecklist = ({ bootstrap, overview, user }) => {
  const steps = setupState({ bootstrap, overview, user });
  if (steps.every((step) => step.status === "ready")) return null;
  const completed = steps.filter((step) => step.status === "ready").length;
  return <Card className={styles.card} aria-labelledby="financial-setup-title">
    <div className={styles.heading}><div><span>Penyiapan awal</span><h2 id="financial-setup-title">Siapkan alur keuangan</h2><p>Selesaikan urutan ini agar transaksi, Alokasi Dana, dan Target saling terhubung.</p></div><strong>{completed}/{steps.length}</strong></div>
    <div className={styles.steps}>{steps.map((step, index) => <SetupStep key={step.key} step={step} index={index} />)}</div>
  </Card>;
};

export default FinancialSetupChecklist;
