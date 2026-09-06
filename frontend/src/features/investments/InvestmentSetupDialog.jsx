import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { investmentRdnAccountSetupState } from "../../shared/workflows/investmentContinuation.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import InvestmentStockPicker from "./InvestmentStockPicker.jsx";
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
  <SelectionField className={styles.field} label="Rekening RDN" required error={fieldErrors.rdn_account_id} value={form.rdn_account_id || ""} onChange={(accountId) => onFieldChange("rdn_account_id", accountId)} disabled={!accounts.length} placeholder="Pilih rekening jenis Investasi" searchable={accounts.length > 8} options={accounts.map((item) => ({ value: item.account_id, label: investmentRdnDisplayLabel(item), ...accountOptionVisual(item) }))} />
  {accounts.length === 0 ? <div className={styles.setupHint} role="note">
    <span>Belum ada rekening Investasi aktif yang dapat dipakai sebagai RDN.</span>
    <RdnSetupLink locked={locked} needsRepair={needsRepair} />
  </div> : null}
</>;

const InstrumentSetupFields = ({ form, existingInstruments, disabled, onStockSelect }) => <InvestmentStockPicker
  value={form.ticker || ""}
  existingInstruments={existingInstruments}
  disabled={disabled}
  onSelect={onStockSelect}
/>;

const SetupFields = ({ mode, form, accounts, existingInstruments, fieldErrors, onFieldChange, onStockSelect, disabled, needsRepair }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  {mode === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} locked={disabled} needsRepair={needsRepair} />
    : <InstrumentSetupFields form={form} existingInstruments={existingInstruments} disabled={disabled} onStockSelect={onStockSelect} />}
</fieldset>;

const canonicalPortfolioName = (form) => String(form.source_label || "").trim() || PORTFOLIO_DEFAULTS.name;

const createSetupPayload = (mode, form) => mode === "portfolio"
  ? { name: canonicalPortfolioName(form), broker: PORTFOLIO_DEFAULTS.broker, rdn_account_id: form.rdn_account_id }
  : { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };

const persistSetup = (mode, payload) => mode === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const dialogCopy = (mode) => mode === "instrument"
  ? { title: "Tambah saham", description: "Pilih saham dari daftar LQ45 yang disediakan prototype. Menambahkan saham hanya menyiapkan instrumen pencatatan dan tidak melakukan pembelian." }
  : { title: "Siapkan catatan RDN", description: "Pilih rekening Investasi yang dipakai sebagai RDN untuk catatan aset investasi manual." };

const InvestmentSetupDialog = ({ accounts, instruments = [], owner, mode = "portfolio", initialRdnAccountId = "", needsRdnRepair = false, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const resolvedMode = mode === "instrument" && owner ? "instrument" : "portfolio";
  const [form, setForm] = useState({ ...PORTFOLIO_DEFAULTS, ...INSTRUMENT_DEFAULTS, source_label: "", rdn_account_id: initialRdnAccountId || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = resolvedMode === "instrument" ? Boolean(form.ticker) : accounts.length > 0;
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
  const onStockSelect = (stock) => {
    if (outcomeUnknown) return;
    setForm((current) => ({
      ...current,
      ticker: stock.ticker,
      instrument_name: stock.name,
      exchange: stock.exchange,
      lot_size: stock.lot_size,
    }));
    setFieldErrors({});
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
    <Modal open title={copy.title} description={copy.description} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{outcomeUnknown ? "Coba lagi data yang sama" : resolvedMode === "instrument" ? "Tambah saham" : "Simpan catatan"}</Button>}>
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data setup dikunci sementara. Jangan ubah RDN, saham, atau nilai lain. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.</p> : null}
        <SetupFields mode={resolvedMode} form={form} accounts={accounts} existingInstruments={instruments} fieldErrors={fieldErrors} onFieldChange={onFieldChange} onStockSelect={onStockSelect} disabled={outcomeUnknown} needsRepair={needsRepair} />
      </form>
    </Modal>
  );
};

export default InvestmentSetupDialog;
