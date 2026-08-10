import { useMemo, useState } from "react";
import { FiCheckCircle, FiChevronRight, FiCreditCard, FiDatabase, FiInfo, FiRefreshCw, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
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

const getDifferencePreview = (selectedAccount, actualBalance) => {
  if (!selectedAccount || actualBalance === "" || actualBalance === null || actualBalance === undefined) return null;
  try {
    const actual = parseActualBalance(actualBalance, selectedAccount.allow_negative);
    const system = Number(selectedAccount.balance || 0);
    if (!Number.isFinite(system)) return null;
    return { system, actual, difference: actual - system };
  } catch {
    return null;
  }
};

const ReconciliationBalanceField = ({ selectedAccount, form, setForm, setSubmitState }) => {
  const change = (actual_balance) => {
    setForm((current) => ({ ...current, actual_balance }));
    setSubmitState({ status: "idle", error: null });
  };
  if (!selectedAccount?.allow_negative) {
    return (
      <div className={styles.balanceField}>
        <MoneyInput id="reconciliation-actual-balance" label="Saldo aktual" required value={form.actual_balance} onChange={change} />
      </div>
    );
  }
  return (
    <label className={`field ${styles.balanceField}`} htmlFor="reconciliation-actual-balance">
      <span>Saldo aktual *</span>
      <input
        id="reconciliation-actual-balance"
        inputMode="numeric"
        required
        value={form.actual_balance}
        onChange={(event) => change(event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, ""))}
        aria-describedby="reconciliation-negative-help"
      />
      <small id="reconciliation-negative-help">Rekening ini mengizinkan saldo negatif; gunakan tanda minus bila diperlukan.</small>
    </label>
  );
};

const ReconciliationSummary = ({ selectedAccount, preview }) => {
  const differenceState = !selectedAccount
    ? "Pilih rekening"
    : !preview
      ? "Menunggu saldo aktual"
      : preview.difference === 0
        ? "Saldo cocok"
        : "Perlu diperiksa";
  const differenceTone = !preview ? "idle" : preview.difference === 0 ? "matched" : "difference";

  return (
    <div className={styles.comparisonSummary} aria-live="polite">
      <div className={styles.summaryItem}>
        <span className={styles.summaryIcon}><FiDatabase aria-hidden="true" /></span>
        <span>
          <small>Saldo sistem</small>
          <strong>{selectedAccount ? <Money value={Number(selectedAccount.balance || 0)} /> : "Pilih rekening"}</strong>
        </span>
      </div>
      <span className={styles.summaryDivider} aria-hidden="true" />
      <div className={styles.summaryItem} data-state={differenceTone}>
        <span className={styles.summaryIcon}><FiRefreshCw aria-hidden="true" /></span>
        <span>
          <small>Selisih</small>
          <strong>{preview ? <Money value={preview.difference} /> : <Money value={0} />}</strong>
          <em>{differenceState}</em>
        </span>
      </div>
    </div>
  );
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, onSubmit, preview }) => (
  <form className={`form-grid ${styles.form}`} onSubmit={onSubmit} noValidate>
    <label className={`field form-grid__full ${styles.accountField}`} htmlFor="reconciliation-account">
      <span>Rekening *</span>
      <span className={styles.selectShell}>
        <span className={styles.selectIcon}><FiCreditCard aria-hidden="true" /></span>
        <select
          id="reconciliation-account"
          required
          value={form.account_id}
          onChange={(event) => {
            setForm((current) => ({ ...current, account_id: event.target.value, actual_balance: "" }));
            setSubmitState({ status: "idle", error: null });
          }}
        >
          <option value="">Pilih rekening</option>
          {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}
        </select>
      </span>
    </label>

    <ReconciliationBalanceField selectedAccount={selectedAccount} form={form} setForm={setForm} setSubmitState={setSubmitState} />

    <div className={styles.systemBalance} aria-live="polite">
      <span className={styles.systemBalanceIcon}><FiDatabase aria-hidden="true" /></span>
      <span className={styles.systemBalanceCopy}>
        <small>Saldo sistem saat halaman dimuat</small>
        <strong>{selectedAccount ? <Money value={selectedAccount.balance || 0} /> : "Pilih rekening"}</strong>
      </span>
      {selectedAccount ? <span className={styles.snapshotBadge}>Tercatat</span> : null}
    </div>

    <div className={`form-grid__full ${styles.summaryFull}`}><ReconciliationSummary selectedAccount={selectedAccount} preview={preview} /></div>

    <label className={`field form-grid__full ${styles.notesField}`} htmlFor="reconciliation-notes">
      <span className={styles.notesLabel}><span>Catatan</span><small>{form.notes.length}/250</small></span>
      <textarea
        id="reconciliation-notes"
        rows="3"
        maxLength="250"
        value={form.notes}
        placeholder="Contoh: cocokkan dengan mutasi bank atau uang tunai"
        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
      />
    </label>

    <div className={`notice notice--info form-grid__full ${styles.guardNotice}`}>
      <FiShield aria-hidden="true" />
      <span>
        <strong>Bukan untuk menambah saldo.</strong> Sistem tidak membuat transaksi penyesuaian secara otomatis. Gaji atau uang masuk dicatat melalui Transaksi → Pemasukan → pilih rekening tujuan.
      </span>
    </div>

    {submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{submitState.error.message}</div> : null}
    <div className={`form-grid__full ${styles.formActions}`}>
      <Button
        variant="primary"
        icon={FiCheckCircle}
        type="submit"
        loading={submitState.status === "submitting"}
        disabled={!selectedAccount || form.actual_balance === ""}
      >
        Simpan Pencocokan
      </Button>
    </div>
  </form>
);

const ReconciliationInputPanel = ({ onRefreshAccounts, accountsRefreshing, ...props }) => (
  <div className={styles.layout}>
    <Card className={`panel ${styles.formPanel}`}>
      <span className={styles.cardAccent} aria-hidden="true" />
      <div className={`panel__header ${styles.formHeader}`}>
        <div>
          <p className={`eyebrow ${styles.eyebrowPill}`}><span aria-hidden="true" />Pencocokan saldo</p>
          <h2>Catat saldo aktual</h2>
          <p>Pilih rekening lalu masukkan saldo yang benar-benar terlihat sekarang.</p>
        </div>
        <button
          className={styles.refreshButton}
          type="button"
          onClick={onRefreshAccounts}
          disabled={accountsRefreshing}
          aria-label="Muat ulang saldo sistem"
          aria-busy={accountsRefreshing || undefined}
          title="Rekonsiliasi"
        >
          <FiRefreshCw aria-hidden="true" />
        </button>
      </div>
      <details className={styles.helpDetails}>
        <summary><FiInfo aria-hidden="true" /><span>Apa itu pencocokan saldo?</span><FiChevronRight className={styles.helpChevron} aria-hidden="true" /></summary>
        <p>Pencocokan hanya membandingkan saldo aplikasi dengan saldo aktual. Jika berbeda, periksa transaksi yang tertinggal atau ganda sebelum membuat koreksi.</p>
      </details>
      {props.accounts.length
        ? <ReconciliationForm {...props} />
        : <div className={styles.emptyAction}><strong>Tidak ada rekening yang dapat direkonsiliasi</strong><p>Capability rekening ditentukan oleh backend berdasarkan pemilik dan peran pengguna.</p></div>}
    </Card>

    <Card className={`panel ${styles.guidePanel}`}>
      <div className="panel__header"><div><p className="eyebrow">Panduan aman</p><h2>Sebelum menyimpan</h2></div></div>
      <div className={styles.guideLead}><FiShield aria-hidden="true" /><span><strong>Aman &amp; akurat</strong><small>Pencocokan membantu mendeteksi selisih tanpa mengubah saldo otomatis.</small></span></div>
      <ol>
        <li>Buka mutasi bank atau hitung uang tunai terbaru.</li>
        <li>Masukkan saldo aktual, bukan saldo sistem yang sudah tampil.</li>
        <li>Jika ada selisih, cari transaksi tertinggal atau transaksi ganda.</li>
        <li>Buat penyesuaian hanya melalui transaksi beralasan setelah pemeriksaan.</li>
      </ol>
    </Card>
  </div>
);

const HistoryTable = ({ items, accountLookup }) => <><div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.reconciliation_id}><td>{formatReconciledAt(item.reconciled_at)}</td><td>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div><div className="mobile-data-list reconciliation-mobile-list" aria-label="Riwayat pencocokan saldo">{items.map((item) => <article className="mobile-data-card reconciliation-mobile-card" key={item.reconciliation_id}><div className="reconciliation-mobile-card__header"><div><strong>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</strong><small>{formatReconciledAt(item.reconciled_at)}</small></div><StatusBadge status={item.status} /></div><dl><div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div><div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div><div><dt>Selisih</dt><dd><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></dd></div></dl></article>)}</div></>;

const ReconciliationHistory = ({ accounts, items, accountLookup, historyAccountId, setHistoryAccountId }) => <Card className={`panel ${styles.historyPanel}`}><div className={`panel__header ${styles.historyHeader}`}><div><p className="eyebrow">Riwayat pencocokan</p><h2>Saldo aplikasi dan saldo aktual</h2></div><label className="field field--compact"><span className="sr-only">Filter riwayat berdasarkan rekening</span><select value={historyAccountId} onChange={(event) => setHistoryAccountId(event.target.value)} aria-label="Filter riwayat rekonsiliasi berdasarkan rekening"><option value="all">Semua rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select></label></div>{items.length ? <HistoryTable items={items} accountLookup={accountLookup} /> : <p className="empty-inline-message">Belum ada hasil pencocokan untuk filter ini.</p>}</Card>;

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
  const { notify } = useFeedback();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [message, setMessage] = useState(null);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const preview = useMemo(() => getDifferencePreview(selectedAccount, form.actual_balance), [selectedAccount, form.actual_balance]);
  const submitReconciliation = async (event) => {
    event.preventDefault(); setMessage(null);
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat direkonsiliasi.") }); return; }
    let actualBalance;
    try { actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative); } catch (error) { setSubmitState({ status: "error", error }); return; }
    setSubmitState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({ account_id: selectedAccount.account_id, actual_balance: actualBalance, notes: form.notes }, {});
      setForm((current) => ({ ...current, actual_balance: "" })); setSubmitState({ status: "idle", error: null });
      const difference = Number(result.difference || 0);
      if (difference === 0) {
        setMessage(null);
        notify({ message: "Rekonsiliasi tersimpan. Saldo sistem dan saldo aktual cocok.", tone: "success", dedupeKey: "reconciliation:matched" });
      } else {
        const differenceLabel = `Rp ${Math.abs(difference).toLocaleString("id-ID")}`;
        setMessage({ type: "warning", text: `Rekonsiliasi tersimpan dengan selisih ${differenceLabel}. Periksa transaksi tertinggal sebelum membuat penyesuaian.` });
        notify({ message: `Rekonsiliasi tersimpan dengan selisih ${differenceLabel}.`, tone: "warning", dedupeKey: "reconciliation:difference" });
      }
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]); await Promise.allSettled([data.historyResource.reload(), refreshAll()]);
    } catch (error) { setSubmitState({ status: "error", error }); }
  };
  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <LoadingScreen label="Memuat pencocokan saldo..." />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;
  return <div className={`page-stack ${styles.page}`}><RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} /><RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} /><PageHeader title="Cocokkan Saldo" description="Periksa apakah saldo aplikasi sama dengan saldo bank, e-wallet, atau uang tunai. Fitur ini tidak menambah saldo." />{message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}<ReconciliationInputPanel accounts={data.reconcilableAccounts} selectedAccount={selectedAccount} form={form} setForm={setForm} submitState={submitState} setSubmitState={setSubmitState} onSubmit={submitReconciliation} preview={preview} onRefreshAccounts={data.accountsResource.reload} accountsRefreshing={data.accountsResource.isRefreshing} /><ReconciliationHistory accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} /></div>;
};

export default ReconciliationsPage;
