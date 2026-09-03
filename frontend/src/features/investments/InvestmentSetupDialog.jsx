import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { createInvestmentPortfolio, invalidateInvestmentReads, upsertInvestmentInstrument } from "./investments.api.js";
import { validateInvestmentSetup } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const PORTFOLIO_DEFAULTS = Object.freeze({ name: "Catatan investasi", broker: "other" });

const initialSetupForm = (accounts, preferredRdnAccountId) => ({
  rdn_account_id: accounts.some((item) => item.account_id === preferredRdnAccountId) ? preferredRdnAccountId : "",
  source_label: "",
  lot_size: 100,
  exchange: "IDX",
});

const RdnSetupGuidance = ({ accounts, blockedAccounts, linkedAccounts, locked }) => {
  if (accounts.length) return null;
  const needsRepair = blockedAccounts.length > 0;
  const allLinked = !needsRepair && linkedAccounts.length > 0;
  const message = needsRepair
    ? "Ada rekening Investasi aktif, tetapi belum dapat dipakai sebagai RDN karena izin saldo negatif masih aktif. Perbaiki rekening yang sudah ada terlebih dahulu."
    : allLinked
      ? "Semua rekening Investasi yang tersedia sudah dipakai oleh catatan investasi. Tambahkan rekening Investasi dengan kepemilikan lain bila ingin membuat catatan baru."
      : "Belum ada rekening Investasi aktif yang dapat dipakai sebagai RDN.";
  const label = needsRepair ? "Buka Rekening dan perbaiki RDN" : "Buka Rekening dan buat RDN";
  const state = needsRepair ? { returnTo: "/investasi" } : { accountPrefill: { account_type: "investment" }, returnTo: "/investasi" };
  return (
    <div className={styles.setupHint} role="note">
      <span>{message}</span>
      {locked
        ? <span className={styles.setupLink} aria-disabled="true">{label}</span>
        : <Link className={styles.setupLink} to="/rekening" state={state}>{label}</Link>}
    </div>
  );
};

const PortfolioSetupFields = ({ form, accounts, blockedAccounts, linkedAccounts, fieldErrors, onFieldChange, locked }) => <>
  <InvestmentFormField id="investment-source-label" label="Sumber catatan (opsional)" error={fieldErrors.source_label}>
    <input maxLength="100" placeholder="Contoh: Ajaib" value={form.source_label || ""} onChange={(event) => onFieldChange("source_label", event.target.value)} />
    <small className={styles.formHint}>Hanya label untuk membantu Anda mengenali asal catatan. Tidak ada koneksi atau sinkronisasi ke aplikasi investasi.</small>
  </InvestmentFormField>
  <InvestmentFormField id="investment-rdn-account" label="Rekening RDN" required error={fieldErrors.rdn_account_id}>
    <select value={form.rdn_account_id || ""} onChange={(event) => onFieldChange("rdn_account_id", event.target.value)} disabled={!accounts.length}>
      <option value="">Pilih rekening Investasi</option>
      {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.display_label || item.name}</option>)}
    </select>
  </InvestmentFormField>
  <RdnSetupGuidance accounts={accounts} blockedAccounts={blockedAccounts} linkedAccounts={linkedAccounts} locked={locked} />
</>;

const InstrumentSetupFields = ({ form, fieldErrors, onFieldChange }) => <>
  <div className={styles.formRow}>
    <InvestmentFormField id="investment-ticker" label="Ticker" required error={fieldErrors.ticker}><input maxLength="16" value={form.ticker || ""} onChange={(event) => onFieldChange("ticker", event.target.value.toUpperCase())} /></InvestmentFormField>
    <InvestmentFormField id="investment-exchange" label="Bursa" required error={fieldErrors.exchange}><input maxLength="16" value={form.exchange} onChange={(event) => onFieldChange("exchange", event.target.value.toUpperCase())} /></InvestmentFormField>
  </div>
  <InvestmentFormField id="investment-instrument-name" label="Nama saham" required error={fieldErrors.instrument_name}><input maxLength="120" value={form.instrument_name || ""} onChange={(event) => onFieldChange("instrument_name", event.target.value)} /></InvestmentFormField>
  <InvestmentFormField id="investment-lot-size" label="Lembar per lot" required error={fieldErrors.lot_size}><input min="1" step="1" type="number" value={form.lot_size} onChange={(event) => onFieldChange("lot_size", event.target.value)} /></InvestmentFormField>
</>;

const SetupFields = ({ mode, form, accounts, blockedAccounts, linkedAccounts, fieldErrors, onFieldChange, disabled }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  {mode === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} blockedAccounts={blockedAccounts} linkedAccounts={linkedAccounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} locked={disabled} />
    : <InstrumentSetupFields form={form} fieldErrors={fieldErrors} onFieldChange={onFieldChange} />}
</fieldset>;

const createSetupPayload = (mode, form) => mode === "portfolio"
  ? { ...PORTFOLIO_DEFAULTS, name: String(form.source_label || "").trim() || PORTFOLIO_DEFAULTS.name, rdn_account_id: form.rdn_account_id }
  : { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };

const persistSetup = (mode, payload) => mode === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const setupPresentation = (mode) => mode === "instrument"
  ? {
      title: "Tambah instrumen saham",
      description: "Tambahkan saham yang ingin dipakai untuk pencatatan manual. Tidak ada koneksi aplikasi investasi maupun harga pasar otomatis.",
      submitLabel: "Simpan instrumen",
      unknownMessage: "Data instrumen dikunci sementara. Jangan ubah ticker, bursa, nama saham, atau ukuran lot. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.",
    }
  : {
      title: "Siapkan catatan investasi",
      description: "Pilih rekening Investasi yang digunakan sebagai RDN. Catatan ini berdiri sendiri dan tidak terhubung ke API atau sinkronisasi aplikasi investasi.",
      submitLabel: "Simpan catatan",
      unknownMessage: "Rekening RDN dan sumber catatan dikunci sementara. Jangan ubah data sampai hasil penyimpanan terkonfirmasi. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.",
    };

const InvestmentSetupDialog = ({ accounts, blockedAccounts = [], linkedAccounts = [], preferredRdnAccountId = "", owner, mode = "portfolio", onClose, onSuccess }) => {
  const resolvedMode = mode === "instrument" && owner ? "instrument" : "portfolio";
  const presentation = setupPresentation(resolvedMode);
  const formRef = useRef(null);
  const [form, setForm] = useState(() => initialSetupForm(accounts, preferredRdnAccountId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = resolvedMode === "instrument" || accounts.length > 0;
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)) : current);
    setError("");
  };
  const focusFirstInvalid = () => globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const nextErrors = validateInvestmentSetup(resolvedMode, form, accounts);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusFirstInvalid(); return; }
    setBusy(true); setError("");
    try {
      await persistSetup(resolvedMode, createSetupPayload(resolvedMode, form));
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess(resolvedMode, form); onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Setup investasi belum berhasil.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open title={presentation.title} description={presentation.description} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{outcomeUnknown ? "Coba lagi data yang sama" : presentation.submitLabel}</Button>}>
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">{presentation.unknownMessage}</p> : null}
        <SetupFields mode={resolvedMode} form={form} accounts={accounts} blockedAccounts={blockedAccounts} linkedAccounts={linkedAccounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} disabled={outcomeUnknown} />
      </form>
    </Modal>
  );
};

export default InvestmentSetupDialog;
