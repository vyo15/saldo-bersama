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
    placeholderMeta="Pilih rekening yang akan dicocokkan"
    placeholderOption={{ icon: AccountIcon }}
    searchable={accounts.length > 8}
    searchPlaceholder="Cari rekening…"
    options={accounts.map((account) => ({
      value: account.account_id,
      label: accountDisplayLabel(account),
      meta: `Saldo sistem ${formatRupiah(account.balance || 0)}`,
      ...accountOptionVisual(account),
    }))}
  />
);

const balanceCopy = (account = {}) => {
  if (account.account_type === "bank") return { question: "Apakah saldo yang Anda lihat di bank juga", input: "Saldo aktual di bank", hint: "Lihat saldo terbaru di bank, lalu pilih sesuai kondisi sebenarnya.", metric: "Saldo di bank" };
  if (account.account_type === "ewallet") return { question: "Apakah saldo yang Anda lihat di e-wallet juga", input: "Saldo aktual di e-wallet", hint: "Lihat saldo terbaru di aplikasi e-wallet, lalu pilih sesuai kondisi sebenarnya.", metric: "Saldo e-wallet" };
  if (account.account_type === "cash") return { question: "Apakah uang tunai yang Anda pegang juga", input: "Jumlah uang tunai aktual", hint: "Hitung uang tunai yang Anda pegang, lalu pilih sesuai kondisi sebenarnya.", metric: "Tunai aktual" };
  if (account.account_type === "investment") return { question: "Apakah Saldo RDN yang Anda lihat juga", input: "Saldo RDN aktual", hint: "Untuk portfolio aktif gunakan halaman Investasi. Harga saham dan NAB diperbarui lewat Perbarui nilai tanpa mengubah jumlah kepemilikan.", metric: "Saldo RDN aktual" };
  return { question: "Apakah saldo aktual juga", input: "Saldo aktual", hint: "Periksa saldo terbaru pada sumber aslinya, lalu pilih sesuai kondisi sebenarnya.", metric: "Saldo aktual" };
};

const ContextAccount = ({ account }) => {
  if (!account) return null;
  const visual = accountOptionVisual(account);
  const Icon = visual.icon || AccountIcon;
  return (
    <div className={styles.contextAccount} aria-label={`Rekening terpilih ${accountDisplayLabel(account)}`}>
      <span className={styles.contextAccountVisual}>{visual.image ? <img src={visual.image} alt="" width="38" height="38" decoding="async" /> : <Icon aria-hidden="true" />}</span>
      <span className={styles.contextAccountCopy}><strong>{accountDisplayLabel(account)}</strong><small>Dipilih otomatis</small></span>
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
      <small>Angka ini berasal dari transaksi yang sudah Anda catat di Saldo Bersama.</small>
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
        <strong>{matched ? "Saldo ternyata sama" : `Ada selisih Rp ${Math.abs(preview.difference).toLocaleString("id-ID")}`}</strong>
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
  if (!selectedAccount.allow_negative) {
    return <MoneyInput id="reconciliation-actual-balance" label={copy.input} required disabled={disabled} value={form.actual_balance} onChange={(value) => { setForm((current) => ({ ...current, actual_balance: value })); setSubmitState({ status: "idle", error: null }); }} />;
  }
  return (
    <label className="field" htmlFor="reconciliation-actual-balance">
      <span>{copy.input} *</span>
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
      <DifferencePreview preview={preview} selectedAccount={selectedAccount} />
      <button type="button" className={styles.notesToggle} onClick={() => setNotesOpen((current) => !current)} aria-expanded={notesOpen}>{notesOpen ? "Sembunyikan catatan" : "+ Tambahkan catatan"}</button>
      {notesOpen ? <label className={`field ${styles.notesField}`} htmlFor="reconciliation-notes"><span className={styles.notesLabel}><span>Catatan</span><small>{form.notes.length}/250</small></span><textarea id="reconciliation-notes" rows="2" maxLength="250" value={form.notes} disabled={busy} placeholder="Opsional" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label> : null}
      <div className={styles.guardLine}><FiShield aria-hidden="true" /><span>Pencocokan hanya menyimpan hasil perbandingan. <strong>Saldo tidak diubah otomatis.</strong></span></div>
      {submitState.error ? <div className="notice notice--danger" role="alert">{submitState.error.message}</div> : null}
      <Button variant="primary" icon={FiCheckCircle} type="submit" loading={progressing} disabled={busy || !selectedAccount || form.actual_balance === ""}>{buttonLabel}</Button>
      {progressing ? <ReconciliationSubmitProgress phase={submitState.status} /> : null}
    </form>
  );
};

const ReconciliationForm = ({ accounts, selectedAccount, form, setForm, submitState, setSubmitState, onConfirmSystemBalance, onSubmitDifference, preview, accountSystemBalance, contextLocked = false }) => {
  const [different, setDifferent] = useState(false);
  const busy = ["submitting", "syncing", "completed"].includes(submitState.status);
  const copy = balanceCopy(selectedAccount);
  const selectAccount = (account) => {
    setDifferent(false);
    setForm({ account_id: account.account_id, actual_balance: "", notes: "" });
    setSubmitState({ status: "idle", error: null });
  };

  return (
    <div className={styles.form}>
      {contextLocked && selectedAccount ? <ContextAccount account={selectedAccount} /> : <AccountPicker accounts={accounts} selectedAccount={selectedAccount} disabled={busy} onSelect={selectAccount} />}
      <SystemBalance selectedAccount={selectedAccount} accountSystemBalance={accountSystemBalance} />
      {selectedAccount && !different ? (
        <section className={styles.matchQuestion}>
          <h3>{copy.question} <Money value={accountSystemBalance(selectedAccount)} />?</h3>
          <p>{copy.hint}</p>
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
        <div><h2>Periksa saldo</h2><p>Konfirmasi jika sama; masukkan nominal hanya saat berbeda.</p></div>
        <button className={styles.refreshButton} type="button" onClick={onRefreshAccounts} disabled={accountsRefreshing} aria-label="Muat ulang saldo sistem" aria-busy={accountsRefreshing || undefined} title="Muat ulang saldo sistem"><FiRefreshCw aria-hidden="true" /></button>
      </div>
      {props.accounts.length
        ? <ReconciliationForm key={selectedAccount?.account_id || "no-account"} selectedAccount={selectedAccount} {...props} />
        : <EmptyState className={styles.emptyAction} variant="inline" icon={AccountIcon} title="Tidak ada rekening yang tersedia" description="Tambahkan atau aktifkan rekening yang mendukung pencocokan saldo terlebih dahulu." headingLevel={3} action={<ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>} />}
    </Card>
  </div>
);

export { ReconciliationForm };
export default ReconciliationInputPanel;
