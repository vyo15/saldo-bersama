import { FiCheck, FiCircle, FiLock } from "react-icons/fi";
import { Link } from "react-router";
import Card from "../../components/common/Card.jsx";
import styles from "./FinancialSetupChecklist.module.css";

const setupState = ({ bootstrap, overview, user }) => {
  const accounts = (bootstrap?.accounts || []).filter((item) => item.status === "active");
  const sharedAccounts = accounts.filter((item) => item.owner_scope === "shared");
  const categories = (bootstrap?.categories || []).filter((item) => item.status === "active");
  const envelopes = (overview?.envelopes || []).filter((item) => item.status === "active");
  const goals = (overview?.goals || []).filter((item) => item.status === "active");
  const owner = user?.role === "owner";
  return [
    { key: "accounts", label: "Rekening", ready: owner ? accounts.length > 0 : sharedAccounts.length > 0, to: owner ? "/rekening" : null, blocked: !owner, blockedText: "Administrator menyiapkan rekening Bersama" },
    { key: "categories", label: "Kategori", ready: categories.length > 0, to: owner ? "/kategori" : null, blocked: !owner, blockedText: "Administrator menyiapkan kategori" },
    { key: "envelopes", label: "Kantong", ready: envelopes.some((item) => owner || item.scope === "shared"), to: sharedAccounts.length || owner ? "/perencanaan/kantong" : null, blocked: !owner && sharedAccounts.length === 0, blockedText: "Butuh rekening Bersama aktif" },
    { key: "goals", label: "Target", ready: goals.some((item) => owner || item.scope === "shared"), to: sharedAccounts.length || owner ? "/target" : null, blocked: !owner && sharedAccounts.length === 0, blockedText: "Butuh rekening Bersama aktif" },
  ];
};

const SetupStep = ({ step, index }) => {
  const Icon = step.ready ? FiCheck : step.blocked ? FiLock : FiCircle;
  const content = <><span className={styles.icon}><Icon aria-hidden="true" /></span><span><strong>{index + 1}. {step.label}</strong><small>{step.ready ? "Siap" : step.blocked ? step.blockedText : "Belum disiapkan"}</small></span></>;
  return step.to && !step.ready ? <Link className={styles.step} to={step.to}>{content}</Link> : <div className={`${styles.step}${step.ready ? ` ${styles.ready}` : ""}`}>{content}</div>;
};

const FinancialSetupChecklist = ({ bootstrap, overview, user }) => {
  const steps = setupState({ bootstrap, overview, user });
  if (steps.every((step) => step.ready)) return null;
  const completed = steps.filter((step) => step.ready).length;
  return <Card className={styles.card} aria-labelledby="financial-setup-title">
    <div className={styles.heading}><div><span>Penyiapan awal</span><h2 id="financial-setup-title">Siapkan alur keuangan</h2><p>Selesaikan urutan ini agar transaksi, Kantong, dan Target saling terhubung.</p></div><strong>{completed}/{steps.length}</strong></div>
    <div className={styles.steps}>{steps.map((step, index) => <SetupStep key={step.key} step={step} index={index} />)}</div>
  </Card>;
};

export default FinancialSetupChecklist;
