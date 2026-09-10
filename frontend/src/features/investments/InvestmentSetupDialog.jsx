import { useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { MUTUAL_FUND_EXCHANGE } from "../../shared/presentation/investmentAssets.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import InvestmentAssetPicker from "./InvestmentAssetPicker.jsx";
import { createInvestmentPortfolio, invalidateInvestmentReads, upsertInvestmentInstrument } from "./investments.api.js";
import { validateInvestmentSetup } from "./investments.model.js";

import styles from "./InvestmentForm.module.css";

const PORTFOLIO_DEFAULTS = Object.freeze({ name: "Catatan investasi", broker: "other" });
const INSTRUMENT_DEFAULTS = Object.freeze({ lot_size: 100, exchange: "IDX", asset_type: "stock" });
const AUTO_RDN_VALUE = "__auto_rdn__";

const StartChoice = ({ active, title, description, onClick }) => (
  <button className={`${styles.startChoice}${active ? ` ${styles.startChoiceActive}` : ""}`} type="button" aria-pressed={active} onClick={onClick}>
    <span className={styles.startChoiceRadio} aria-hidden="true" />
    <span>
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
  </button>
);

const StartModeFields = ({ value, onChange }) => (
  <div className={styles.startChoices} role="group" aria-label="Pilih cara memulai investasi">
    <StartChoice
      active={value === "existing"}
      title="Saya sudah punya investasi"
      description="Catat aset lama dan Saldo RDN saat ini sebagai kondisi awal. Tahap ini tidak membuat Transfer atau pembelian historis."
      onClick={() => onChange("existing")}
    />
    <StartChoice
      active={value === "new"}
      title="Saya mulai investasi dari sekarang"
      description="Buat portofolio + RDN Rp0 tanpa transaksi awal. Setelah setup selesai, top up baru memakai Transfer Bank → RDN."
      onClick={() => onChange("new")}
    />
  </div>
);

const rdnOptions = (accounts) => [
  {
    value: AUTO_RDN_VALUE,
    label: "Buat RDN Rp0 otomatis",
    meta: "Tidak ada transfer saat setup; top up dilakukan setelah portofolio siap",
    icon: AccountIcon,
  },
  ...accounts.map((item) => ({
    value: item.account_id,
    label: investmentRdnDisplayLabel(item),
    ...accountOptionVisual(item),
  })),
];

const PortfolioSetupFields = ({ form, accounts, fieldErrors, onFieldChange, disabled }) => <>
  <StartModeFields value={form.start_mode} onChange={(value) => onFieldChange("start_mode", value)} />
  <InvestmentFormField
    id="investment-portfolio-source"
    label="Sumber catatan (opsional)"
    hint="Contoh: Ajaib, Stockbit, Bibit, atau aplikasi tempat posisi ini dicatat. Hanya label; tidak ada koneksi atau sinkronisasi."
    error={fieldErrors.source_label}
  >
    <input maxLength="100" value={form.source_label || ""} placeholder="Contoh: Ajaib" onChange={(event) => onFieldChange("source_label", event.target.value)} />
  </InvestmentFormField>
  <InlineSelectionPicker
    className={styles.field}
    label="Rekening RDN"
    hint="Pilih RDN yang sudah ada atau biarkan sistem membuat RDN Rp0. Setup tidak memindahkan uang; top up berikutnya tetap melalui Transfer."
    error={fieldErrors.rdn_account_id}
    value={form.rdn_account_id || AUTO_RDN_VALUE}
    onChange={(accountId) => onFieldChange("rdn_account_id", accountId)}
    disabled={disabled}
    searchable={accounts.length > 8}
    searchPlaceholder="Cari rekening RDN…"
    options={rdnOptions(accounts)}
  />
</>;

const InstrumentSetupFields = ({ form, existingInstruments, disabled, onAssetSelect, onAssetKindChange }) => <InvestmentAssetPicker
  value={form.ticker || ""}
  existingInstruments={existingInstruments}
  disabled={disabled}
  onSelect={onAssetSelect}
  onKindChange={onAssetKindChange}
/>;

const SetupFields = ({ mode, form, accounts, existingInstruments, fieldErrors, onFieldChange, onAssetSelect, onAssetKindChange, disabled }) => <fieldset className={styles.intentFieldset} disabled={disabled}>
  {mode === "portfolio"
    ? <PortfolioSetupFields form={form} accounts={accounts} fieldErrors={fieldErrors} onFieldChange={onFieldChange} disabled={disabled} />
    : <InstrumentSetupFields form={form} existingInstruments={existingInstruments} disabled={disabled} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} />}
</fieldset>;

const canonicalPortfolioName = (form) => String(form.source_label || "").trim() || PORTFOLIO_DEFAULTS.name;

const createSetupPayload = (mode, form) => {
  if (mode !== "portfolio") {
    return { ticker: form.ticker.trim().toUpperCase(), name: form.instrument_name.trim(), exchange: form.exchange.trim().toUpperCase(), lot_size: Number(form.lot_size), status: "active" };
  }
  const automaticRdn = form.rdn_account_id === AUTO_RDN_VALUE || !form.rdn_account_id;
  return {
    name: canonicalPortfolioName(form),
    broker: PORTFOLIO_DEFAULTS.broker,
    source_label: String(form.source_label || "").trim(),
    rdn_account_id: automaticRdn ? "" : form.rdn_account_id,
    auto_create_rdn: automaticRdn,
  };
};

const persistSetup = (mode, payload) => mode === "portfolio" ? createInvestmentPortfolio(payload) : upsertInvestmentInstrument(payload);

const dialogCopy = (mode) => mode === "instrument"
  ? { title: "Tambah aset investasi", description: "Pilih aset untuk dicatat; tindakan ini tidak membeli aset." }
  : { title: "Tambah investasi", description: "Pilih kondisi Anda saat ini. Setup menetapkan titik mulai pencatatan tanpa Transfer atau pembelian otomatis." };

const setupCanSubmit = (mode, form) => mode === "instrument" ? Boolean(form.ticker) : Boolean(form.start_mode);
const setupSubmitLabel = (mode, form, outcomeUnknown) => {
  if (outcomeUnknown) return "Coba lagi data yang sama";
  if (mode !== "instrument") return "Lanjutkan";
  return form.asset_type === "mutual_fund" ? "Tambah reksa dana" : "Tambah saham";
};

const InvestmentSetupDialog = ({ accounts, instruments = [], owner, mode = "portfolio", initialRdnAccountId = "", onClose, onSuccess }) => {
  const formRef = useRef(null);
  const resolvedMode = mode === "instrument" && owner ? "instrument" : "portfolio";
  const [form, setForm] = useState({
    ...PORTFOLIO_DEFAULTS,
    ...INSTRUMENT_DEFAULTS,
    source_label: "",
    start_mode: "existing",
    rdn_account_id: initialRdnAccountId || AUTO_RDN_VALUE,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const canSubmit = setupCanSubmit(resolvedMode, form);
  const copy = dialogCopy(resolvedMode);
  const guard = useUnsavedChangesGuard({ open: true, value: form, onClose, blocked: busy || outcomeUnknown });

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
    setBusy(true);
    setError("");
    try {
      const saved = await persistSetup(resolvedMode, createSetupPayload(resolvedMode, form));
      setOutcomeUnknown(false);
      invalidateInvestmentReads();
      onSuccess(resolvedMode, form, saved);
      onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Setup investasi belum berhasil.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Modal
      open
      title={copy.title}
      description={copy.description}
      onClose={busy || outcomeUnknown ? undefined : guard.requestClose}
      discardGuard={guard}
      discardSubject="setup investasi"
      dismissible={!busy && !outcomeUnknown}
      footer={<>
        <Button type="button" onClick={guard.discardAndClose} disabled={busy || outcomeUnknown}>Batal</Button>
        <Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!canSubmit}>{setupSubmitLabel(resolvedMode, form, outcomeUnknown)}</Button>
      </>}
    >
      <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data setup dikunci sementara. Jangan ubah RDN, aset investasi, atau nilai lain. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa membuat data ganda.</p> : null}
        <SetupFields mode={resolvedMode} form={form} accounts={accounts} existingInstruments={instruments} fieldErrors={fieldErrors} onFieldChange={onFieldChange} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} disabled={outcomeUnknown} />
      </form>
    </Modal>
  </>;
};

export default InvestmentSetupDialog;
