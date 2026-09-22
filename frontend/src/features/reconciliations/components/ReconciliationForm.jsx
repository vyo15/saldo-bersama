import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiShield } from "react-icons/fi";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import Button from "../../../components/common/Button.jsx";
import ButtonLink from "../../../components/common/ButtonLink.jsx";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import InlineSelectionPicker from "../../../components/common/InlineSelectionPicker.jsx";
import { accountOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { formatRupiah } from "../../../domain/money.js";
import { ReconciliationSubmitProgress } from "./ReconciliationFeedback.jsx";
import styles from "../ReconciliationsPage.module.css";

const AccountPicker = ({ accounts, selectedAccount, disabled, onSelect }) => (
  <InlineSelectionPicker
    className={styles.accountChooser}
    label="Rekening"
    value={selectedAccount?.account_id || ""}
    onChange={(accountId) => {
      const account = accounts.find((item) => item.account_id === accountId);
      if (account) onSelect(account);
    }}
    disabled={disabled}
    placeholder="Pilih rekening"
    placeholderOption={{ icon: AccountIcon }}
    searchable={accounts.length > 8}
    searchPlaceholder="Cari rekening…"
    options={accounts.map((account) => ({
      value: account.account_id,
      label: accountDisplayLabel(account),
      meta: `Saldo tercatat ${formatRupiah(account.balance || 0)}`,
      ...accountOptionVisual(account),
    }))}
  />
);

const balanceCopy = (account) => {
  const accountType = account?.account_type;
  if (accountType === "bank") return { input: "Saldo di bank saat ini", hint: "Lihat saldo terbaru di bank lalu masukkan nominalnya di sini.", metric: "Saldo di bank" };
  if (accountType === "ewallet") return { input: "Saldo e-wallet saat ini", hint: "Lihat saldo terbaru di e-wallet lalu masukkan nominalnya di sini.", metric: "Saldo e-wallet" };
  if (accountType === "cash") return { input: "Uang tunai saat ini", hint: "Hitung uang tunai yang Anda pegang lalu masukkan nominalnya di sini.", metric: "Tunai aktual" };
  return { input: "Saldo aktual saat ini", hint: "Periksa saldo terbaru pada sumber aslinya lalu masukkan nominalnya di sini.", metric: "Saldo aktual" };
};

const ContextAccount = ({ account }) => {
  if (!account) return null;
  const visual = accountOptionVisual(account);
  const Icon = visual.icon || AccountIcon;
  return (
    <div className={styles.contextAccount} aria-label={`Rekening terpilih ${accountDisplayLabel(account)}`}>
      <span className={styles.contextAccountVisual}>{visual.image ? <img src={visual.image} alt="" width="38" height="38" decoding="async" /> : <Icon aria-hidden="true" />}</span>
      <span className={styles.contextAccountCopy}><strong>{accountDisplayLabel(account)}</strong><small>Rekening yang akan diperiksa</small></span>
      <span className={styles.contextAccountState}>Terpilih</span>
    </div>
  );
};

const SystemBalance = ({ selectedAccount, accountSystemBalance }) => {
  if (!selectedAccount) return null;
  return (
    <section className={styles.systemBalanceCard} aria-label="Saldo tercatat di aplikasi">
      <span>Saldo tercatat di aplikasi</span>
      <strong><Money value={accountSystemBalance(selectedAccount)} /></strong>
    </section>
  );
};

const DifferencePreview = ({ preview, selectedAccount }) => {
  if (!preview) return null;
  const matched = preview.difference === 0;
  const copy = balanceCopy(selectedAccount);
  return (
    <section className={styles.differencePreview} data-state={matched ? "matched" : "difference"} aria-live="polite">
      <div className={styles.differencePreviewTitle}>
        {matched ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
        <strong>{matched ? "Saldo sudah sesuai" : `Ada selisih Rp ${Math.abs(preview.difference).toLocaleString("id-ID")}`}</strong>
      </div>
      <dl>
        <div><dt>Saldo aplikasi</dt><dd><Money value={preview.system} /></dd></div>
        <div><dt>{copy.metric}</dt><dd><Money value={preview.actual} /></dd></div>
        <div><dt>Selisih</dt><dd><Money value={preview.difference} tone={matched ? "positive" : "negative"} /></dd></div>
      </dl>
    </section>
  );
};

const ActualBalanceField = ({ selectedAccount, form, setForm, setSubmitState, disabled }) => {
  if (!selectedAccount) return null;
  const copy = balanceCopy(selectedAccount);
  const handleChange = (value) => {
    setForm((current) => ({ ...current, actual_balance: value }));
    setSubmitState({ status: "idle", error: null });
  };
  if (!selectedAccount.allow_negative) {
    return <>
      <MoneyInput id="reconciliation-actual-balance" label={copy.input} required disabled={disabled} value={form.actual_balance} onChange={handleChange} />
      <small className={styles.balanceHint}>{copy.hint}</small>
    </>;
  }
  return (
    <label className="field" htmlFor="reconciliation-actual-balance">
      <span>{copy.input} *</span>
      <input id="reconciliation-actual-balance" inputMode="numeric" required disabled={disabled} value={form.actual_balance} onChange={(event) => handleChange(event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, ""))} aria-describedby="reconciliation-negative-help" />
      <small id="reconciliation-negative-help">Rekening ini mengizinkan saldo negatif; gunakan tanda minus bila diperlukan.</small>
    </label>
  );
};

const BalanceComparisonFlow = ({ selectedAccount, form, setForm, submitState, setSubmitState, onSubmit, preview }) => {
  const [notesOpen, setNotesOpen] = useState(false);
  const progressing = ["submitting", "syncing"].includes(submitState.status);
  const busy = progressing || submitState.status === "completed";
  const buttonLabel = submitState.status === "completed" ? "Pemeriksaan tersimpan" : submitState.status === "syncing" ? "Memperbarui..." : submitState.status === "submitting" ? "Membandingkan..." : "Bandingkan saldo";
  return (
    <form className={styles.differenceFlow} onSubmit={onSubmit} noValidate>
      <ActualBalanceField selectedAccount={selectedAccount} form={form} setForm={setForm} setSubmitState={setSubmitState} disabled={busy} />
      <DifferencePreview preview={preview} selectedAccount={selectedAccount} />
      <button type="button" className={styles.notesToggle} onClick={() => setNotesOpen((current) => !current)} aria-expanded={notesOpen}>{notesOpen ? "Sembunyikan catatan" : "+ Tambahkan catatan"}</button>
      {notesOpen ? <label className={`field ${styles.notesField}`} htmlFor="reconciliation-notes"><span className={styles.notesLabel}><span>Catatan</span><small>{form.notes.length}/250</small></span><textarea id="reconciliation-notes" rows="2" maxLength="250" value={form.notes} disabled={busy} placeholder="Opsional" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label> : null}
      <div className={styles.guardLine}><FiShield aria-hidden="true" /><span>Pemeriksaan hanya membandingkan angka. <strong>Saldo tidak diubah otomatis.</strong></span></div>
      {submitState.error ? <div className="notice notice--danger" role="alert">{submitState.error.message}</div> : null}
      <Button variant="primary" icon={FiCheckCircle} type="submit" loading={progressing} disabled={busy || !selectedAccount || form.actual_balance === ""}>{buttonLabel}</Button>
      {progressing ? <ReconciliationSubmitProgress phase={submitState.status} /> : null}
    </form>
  );
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, onSubmitDifference, preview, accountSystemBalance, contextLocked = false }) => {
  const busy = ["submitting", "syncing", "completed"].includes(submitState.status);
  const selectAccount = (account) => {
    setForm({ account_id: account.account_id, actual_balance: "", notes: "" });
    setSubmitState({ status: "idle", error: null });
  };

  return (
    <div className={styles.form}>
      {contextLocked && selectedAccount ? <ContextAccount account={selectedAccount} /> : <AccountPicker accounts={accounts} selectedAccount={selectedAccount} disabled={busy} onSelect={selectAccount} />}
      <SystemBalance selectedAccount={selectedAccount} accountSystemBalance={accountSystemBalance} />
      {selectedAccount ? <BalanceComparisonFlow selectedAccount={selectedAccount} form={form} setForm={setForm} submitState={submitState} setSubmitState={setSubmitState} onSubmit={onSubmitDifference} preview={preview} /> : null}
    </div>
  );
};

const ReconciliationInputPanel = ({ onRefreshAccounts, accountsRefreshing, selectedAccount, ...props }) => (
  <Card className={`panel ${styles.formPanel}`}>
      <span className={styles.cardAccent} aria-hidden="true" />
      <div className={`panel__header ${styles.formHeader}`}>
        <div><h2>Bandingkan saldo</h2><p>Masukkan saldo yang Anda lihat saat ini. Aplikasi akan membandingkannya dengan saldo tercatat.</p></div>
        <button className={styles.refreshButton} type="button" onClick={onRefreshAccounts} disabled={accountsRefreshing} aria-label="Muat ulang saldo tercatat" aria-busy={accountsRefreshing || undefined} title="Muat ulang saldo tercatat"><FiRefreshCw aria-hidden="true" /></button>
      </div>
      {props.accounts.length
        ? <ReconciliationForm key={selectedAccount?.account_id || "no-account"} selectedAccount={selectedAccount} {...props} />
        : <EmptyState className={styles.emptyAction} variant="inline" icon={AccountIcon} title="Tidak ada rekening yang tersedia" description="Tambahkan atau aktifkan rekening yang dapat diperiksa terlebih dahulu." headingLevel={3} action={<ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>} />}
  </Card>
);

export { ReconciliationForm };
export default ReconciliationInputPanel;
