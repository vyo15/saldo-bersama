import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { createInvestmentPortfolio, invalidateInvestmentReads, upsertInvestmentInstrument } from "./investments.api.js";
import { validateInvestmentSetup } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const PortfolioSetupFields = ({ form, accounts, fieldErrors, onFieldChange, changeBroker, locked }) => <>
  <InvestmentFormField id="investment-broker" label="Broker" required error={fieldErrors.broker}>
    <select value={form.broker} onChange={(event) => changeBroker(event.target.value)}>
      <option value="ajaib">Ajaib</option>
      <option value="other">Broker lain</option>
    </select>
  </InvestmentFormField>
  <InvestmentFormField id="investment-portfolio-name" label="Nama portfolio" required error={fieldErrors.name}>
    <input maxLength="100" value={form.name} onChange={(event) => onFieldChange("name", event.target.value)} />
  </InvestmentFormField>
  <InvestmentFormField id="investment-rdn-account" label="Rekening RDN" required error={fieldErrors.rdn_account_id}>
    <select value={form.rdn_account_id || ""} onChange={(event) => onFieldChange("rdn_account_id", event.target.value)} disabled={!accounts.length}>
      <option value="">Pilih rekening jenis Investasi</option>
      {accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.name}</option>)}
    </select>
  </InvestmentFormField>
  {accounts.length === 0 ? <div className={styles.setupHint} role="note">
    <span>Belum ada rekening Investasi aktif yang dapat dipakai sebagai RDN.</span>
    {locked ? <span className={styles.setupLink} aria-disabled="true">Buka Rekening dan buat RDN</span> : <Link className={styles.setupLink} to="/rekening" state={{ workflowSource: "investment", workflowAction: "create-rdn" }}>Buka Rekening dan buat RDN</Link>}
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

const SetupFields = ({ kind, setKind, owner, form, accounts, fieldErrors, onFieldChange, changeBroker, clearMessages, disabled }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  <InvestmentFormField id="investment-setup-kind" label="Yang ingin ditambahkan">
    <select value={kind} onChange={(event) => { setKind(event.target.value); clearMessages(); }}>
      <option value="portfolio">Catatan portfolio broker</option>
      {owner ? <option value="instrument">Instrumen saham</option> : null}
    </select>
  </InvestmentFormField>
  {kind === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} changeBroker={changeBroker} locked={disabled} />
    : <InstrumentSetupFields form={form} fieldErrors={fieldErrors} onFieldChange={onFieldChange} />}
</fieldset>;

const createSetupPayload = (kind, form) => kind === "portfolio"
  ? { name: form.name.trim(), broker: form.broker, rdn_account_id: form.rdn_account_id }
  : { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };

const persistSetup = (kind, payload) => kind === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const InvestmentSetupDialog = ({ accounts, owner, initialRdnAccountId = "", onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [kind, setKind] = useState("portfolio");
  const [form, setForm] = useState({ name: "Ajaib", broker: "ajaib", lot_size: 100, exchange: "IDX", rdn_account_id: initialRdnAccountId || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = kind === "instrument" || accounts.length > 0;
  const clearMessages = () => { setFieldErrors({}); setError(""); };
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)) : current);
    setError("");
  };
  const changeBroker = (broker) => {
    setForm((current) => ({ ...current, broker, name: current.name === "Ajaib" || current.name === "Portfolio broker" || current.name === "Catatan portfolio" ? (broker === "ajaib" ? "Ajaib" : "Catatan portfolio") : current.name }));
    setFieldErrors((current) => current.broker ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== "broker")) : current);
  };
  const focusFirstInvalid = () => globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const nextErrors = validateInvestmentSetup(kind, form, accounts);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusFirstInvalid(); return; }
    setBusy(true); setError("");
    try {
      const saved = await persistSetup(kind, createSetupPayload(kind, form));
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess(kind, form, saved); onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Setup investasi belum berhasil.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open title="Siapkan catatan investasi" description="Pilih rekening RDN untuk catatan portfolio Ajaib/broker lain atau tambahkan instrumen saham. Tidak ada koneksi API maupun sinkronisasi broker." onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{outcomeUnknown ? "Coba lagi data yang sama" : "Simpan catatan"}</Button>}>
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data setup dikunci sementara. Jangan ubah jenis setup, broker, RDN, ticker, atau nilai lain. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.</p> : null}
        <SetupFields kind={kind} setKind={setKind} owner={owner} form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} changeBroker={changeBroker} clearMessages={clearMessages} disabled={outcomeUnknown} />
      </form>
    </Modal>
  );
};

export default InvestmentSetupDialog;
