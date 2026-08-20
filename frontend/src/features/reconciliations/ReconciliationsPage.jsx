import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FiAlertCircle, FiCheckCircle, FiCreditCard, FiDatabase, FiEdit3, FiRefreshCw, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta, formatDateTimeJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { createReconciliation } from "./reconciliations.api.js";
import styles from "./ReconciliationsPage.module.css";
import { ReconciliationResultOverlay, ReconciliationSubmitProgress } from "./components/ReconciliationFeedback.jsx";

const INITIAL_FORM = Object.freeze({ account_id: "", actual_balance: "", notes: "" });
const EMPTY_ACCOUNTS = Object.freeze([]);

const formatReconciledAt = (value) => formatDateTimeJakarta(value, { fallback: "Waktu tidak tersedia" });
const accountSystemBalance = (account) => {
  const balance = Number(account?.balance || 0);
  return Number.isSafeInteger(balance) ? balance : 0;
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
    const system = accountSystemBalance(selectedAccount);
    return { system, actual, difference: actual - system };
  } catch {
    return null;
  }
};

const ReconciliationBalanceEditor = ({ selectedAccount, form, setForm, setSubmitState, setActualBalanceEdited, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(form.actual_balance);
  const [error, setError] = useState("");
  const preview = getDifferencePreview(selectedAccount, form.actual_balance);

  if (!selectedAccount || !preview) return null;

  const matchesSystemBalance = preview.difference === 0;
  const beginEdit = () => {
    setDraft(form.actual_balance);
    setError("");
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(form.actual_balance);
    setError("");
    setEditing(false);
  };
  const applyEdit = () => {
    try {
      const actualBalance = parseActualBalance(draft, selectedAccount.allow_negative);
      setForm((current) => ({ ...current, actual_balance: actualBalance }));
      setActualBalanceEdited(true);
      setSubmitState({ status: "idle", error: null });
      setError("");
      setEditing(false);
    } catch (nextError) {
      setError(nextError.message);
    }
  };

  return (
    <section className={`form-grid__full ${styles.actualBalanceCard}`} aria-labelledby="reconciliation-actual-heading">
      <div className={styles.actualBalanceHeader}>
        <div className={styles.actualBalanceSummary}>
          <span className={styles.actualBalanceLabel} id="reconciliation-actual-heading">
            <span className={styles.actualBalanceDot} aria-hidden="true" />
            Saldo aktual rekening
          </span>
          <strong className={styles.actualBalanceValue}><Money value={preview.actual} /></strong>
        </div>
        <button
          className={styles.editBalanceButton}
          type="button"
          onClick={beginEdit}
          disabled={disabled || editing}
          aria-label="Edit saldo aktual"
          aria-expanded={editing}
          aria-controls="reconciliation-actual-editor"
          title="Edit saldo aktual"
        >
          <FiEdit3 aria-hidden="true" />
          <span className="sr-only">Edit saldo aktual</span>
        </button>
      </div>

      <div className={styles.actualBalanceMeta}>
        <span className={styles.actualBalanceState} data-state={matchesSystemBalance ? "matched" : "difference"}>
          {matchesSystemBalance ? <FiCheckCircle aria-hidden="true" /> : <FiAlertCircle aria-hidden="true" />}
          {matchesSystemBalance ? "Sama dengan saldo sistem" : "Berbeda dari saldo sistem"}
        </span>
        <span className={styles.actualBalanceSystem}>Sistem <Money value={preview.system} /></span>
      </div>

      {editing ? (
        <div className={styles.actualBalanceEditor} id="reconciliation-actual-editor">
          {!selectedAccount.allow_negative ? (
            <MoneyInput id="reconciliation-actual-balance" label="Ubah saldo aktual" required disabled={disabled} value={draft} onChange={setDraft} error={error} />
          ) : (
            <label className="field" htmlFor="reconciliation-actual-balance">
              <span>Ubah saldo aktual *</span>
              <input
                id="reconciliation-actual-balance"
                inputMode="numeric"
                required
                disabled={disabled}
                value={draft}
                onChange={(event) => { setDraft(event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "")); setError(""); }}
                aria-describedby="reconciliation-negative-help"
                aria-invalid={Boolean(error)}
              />
              <small id="reconciliation-negative-help">Rekening ini mengizinkan saldo negatif; gunakan tanda minus bila diperlukan.</small>
              {error ? <small className="field__error" role="alert">{error}</small> : null}
            </label>
          )}
          <div className={styles.editBalanceActions}>
            <Button type="button" onClick={cancelEdit} disabled={disabled}>Batal</Button>
            <Button variant="primary" type="button" onClick={applyEdit} disabled={disabled}>Terapkan</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

const ReconciliationSummary = ({ selectedAccount, preview }) => {
  if (!selectedAccount || !preview) return null;
  const matched = preview.difference === 0;
  return (
    <section className={styles.previewCard} aria-live="polite" aria-label="Preview pencocokan saldo">
      <div className={styles.previewHeader}>
        <h3>Preview Pencocokan</h3>
        <StatusBadge status={matched ? "matched" : "difference"} />
      </div>
      <dl className={styles.previewRows}>
        <div><dt>Saldo sistem</dt><dd><Money value={preview.system} /></dd></div>
        <div><dt>Saldo aktual</dt><dd><Money value={preview.actual} /></dd></div>
      </dl>
      <div className={styles.previewDifferenceBox} data-state={matched ? "matched" : "difference"}>
        <span>
          <small>Selisih</small>
          <strong>{matched ? "Tidak ada perbedaan" : "Perlu ditinjau kembali"}</strong>
        </span>
        <Money value={preview.difference} tone={matched ? "positive" : "negative"} />
      </div>
    </section>
  );
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, setActualBalanceEdited, onSubmit, preview }) => {
  const busy = submitState.status === "submitting" || submitState.status === "syncing";
  const buttonLabel = submitState.status === "syncing" ? "Memperbarui..." : submitState.status === "submitting" ? "Menyimpan..." : "Simpan Pencocokan";
  return (
    <form className={`form-grid ${styles.form}`} onSubmit={onSubmit} noValidate>
      <label className={`field form-grid__full ${styles.accountField}`} htmlFor="reconciliation-account">
        <span>Rekening *</span>
        <span className={styles.selectShell}>
          <span className={styles.selectIcon}><FiCreditCard aria-hidden="true" /></span>
          <select
            id="reconciliation-account"
            required
            disabled={busy}
            value={form.account_id}
            onChange={(event) => {
              const nextAccountId = event.target.value;
              const nextAccount = accounts.find((account) => account.account_id === nextAccountId) || null;
              setActualBalanceEdited(false);
              setForm((current) => ({ ...current, account_id: nextAccountId, actual_balance: nextAccount ? accountSystemBalance(nextAccount) : "" }));
              setSubmitState({ status: "idle", error: null });
            }}
          >
            <option value="">Pilih rekening</option>
            {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}
          </select>
        </span>
      </label>

      <ReconciliationBalanceEditor
        key={selectedAccount?.account_id || "no-account"}
        selectedAccount={selectedAccount}
        form={form}
        setForm={setForm}
        setSubmitState={setSubmitState}
        setActualBalanceEdited={setActualBalanceEdited}
        disabled={busy}
      />

      <label className={`field form-grid__full ${styles.notesField}`} htmlFor="reconciliation-notes">
        <span className={styles.notesLabel}><span>Catatan</span><small>{form.notes.length}/250</small></span>
        <textarea
          id="reconciliation-notes"
          rows="2"
          maxLength="250"
          value={form.notes}
          disabled={busy}
          placeholder="Opsional"
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>

      <div className={`form-grid__full ${styles.summaryFull}`}><ReconciliationSummary selectedAccount={selectedAccount} preview={preview} /></div>

      <CompactNotice tone="info" icon={FiShield} className={`form-grid__full ${styles.guardNotice}`}>Tidak mengubah saldo secara otomatis.</CompactNotice>

      {submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{submitState.error.message}</div> : null}
      <div className={`form-grid__full ${styles.formActions}`}>
        <Button
          variant="primary"
          icon={FiCheckCircle}
          type="submit"
          loading={busy}
          disabled={busy || !selectedAccount || form.actual_balance === ""}
        >
          {buttonLabel}
        </Button>
      </div>
      {busy ? <div className={`form-grid__full ${styles.progressFull}`}><ReconciliationSubmitProgress phase={submitState.status} /></div> : null}
    </form>
  );
};

const ReconciliationInputPanel = ({ onRefreshAccounts, accountsRefreshing, ...props }) => (
  <div className={styles.layout}>
    <Card className={`panel ${styles.formPanel}`}>
      <span className={styles.cardAccent} aria-hidden="true" />
      <div className={`panel__header ${styles.formHeader}`}>
        <h2>Catat saldo aktual</h2>
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
      {props.accounts.length
        ? <ReconciliationForm {...props} />
        : <EmptyState className={styles.emptyAction} variant="inline" icon={FiCreditCard} title="Tidak ada rekening yang tersedia" description="Tambahkan atau aktifkan rekening yang mendukung pencocokan saldo terlebih dahulu." headingLevel={3} />}
    </Card>
  </div>
);

const HistoryTable = ({ items, accountLookup }) => (
  <>
    <div className="data-table-wrap desktop-data-table">
      <table className="data-table">
        <thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.reconciliation_id}><td>{formatReconciledAt(item.reconciled_at)}</td><td>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody>
      </table>
    </div>
    <div className={`mobile-data-list reconciliation-mobile-list ${styles.mobileHistoryList}`} aria-label="Riwayat pencocokan saldo">
      {items.map((item) => {
        const matched = Number(item.difference || 0) === 0;
        return (
          <article className={`mobile-data-card reconciliation-mobile-card ${styles.mobileHistoryCard}`} key={item.reconciliation_id}>
            <div className={`reconciliation-mobile-card__header ${styles.mobileHistoryCardHeader}`}>
              <div><strong>{accountLookup[item.account_id] || item.account_name || "Rekening tidak tersedia"}</strong><small>{formatReconciledAt(item.reconciled_at)}</small></div>
              <StatusBadge status={item.status} />
            </div>
            <dl className={styles.mobileHistoryMetrics}>
              <div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div>
              <div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div>
            </dl>
            <div className={styles.mobileHistoryDifference} data-state={matched ? "matched" : "difference"}>
              <span><small>Selisih</small><strong>{matched ? "Tidak ada perbedaan" : "Perlu ditinjau kembali"}</strong></span>
              <Money value={item.difference} tone={matched ? "positive" : "negative"} />
            </div>
          </article>
        );
      })}
    </div>
  </>
);

const ReconciliationHistory = ({ accounts, items, accountLookup, historyAccountId, setHistoryAccountId }) => (
  <Card className={`panel ${styles.historyPanel}`}>
    <div className={`panel__header ${styles.historyHeader}`}>
      <h2>Riwayat</h2>
      <label className={styles.historyFilter}>
        <span className="sr-only">Filter riwayat berdasarkan rekening</span>
        <select value={historyAccountId} onChange={(event) => setHistoryAccountId(event.target.value)} aria-label="Filter riwayat rekonsiliasi berdasarkan rekening">
          <option value="all">Semua rekening</option>
          {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}
        </select>
      </label>
    </div>
    {items.length ? <HistoryTable items={items} accountLookup={accountLookup} /> : <EmptyState variant="inline" icon={FiDatabase} title="Belum ada hasil pencocokan" description="Belum ada riwayat rekonsiliasi untuk filter ini." headingLevel={3} />}
  </Card>
);

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
  const { attention, consumeAttention } = useDashboardAttentionState();
  const navigate = useNavigate();
  const attentionHandled = useRef(false);
  const { refreshAll, invalidate } = useFinance();
  const data = useReconciliationData();
  const [form, setForm] = useState(INITIAL_FORM);
  const [actualBalanceEdited, setActualBalanceEdited] = useState(false);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [message, setMessage] = useState(null);
  const [resultOverlay, setResultOverlay] = useState(null);
  const selectedAccount = data.reconcilableAccounts.find((account) => account.account_id === form.account_id) || null;
  const selectedAccountId = selectedAccount?.account_id || "";
  const selectedSystemBalance = selectedAccount ? accountSystemBalance(selectedAccount) : null;
  const preview = useMemo(() => getDifferencePreview(selectedAccount, form.actual_balance), [selectedAccount, form.actual_balance]);
  const attentionAccountId = String(attention?.accountId || "");

  useEffect(() => {
    if (!selectedAccountId || actualBalanceEdited || selectedSystemBalance === null) return;
    setForm((current) => current.account_id === selectedAccountId && current.actual_balance !== selectedSystemBalance
      ? { ...current, actual_balance: selectedSystemBalance }
      : current);
  }, [actualBalanceEdited, selectedAccountId, selectedSystemBalance]);

  useEffect(() => {
    if (attentionHandled.current || !attentionAccountId || data.accountsResource.status !== "ready") return;
    attentionHandled.current = true;
    const attentionAccount = data.reconcilableAccounts.find((account) => account.account_id === attentionAccountId) || null;
    if (!form.account_id && attentionAccount) {
      setActualBalanceEdited(false);
      setForm((current) => ({ ...current, account_id: attentionAccountId, actual_balance: accountSystemBalance(attentionAccount) }));
    }
    consumeAttention();
  }, [attentionAccountId, consumeAttention, data.accountsResource.status, data.reconcilableAccounts, form.account_id]);

  const submitReconciliation = async (event) => {
    event.preventDefault();
    if (["submitting", "syncing"].includes(submitState.status)) return;
    setMessage(null);
    if (!selectedAccount) { setSubmitState({ status: "error", error: new Error("Pilih rekening yang dapat direkonsiliasi.") }); return; }
    let actualBalance;
    try { actualBalance = parseActualBalance(form.actual_balance, selectedAccount.allow_negative); } catch (error) { setSubmitState({ status: "error", error }); return; }
    const accountLabel = accountDisplayLabel(selectedAccount);
    setSubmitState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({ account_id: selectedAccount.account_id, actual_balance: actualBalance, notes: form.notes }, {});
      const difference = Number(result.difference || 0);
      const matched = difference === 0;
      if (!matched) {
        const differenceLabel = `Rp ${Math.abs(difference).toLocaleString("id-ID")}`;
        setMessage({ type: "warning", text: `Pencocokan tersimpan dengan selisih ${differenceLabel}. Periksa transaksi tertinggal sebelum membuat penyesuaian.`, accountId: selectedAccount.account_id });
      }
      setActualBalanceEdited(false);
      setForm((current) => ({ ...current, actual_balance: Number(result.system_balance ?? selectedAccount.balance ?? 0), notes: "" }));
      setSubmitState({ status: "syncing", error: null });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]);
      const refreshOutcomes = await Promise.allSettled([data.historyResource.reload(), refreshAll()]);
      const refreshIncomplete = refreshOutcomes.some((outcome) => outcome.status === "rejected");
      setResultOverlay({
        matched,
        accountLabel,
        actualBalance: Number(result.actual_balance ?? actualBalance),
        systemBalance: Number(result.system_balance ?? selectedAccount.balance ?? 0),
        difference,
        refreshIncomplete,
      });
      setSubmitState({ status: "idle", error: null });
    } catch (error) {
      setSubmitState({ status: "error", error });
    }
  };

  if (data.accountsResource.status === "loading" || data.historyResource.status === "loading") return <LoadingScreen label="Memuat pencocokan saldo..." />;
  if (data.accountsResource.status === "error") return <ErrorState error={data.accountsResource.error} onRetry={data.accountsResource.reload} />;
  if (data.historyResource.status === "error") return <ErrorState error={data.historyResource.error} onRetry={data.historyResource.reload} />;
  const attentionFromDashboard = ["reconciliation_difference", "reconciliation_stale"].includes(attention?.attentionType);
  return (
    <div className={`page-stack ${styles.page}`}>
      <RefreshWarning error={data.accountsResource.refreshError} onRetry={data.accountsResource.reload} />
      <RefreshWarning error={data.historyResource.refreshError} onRetry={data.historyResource.reload} />
      <PageHeader title="Cocokkan Saldo" help="Bandingkan saldo rekening dengan catatan aplikasi." />
      {attentionFromDashboard ? <CompactNotice tone="info" title="Periksa saldo aktual." role="status">{selectedAccount?.account_id === attentionAccountId ? "Rekening sudah dipilih otomatis. Sistem membandingkan dengan saldo tercatat." : "Pilih rekening yang ingin diperiksa."}</CompactNotice> : null}
      {message ? <div className={`notice notice--${message.type}`} role="status"><span>{message.text}</span>{message.accountId ? <div className="form-actions"><Button type="button" onClick={() => navigate("/transaksi", { state: { accountId: message.accountId, period: currentMonthInJakarta() } })}>Lihat transaksi rekening</Button></div> : null}</div> : null}
      <ReconciliationInputPanel
        accounts={data.reconcilableAccounts}
        selectedAccount={selectedAccount}
        form={form}
        setForm={setForm}
        submitState={submitState}
        setSubmitState={setSubmitState}
        setActualBalanceEdited={setActualBalanceEdited}
        onSubmit={submitReconciliation}
        preview={preview}
        onRefreshAccounts={data.accountsResource.reload}
        accountsRefreshing={data.accountsResource.isRefreshing || ["submitting", "syncing"].includes(submitState.status)}
      />
      <ReconciliationHistory accounts={data.accounts} items={data.historyItems} accountLookup={data.accountLookup} historyAccountId={data.historyAccountId} setHistoryAccountId={data.setHistoryAccountId} />
      <ReconciliationResultOverlay result={resultOverlay} onClose={() => setResultOverlay(null)} />
    </div>
  );
};

export default ReconciliationsPage;
