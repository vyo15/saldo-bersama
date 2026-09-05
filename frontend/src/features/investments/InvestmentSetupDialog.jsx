import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { investmentRdnAccountSetupState } from "../../shared/workflows/investmentContinuation.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { createInvestmentPortfolio, invalidateInvestmentReads, upsertInvestmentInstrument } from "./investments.api.js";
import { validateInvestmentSetup } from "./investments.model.js";

import styles from "./InvestmentForm.module.css";

const PORTFOLIO_DEFAULTS = Object.freeze({ name: "Catatan investasi", broker: "other" });
const INSTRUMENT_DEFAULTS = Object.freeze({ lot_size: 100, exchange: "IDX" });

const RdnSetupLink = ({ locked, needsRepair = false }) => {
  const label = needsRepair ? "Perbaiki rekening RDN" : "Buka Rekening dan buat RDN";
  const state = needsRepair ? { returnTo: "/investasi" } : investmentRdnAccountSetupState();
  return locked
    ? <span className={styles.setupLink} aria-disabled="true">{label}</span>
    : <Link className={styles.setupLink} to="/rekening" state={state}>{label}</Link>;
};

const PortfolioSetupFields = ({ form, accounts, fieldErrors, onFieldChange, locked, needsRepair }) => <>
  <InvestmentFormField id="investment-portfolio-source" label="Sumber catatan (opsional)" hint="Contoh: Ajaib, Stockbit, Bibit, atau nama aplikasi tempat investasi dicatat. Tidak ada koneksi atau sinkronisasi ke aplikasi investasi." error={fieldErrors.name}>
    <input maxLength="100" value={form.source_label || ""} placeholder="Contoh: Ajaib" onChange={(event) => onFieldChange("source_label", event.target.value)} />
  </InvestmentFormField>
  <InvestmentFormField id="investment-rdn-account" label="Rekening RDN" required error={fieldErrors.rdn_account_id}>
    <select value={form.rdn_account_id || ""} onChange={(event) => onFieldChange("rdn_account_id", event.target.value)} disabled={!accounts.length}>
      <option value="">Pilih rekening jenis Investasi</option>
      {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{investmentRdnDisplayLabel(item)}</option>)}
    </select>
  </InvestmentFormField>
  {accounts.length === 0 ? <div className={styles.setupHint} role="note">
    <span>Belum ada rekening Investasi aktif yang dapat dipakai sebagai RDN.</span>
    <RdnSetupLink locked={locked} needsRepair={needsRepair} />
  </div> : null}
</>;

const InstrumentSetupFields = ({ form, fieldErrors, onFieldChange }) => <>
  <div className={styles.formRow}>
    <InvestmentFormField id="investment-ticker" label="Ticker" required error={fieldErrors.ticker}><input maxLength="16" value={form.ticker || ""} onChange={(event) => onFieldChange("ticker", event.target.value.toUpperCase())} /></InvestmentFormField>
    <InvestmentFormField id="investment-exchange" label="Bursa" required error={fieldErrors.exchange}><input maxLength="16" value={form.exchange} onChange={(event) => onFieldChange("exchange", event.target.value.toUpperCase())} /></InvestmentFormField>
  </div>
  <InvestmentFormField id="investment-instrument-name" label="Nama saham" required error={fieldErrors.instrument_name}><input maxLength="120" value={form.instrument_name || ""} onChange={(event) => onFieldChange("instrument_name", event.target.value)} /></InvestmentFormField>
  <InvestmentFormField id="investment-lot-size" label="Lembar per lot" required error={fieldErrors.lot_size}><input min="1" step="1" type="number" value={form.lot_size} onChange={(event) => onFieldChange("lot_size", event.target.value)} /></InvestmentFormField>
</>;

const SetupFields = ({ mode, form, accounts, fieldErrors, onFieldChange, disabled, needsRepair }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  {mode === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} locked={disabled} needsRepair={needsRepair} />
    : <InstrumentSetupFields form={form} fieldErrors={fieldErrors} onFieldChange={onFieldChange} />}
</fieldset>;

const canonicalPortfolioName = (form) => String(form.source_label || "").trim() || PORTFOLIO_DEFAULTS.name;

const createSetupPayload = (mode, form) => mode === "portfolio"
  ? { name: canonicalPortfolioName(form), broker: PORTFOLIO_DEFAULTS.broker, rdn_account_id: form.rdn_account_id }
  : { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };

const persistSetup = (mode, payload) => mode === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const dialogCopy = (mode) => mode === "instrument"
  ? { title: "Tambah instrumen saham", description: "Tambahkan instrumen yang memang Anda miliki atau akan dicatat secara manual." }
  : { title: "Siapkan catatan RDN", description: "Pilih rekening Investasi yang dipakai sebagai RDN untuk catatan aset investasi manual." };

const InvestmentSetupDialog = ({ accounts, owner, mode = "portfolio", initialRdnAccountId = "", needsRdnRepair = false, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const resolvedMode = mode === "instrument" && owner ? "instrument" : "portfolio";
  const [form, setForm] = useState({ ...PORTFOLIO_DEFAULTS, ...INSTRUMENT_DEFAULTS, source_label: "", rdn_account_id: initialRdnAccountId || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = resolvedMode === "instrument" || accounts.length > 0;
  const needsRepair = resolvedMode === "portfolio" && !accounts.length && (needsRdnRepair || Boolean(initialRdnAccountId));
  const copy = dialogCopy(resolvedMode);
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const stale = key === "source_label" ? new Set(["source_label", "name"]) : new Set([key]);
      return Object.fromEntries(Object.entries(current).filter(([name]) => !stale.has(name)));
    });
    setError("");
  };
  const focusFirstInvalid = () => globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const formForValidation = resolvedMode === "portfolio" ? { ...form, name: canonicalPortfolioName(form) } : form;
    const nextErrors = validateInvestmentSetup(resolvedMode, formForValidation, accounts);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusFirstInvalid(); return; }
    setBusy(true); setError("");
    try {
      const saved = await persistSetup(resolvedMode, createSetupPayload(resolvedMode, form));
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess(resolvedMode, form, saved); onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Setup investasi belum berhasil.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open title={copy.title} description={copy.description} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{outcomeUnknown ? "Coba lagi data yang sama" : "Simpan catatan"}</Button>}>
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data setup dikunci sementara. Jangan ubah RDN, nama, ticker, atau nilai lain. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.</p> : null}
        <SetupFields mode={resolvedMode} form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} disabled={outcomeUnknown} needsRepair={needsRepair} />
      </form>
    </Modal>
  );
};

export default InvestmentSetupDialog;
