import { useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { MUTUAL_FUND_EXCHANGE } from "../../shared/presentation/investmentAssets.js";
import { investmentRdnAccountSetupState } from "../../shared/workflows/investmentContinuation.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import InvestmentAssetPicker from "./InvestmentAssetPicker.jsx";
import { createInvestmentPortfolio, invalidateInvestmentReads, upsertInvestmentInstrument } from "./investments.api.js";
import { validateInvestmentSetup } from "./investments.model.js";

import styles from "./InvestmentForm.module.css";

const PORTFOLIO_DEFAULTS = Object.freeze({ name: "Catatan investasi", broker: "other" });
const INSTRUMENT_DEFAULTS = Object.freeze({ lot_size: 100, exchange: "IDX", asset_type: "stock" });

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
  <InlineSelectionPicker className={styles.field} label="Rekening RDN" required error={fieldErrors.rdn_account_id} value={form.rdn_account_id || ""} onChange={(accountId) => onFieldChange("rdn_account_id", accountId)} disabled={!accounts.length} placeholder="Pilih rekening jenis Investasi" placeholderMeta="Pilih RDN untuk catatan investasi" placeholderOption={{ icon: AccountIcon }} searchable={accounts.length > 8} searchPlaceholder="Cari rekening RDN…" options={accounts.map((item) => ({ value: item.account_id, label: investmentRdnDisplayLabel(item), ...accountOptionVisual(item) }))} />
  {accounts.length === 0 ? <div className={styles.setupHint} role="note">
    <span>Belum ada rekening Investasi aktif yang dapat dipakai sebagai RDN.</span>
    <RdnSetupLink locked={locked} needsRepair={needsRepair} />
  </div> : null}
</>;

const InstrumentSetupFields = ({ form, existingInstruments, disabled, onAssetSelect, onAssetKindChange }) => <InvestmentAssetPicker
  value={form.ticker || ""}
  existingInstruments={existingInstruments}
  disabled={disabled}
  onSelect={onAssetSelect}
  onKindChange={onAssetKindChange}
/>;

const SetupFields = ({ mode, form, accounts, existingInstruments, fieldErrors, onFieldChange, onAssetSelect, onAssetKindChange, disabled, needsRepair }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  {mode === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} locked={disabled} needsRepair={needsRepair} />
    : <InstrumentSetupFields form={form} existingInstruments={existingInstruments} disabled={disabled} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} />}
</fieldset>;

const canonicalPortfolioName = (form) => String(form.source_label || "").trim() || PORTFOLIO_DEFAULTS.name;

const createSetupPayload = (mode, form) => mode === "portfolio"
  ? { name: canonicalPortfolioName(form), broker: PORTFOLIO_DEFAULTS.broker, rdn_account_id: form.rdn_account_id }
  : { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };

const persistSetup = (mode, payload) => mode === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const dialogCopy = (mode) => mode === "instrument"
  ? { title: "Tambah aset investasi", description: "Pilih aset untuk dicatat; tindakan ini tidak membeli aset." }
  : { title: "Siapkan catatan RDN", description: "Pilih rekening Investasi yang dipakai sebagai RDN untuk catatan aset investasi manual." };

const setupCanSubmit = (mode, form, accounts) => mode === "instrument" ? Boolean(form.ticker) : accounts.length > 0;
const setupSubmitLabel = (mode, form, outcomeUnknown) => {
  if (outcomeUnknown) return "Coba lagi data yang sama";
  if (mode !== "instrument") return "Simpan catatan";
  return form.asset_type === "mutual_fund" ? "Tambah reksa dana" : "Tambah saham";
};

const InvestmentSetupDialog = ({ accounts, instruments = [], owner, mode = "portfolio", initialRdnAccountId = "", needsRdnRepair = false, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const resolvedMode = mode === "instrument" && owner ? "instrument" : "portfolio";
  const [form, setForm] = useState({ ...PORTFOLIO_DEFAULTS, ...INSTRUMENT_DEFAULTS, source_label: "", rdn_account_id: initialRdnAccountId || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = setupCanSubmit(resolvedMode, form, accounts);
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
  const onAssetSelect = (asset) => {
    if (outcomeUnknown) return;
    setForm((current) => ({
      ...current,
      ticker: asset.ticker,
      instrument_name: asset.name,
      exchange: asset.exchange,
      lot_size: asset.lot_size,
      asset_type: asset.asset_type || "stock",
    }));
    setFieldErrors({});
    setError("");
  };
  const onAssetKindChange = (assetType) => {
    if (outcomeUnknown) return;
    setForm((current) => ({
      ...current,
      ticker: "",
      instrument_name: "",
      exchange: assetType === "mutual_fund" ? MUTUAL_FUND_EXCHANGE : "IDX",
      lot_size: assetType === "mutual_fund" ? 1 : 100,
      asset_type: assetType,
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
    <Modal open title={copy.title} description={copy.description} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{setupSubmitLabel(resolvedMode, form, outcomeUnknown)}</Button>}>
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data setup dikunci sementara. Jangan ubah RDN, aset investasi, atau nilai lain. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.</p> : null}
        <SetupFields mode={resolvedMode} form={form} accounts={accounts} existingInstruments={instruments} fieldErrors={fieldErrors} onFieldChange={onFieldChange} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} disabled={outcomeUnknown} needsRepair={needsRepair} />
      </form>
    </Modal>
  );
};

export default InvestmentSetupDialog;
