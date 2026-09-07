import { FiAlertCircle, FiCheck } from "react-icons/fi";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import styles from "./FinancialSetupChecklist.module.css";

const accountStep = ({ operableAccounts, owner }) => {
  const ready = operableAccounts.length > 0;
  return {
    key: "accounts",
    label: "Rekening",
    ready,
    detail: ready ? "Siap mencatat saldo dan transaksi" : owner ? "Tambahkan rekening yang akan dipakai" : "Ajukan rekening untuk dipakai setelah disetujui",
    to: ready ? null : "/rekening",
  };
};

const categoryStep = ({ categories, owner }) => {
  const hasIncome = categories.some((item) => item.transaction_type === "income");
  const hasExpense = categories.some((item) => item.transaction_type === "expense");
  const ready = hasIncome && hasExpense;
  let detail = "Pemasukan dan pengeluaran siap";
  if (!hasIncome && !hasExpense) detail = owner ? "Siapkan kategori pemasukan dan pengeluaran" : "Ajukan kategori yang masih dibutuhkan";
  else if (!hasIncome) detail = "Kategori pemasukan belum siap";
  else if (!hasExpense) detail = "Kategori pengeluaran belum siap";
  return { key: "categories", label: "Kategori", ready, detail, to: ready ? null : "/kategori" };
};

const setupState = ({ bootstrap, user }) => {
  const actor = bootstrap?.user || user || {};
  const accounts = (bootstrap?.accounts || []).filter((item) => item.status === "active");
  const operableAccounts = accounts.filter((item) => item.can_transact !== false && item.account_type !== "investment");
  const categories = (bootstrap?.categories || []).filter((item) => item.status === "active");
  const owner = actor.role === "owner";
  return [accountStep({ operableAccounts, owner }), categoryStep({ categories, owner })];
};

const SetupStep = ({ step, index }) => {
  const Icon = step.ready ? FiCheck : FiAlertCircle;
  const content = <><span className={styles.icon}><Icon aria-hidden="true" /></span><span><strong>{index + 1}. {step.label}</strong><small>{step.detail}</small></span></>;
  const className = [styles.step, step.ready ? styles.ready : styles.attention].filter(Boolean).join(" ");
  return step.to && !step.ready ? <Link className={className} to={step.to} state={{ setupFlow: true }}>{content}</Link> : <div className={className}>{content}</div>;
};

const FinancialSetupChecklist = ({ bootstrap, user }) => {
  const steps = setupState({ bootstrap, user });
  if (steps.every((step) => step.ready)) return null;
  const completed = steps.filter((step) => step.ready).length;
  return <Card className={styles.card} aria-labelledby="financial-setup-title">
    <details className={styles.details} defaultOpen={completed === 0}>
      <summary className={styles.summary}><span><strong id="financial-setup-title">Penyiapan awal · {completed}/{steps.length} selesai</strong><small>{completed === 0 ? "Siapkan dasar pencatatan" : "Sedikit lagi siap mencatat transaksi"}</small></span><span aria-hidden="true">›</span></summary>
      <div className={styles.expanded}><p>Rekening dan kategori cukup untuk mulai mencatat. Alokasi Dana, Jadwal Rutin, dan Target dapat ditambahkan kapan saja saat dibutuhkan.</p><div className={styles.steps}>{steps.map((step, index) => <SetupStep key={step.key} step={step} index={index} />)}</div></div>
    </details>
  </Card>;
};

export default FinancialSetupChecklist;
