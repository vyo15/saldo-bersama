import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiChevronDown, FiCreditCard, FiRefreshCw, FiShield } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { ReconciliationSubmitProgress } from "./ReconciliationFeedback.jsx";
import styles from "../ReconciliationsPage.module.css";

const AccountPicker = ({ accounts, selectedAccount, disabled, onSelect }) => {
  const [open, setOpen] = useState(!selectedAccount);
  return (
    <section className={styles.accountChooser} aria-labelledby="reconciliation-account-heading">
      <button type="button" className={styles.accountSummary} disabled={disabled} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls="reconciliation-account-options">
        <span className={styles.accountSummaryIcon}><FiCreditCard aria-hidden="true" /></span>
        <span className={styles.accountSummaryCopy}>
          <small id="reconciliation-account-heading">Rekening</small>
          <strong>{selectedAccount ? accountDisplayLabel(selectedAccount) : "Pilih rekening"}</strong>
        </span>
        <FiChevronDown className={styles.accountSummaryChevron} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.accountOptions} id="reconciliation-account-options">
          {accounts.map((account) => (
            <button
              key={account.account_id}
              type="button"
              className={styles.accountOption}
              aria-pressed={selectedAccount?.account_id === account.account_id}
              onClick={() => { onSelect(account); setOpen(false); }}
              disabled={disabled}
            >
              <span><strong>{accountDisplayLabel(account)}</strong><small>Saldo sistem <Money value={account.balance || 0} /></small></span>
              {selectedAccount?.account_id === account.account_id ? <FiCheckCircle aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const SystemBalance = ({ selectedAccount, accountSystemBalance }) => {
  if (!selectedAccount) return null;
  return (
    <section className={styles.systemBalanceCard} aria-label="Saldo tercatat di aplikasi">
      <span>Saldo tercatat di aplikasi</span>
      <strong><Money value={accountSystemBalance(selectedAccount)} /></strong>
      <small>Angka ini berasal dari transaksi yang sudah Anda catat di Saldo Bersama.</small>
    </section>
  );
};

const DifferencePreview = ({ preview }) => {
  if (!preview) return null;
  const matched = preview.difference === 0;
  return (
    <section className={styles.differencePreview} data-state={matched ? "matched" : "difference"} aria-live="polite">
      <div className={styles.differencePreviewTitle}>
        {matched ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
        <strong>{matched ? "Saldo ternyata sama" : `Ada selisih Rp ${Math.abs(preview.difference).toLocaleString("id-ID")}`}</strong>
      </div>
      <dl>
        <div><dt>Saldo aplikasi</dt><dd><Money value={preview.system} /></dd></div>
        <div><dt>Saldo di bank</dt><dd><Money value={preview.actual} /></dd></div>
        <div><dt>Selisih</dt><dd><Money value={preview.difference} tone={matched ? "positive" : "negative"} /></dd></div>
      </dl>
    </section>
  );
};

const ActualBalanceField = ({ selectedAccount, form, setForm, setSubmitState, disabled }) => {
  if (!selectedAccount) return null;
  if (!selectedAccount.allow_negative) {
    return <MoneyInput id="reconciliation-actual-balance" label="Saldo sebenarnya di bank" required disabled={disabled} value={form.actual_balance} onChange={(value) => { setForm((current) => ({ ...current, actual_balance: value })); setSubmitState({ status: "idle", error: null }); }} />;
  }
  return (
    <label className="field" htmlFor="reconciliation-actual-balance">
      <span>Saldo sebenarnya di bank *</span>
      <input id="reconciliation-actual-balance" inputMode="numeric" required disabled={disabled} value={form.actual_balance} onChange={(event) => { setForm((current) => ({ ...current, actual_balance: event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "") })); setSubmitState({ status: "idle", error: null }); }} aria-describedby="reconciliation-negative-help" />
      <small id="reconciliation-negative-help">Rekening ini mengizinkan saldo negatif; gunakan tanda minus bila diperlukan.</small>
    </label>
  );
};

const DifferentBalanceFlow = ({ selectedAccount, form, setForm, submitState, setSubmitState, onSubmit, preview }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  const progressing = ["submitting", "syncing"].includes(submitState.status);
  const busy = progressing || submitState.status === "completed";
  const buttonLabel = submitState.status === "completed" ? "Pencocokan tersimpan" : submitState.status === "syncing" ? "Memperbarui..." : submitState.status === "submitting" ? "Menyimpan..." : "Simpan pencocokan";
  return (
    <form className={styles.differenceFlow} onSubmit={onSubmit} noValidate>
      <ActualBalanceField selectedAccount={selectedAccount} form={form} setForm={setForm} setSubmitState={setSubmitState} disabled={busy} />
      <DifferencePreview preview={preview} />
      <button type="button" className={styles.notesToggle} onClick={() => setNotesOpen((current) => !current)} aria-expanded={notesOpen}>{notesOpen ? "Sembunyikan catatan" : "+ Tambahkan catatan"}</button>
      {notesOpen ? <label className={`field ${styles.notesField}`} htmlFor="reconciliation-notes"><span className={styles.notesLabel}><span>Catatan</span><small>{form.notes.length}/250</small></span><textarea id="reconciliation-notes" rows="2" maxLength="250" value={form.notes} disabled={busy} placeholder="Opsional" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label> : null}
      <div className={styles.guardLine}><FiShield aria-hidden="true" /><span>Pencocokan hanya menyimpan hasil perbandingan. <strong>Saldo tidak diubah otomatis.</strong></span></div>
      {submitState.error ? <div className="notice notice--danger" role="alert">{submitState.error.message}</div> : null}
      <Button variant="primary" icon={FiCheckCircle} type="submit" loading={progressing} disabled={busy || !selectedAccount || form.actual_balance === ""}>{buttonLabel}</Button>
      {progressing ? <ReconciliationSubmitProgress phase={submitState.status} /> : null}
    </form>
  );
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, onConfirmSystemBalance, onSubmitDifference, preview, accountSystemBalance }) => {
  const [different, setDifferent] = useState(false);
  const busy = ["submitting", "syncing", "completed"].includes(submitState.status);
  const selectAccount = (account) => {
    setDifferent(false);
    setForm({ account_id: account.account_id, actual_balance: "", notes: "" });
    setSubmitState({ status: "idle", error: null });
  };

  return (
    <div className={styles.form}>
      <AccountPicker accounts={accounts} selectedAccount={selectedAccount} disabled={busy} onSelect={selectAccount} />
      <SystemBalance selectedAccount={selectedAccount} accountSystemBalance={accountSystemBalance} />
      {selectedAccount && !different ? (
        <section className={styles.matchQuestion}>
          <h3>Apakah saldo di bank juga <Money value={accountSystemBalance(selectedAccount)} />?</h3>
          <p>Lihat saldo rekening Anda di bank atau uang tunai, lalu pilih sesuai kondisi sebenarnya.</p>
          <div className={styles.matchActions}>
            <Button variant="primary" icon={FiCheckCircle} type="button" loading={busy} disabled={busy} onClick={onConfirmSystemBalance}>Ya, saldonya sama</Button>
            <Button type="button" disabled={busy} onClick={() => { setForm((current) => ({ ...current, actual_balance: "", notes: "" })); setSubmitState({ status: "idle", error: null }); setDifferent(true); }}>Tidak, berbeda</Button>
          </div>
          {submitState.error ? <div className="notice notice--danger" role="alert">{submitState.error.message}</div> : null}
          {["submitting", "syncing"].includes(submitState.status) ? <ReconciliationSubmitProgress phase={submitState.status} /> : null}
        </section>
      ) : null}
      {selectedAccount && different ? <DifferentBalanceFlow selectedAccount={selectedAccount} form={form} setForm={setForm} submitState={submitState} setSubmitState={setSubmitState} onSubmit={onSubmitDifference} preview={preview} /> : null}
    </div>
  );
};

const ReconciliationInputPanel = ({ onRefreshAccounts, accountsRefreshing, selectedAccount, ...props }) => (
  <div className={styles.layout}>
    <Card className={`panel ${styles.formPanel}`}>
      <span className={styles.cardAccent} aria-hidden="true" />
      <div className={`panel__header ${styles.formHeader}`}>
        <div><h2>Cocokkan saldo</h2><p>Pastikan catatan aplikasi sama dengan saldo yang benar-benar Anda lihat.</p></div>
        <button className={styles.refreshButton} type="button" onClick={onRefreshAccounts} disabled={accountsRefreshing} aria-label="Muat ulang saldo sistem" aria-busy={accountsRefreshing || undefined} title="Muat ulang saldo sistem"><FiRefreshCw aria-hidden="true" /></button>
      </div>
      {props.accounts.length
        ? <ReconciliationForm key={selectedAccount?.account_id || "no-account"} selectedAccount={selectedAccount} {...props} />
        : <EmptyState className={styles.emptyAction} variant="inline" icon={FiCreditCard} title="Tidak ada rekening yang tersedia" description="Tambahkan atau aktifkan rekening yang mendukung pencocokan saldo terlebih dahulu." headingLevel={3} action={<Link className="button button--primary" to="/rekening">Lihat Rekening</Link>} />}
    </Card>
  </div>
);

export { ReconciliationForm };
export default ReconciliationInputPanel;
