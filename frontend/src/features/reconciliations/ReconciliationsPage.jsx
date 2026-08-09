import { useMemo, useState } from "react";
import { FiCheckCircle, FiInfo, FiRefreshCw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { parseRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { createReconciliation } from "./reconciliations.api.js";
import styles from "./ReconciliationsPage.module.css";

const INITIAL_FORM = Object.freeze({ account_id: "", actual_balance: "", notes: "Cocokkan dengan mutasi bank atau uang tunai." });
const EMPTY_ACCOUNTS = Object.freeze([]);

const formatReconciledAt = (value) => {
  if (!value) return "Waktu tidak tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(date);
};

const parseActualBalance = (value, allowNegative) => {
  const raw = String(value || "").trim();
  const negative = raw.startsWith("-");
  let amount = parseRupiah(negative ? raw.slice(1) : raw);
  if (negative) amount *= -1;
  if (amount < 0 && !allowNegative) throw new RangeError("Saldo aktual rekening ini tidak boleh negatif.");
  return amount;
};

const ReconciliationBalanceField = ({ selectedAccount, form, setForm, setSubmitState }) => {
  const change = (actual_balance) => { setForm((current) => ({ ...current, actual_balance })); setSubmitState({ status: "idle", error: null }); };
  if (!selectedAccount?.allow_negative) return <MoneyInput id="reconciliation-actual-balance" label="Saldo aktual" required value={form.actual_balance} onChange={change} />;
  return <label className="field" htmlFor="reconciliation-actual-balance"><span>Saldo aktual *</span><input id="reconciliation-actual-balance" inputMode="numeric" required value={form.actual_balance} onChange={(event) => change(event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, ""))} aria-describedby="reconciliation-negative-help" /><small id="reconciliation-negative-help">Rekening ini mengizinkan saldo negatif; gunakan tanda minus bila diperlukan.</small></label>;
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, onSubmit }) => (
  <form className="form-grid" onSubmit={onSubmit} noValidate>
    <label className="field form-grid__full" htmlFor="reconciliation-account"><span>Rekening *</span><select id="reconciliation-account" required value={form.account_id} onChange={(event) => { setForm((current) => ({ ...current, account_id: event.target.value, actual_balance: "" })); setSubmitState({ status: "idle", error: null }); }}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label>
    <ReconciliationBalanceField selectedAccount={selectedAccount} form={form} setForm={setForm} setSubmitState={setSubmitState} />
    <div className={styles.systemBalance} aria-live="polite"><span>Saldo sistem saat halaman dimuat</span><strong>{selectedAccount ? <Money value={selectedAccount.balance || 0} /> : "Pilih rekening"}</strong></div>
    <label className="field form-grid__full" htmlFor="reconciliation-notes"><span>Catatan</span><textarea id="reconciliation-notes" rows="3" maxLength="250" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
    <div className={`notice notice--info form-grid__full ${styles.guardNotice}`}><FiInfo aria-hidden="true" /><span>Selisih hanya dicatat untuk audit. Sistem tidak membuat transaksi penyesuaian secara otomatis.</span></div>
    {submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{submitState.error.message}</div> : null}
    <div className={`form-grid__full ${styles.formActions}`}><Button variant="primary" icon={FiCheckCircle} type="submit" loading={submitState.status === "submitting"}>Simpan rekonsiliasi</Button></div>
  </form>
);

const ReconciliationInputPanel = (props) => <div className={styles.layout}><Card className={`panel ${styles.formPanel}`}><div className="panel__header"><div><p className="eyebrow">Pencocokan saldo</p><h2>Catat saldo aktual</h2></div><FiRefreshCw aria-hidden="true" /></div>{props.accounts.length ? <ReconciliationForm {...props} /> : <div className={styles.emptyAction}><strong>Tidak ada rekening yang dapat direkonsiliasi</strong><p>Capability rekening ditentukan oleh backend berdasarkan pemilik dan peran pengguna.</p></div>}</Card><Card className={`panel ${styles.guidePanel}`}><div className="panel__header"><div><p className="eyebrow">Panduan aman</p><h2>Sebelum menyimpan</h2></div></div><ol><li>Buka mutasi bank atau hitung uang tunai terbaru.</li><li>Masukkan saldo aktual, bukan saldo sistem yang sudah tampil.</li><li>Jika ada selisih, cari transaksi tertinggal atau transaksi ganda.</li><li>Buat penyesuaian hanya melalui transaksi beralasan setelah pemeriksaan.</li></ol></Card></div>;

const HistoryTable = ({ items, accountLookup }) => <><div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.reconciliation_id}><td>{formatReconciledAt(item.reconciled_at)}</td><td>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div><div className="mobile-data-list reconciliation-mobile-list" aria-label="Riwayat rekonsiliasi">{items.map((item) => <article className="mobile-data-card reconciliation-mobile-card" key={item.reconciliation_id}><div className="reconciliation-mobile-card__header"><div><strong>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</strong><small>{formatReconciledAt(item.reconciled_at)}</small></div><StatusBadge status={item.status} /></div><dl><div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div><div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div><div><dt>Selisih</dt><dd><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></dd></div></dl></article>)}</div></>;

const ReconciliationHistory = ({ accounts, items, accountLookup, historyAccountId, setHistoryAccountId }) => <Card className={`panel ${styles.historyPanel}`}><div className={`panel__header ${styles.historyHeader}`}><div><p className="eyebrow">Riwayat rekonsiliasi</p><h2>Saldo sistem dan saldo aktual</h2></div><label className="field field--compact"><span className="sr-only">Filter riwayat berdasarkan rekening</span><select value={historyAccountId} onChange={(event) => setHistoryAccountId(event.target.value)} aria-label="Filter riwayat rekonsiliasi berdasarkan rekening"><option value="all">Semua rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label></div>{items.length ? <HistoryTable items={items} accountLookup={accountLookup} /> : <p className="empty-inline-message">Belum ada rekonsiliasi untuk filter ini.</p>}</Card>;

const useReconciliationData = () => {
  const accountsResource = useApiResource("accounts.list");
  const historyResource = useApiResource("reconciliations.list", { limit: 100 });
  const [historyAccountId, setHistoryAccountId] = useState("all");
  const accounts = Array.isArray(accountsResource.data?.items) ? accountsResource.data.items : EMPTY_ACCOUNTS;
  const reconcilableAccounts = useMemo(() => accounts.filter((account) => account.status === "active" && account.can_reconcile === true), [accounts]);
  const accountLookup = useMemo(() => Object.fromEntries(accounts.map((account) => [account.account_id, accountDisplayLabel(account)])), [accounts]);
  const historyItems = (historyResource.data?.items || []).filter((item) => historyAccountId === "all" || item.account_id === historyAccountId);
  return { accountsResource, historyResource, historyAccountId, setHistoryAccountId, accounts, reconcilableAccounts, accountLookup, historyItems };
};

const ReconciliationsPage = () => {
  const { refreshAll, invalidate } = useFinance();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [message, setMessage] = useState(null);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const submitReconciliation = async (event) => {
    event.preventDefault(); setMessage(null);
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat direkonsiliasi.") }); return; }
    let actualBalance;
    try { actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative); } catch (error) { setSubmitState({ status: "error", error }); return; }
    setSubmitState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({ account_id: selectedAccount.account_id, actual_balance: actualBalance, notes: form.notes }, {});
      setForm((current) => ({ ...current, actual_balance: "" })); setSubmitState({ status: "idle", error: null });
      setMessage({ type: result.difference === 0 ? "success" : "warning", text: result.difference === 0 ? "Saldo cocok dan rekonsiliasi telah dicatat oleh server." : "Rekonsiliasi tercatat dengan selisih. Periksa transaksi yang tertinggal sebelum membuat penyesuaian beralasan." });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]); await Promise.allSettled([data.historyResource.reload(), refreshAll()]);
    } catch (error) { setSubmitState({ status: "error", error }); }
  };
  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <LoadingScreen label="Memuat rekonsiliasi..." />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;
  return <div className={`page-stack ${styles.page}`}><RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} /><RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} /><PageHeader title="Rekonsiliasi" description="Cocokkan saldo aplikasi dengan saldo bank atau uang tunai tanpa mengubah saldo secara otomatis." />{message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}<ReconciliationInputPanel accounts={data.reconcilableAccounts} selectedAccount={selectedAccount} form={form} setForm={setForm} submitState={submitState} setSubmitState={setSubmitState} onSubmit={submitReconciliation} /><ReconciliationHistory accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} /></div>;
};

export default ReconciliationsPage;
