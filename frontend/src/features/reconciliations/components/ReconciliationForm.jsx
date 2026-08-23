import { useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiCreditCard, FiEdit3, FiRefreshCw, FiShield } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Card from "../../../components/common/Card.jsx";
import CompactNotice from "../../../components/common/CompactNotice.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import StatusBadge from "../../../components/common/StatusBadge.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { ReconciliationSubmitProgress } from "./ReconciliationFeedback.jsx";
import styles from "../ReconciliationsPage.module.css";

const ReconciliationBalanceEditor = ({ selectedAccount, form, setForm, setSubmitState, setActualBalanceEdited, disabled, getDifferencePreview, parseActualBalance }) => {
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

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, setActualBalanceEdited, onSubmit, preview, accountSystemBalance, getDifferencePreview, parseActualBalance }) => {
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
        getDifferencePreview={getDifferencePreview}
        parseActualBalance={parseActualBalance}
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


export { ReconciliationForm };
export default ReconciliationInputPanel;
