import { useMemo, useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import InvestmentAssetPicker from "./InvestmentAssetPicker.jsx";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { createInvestmentAssetPosition, invalidateInvestmentReads } from "./investments.api.js";
import { validateInvestmentAssetPosition } from "./investments.model.js";

import styles from "./InvestmentForm.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const ticker = (value) => String(value || "").trim().toUpperCase();

const assetPositionPreview = (form, asset) => {
  const quantity = Number(form.opening_quantity || 0);
  const lotSize = Number(asset?.lot_size || 1);
  const shares = isMutualFundInstrument(asset || {}) ? quantity : quantity * lotSize;
  const averagePrice = Number(form.average_price || 0);
  const referencePrice = Number(form.reference_price || 0);
  const costBasis = Number.isSafeInteger(shares * averagePrice) ? shares * averagePrice : 0;
  const marketValue = Number.isSafeInteger(shares * referencePrice) ? shares * referencePrice : 0;
  return { shares, costBasis, marketValue };
};

const PositionSummary = ({ form, asset }) => {
  if (!asset || !Number(form.opening_quantity) || !Number(form.average_price) || !Number(form.reference_price)) return null;
  const preview = assetPositionPreview(form, asset);
  return <section className={styles.review} aria-label="Ringkasan posisi investasi">
    <dl className={styles.reviewGrid}>
      <div><dt>Modal tercatat</dt><dd><Money value={preview.costBasis} /></dd></div>
      <div><dt>Nilai saat ini</dt><dd><Money value={preview.marketValue} /></dd></div>
    </dl>
    <small className={styles.formHint}>Posisi ini hanya menjadi catatan awal aset. Tidak ada saldo rekening yang dipindahkan dan tidak ada order yang dikirim ke broker.</small>
  </section>;
};


const heldAssetEntries = (portfolios) => {
  const values = new Set();
  for (const portfolio of portfolios) for (const holding of portfolio.holdings || []) values.add(ticker(holding.ticker));
  return [...values].filter(Boolean).map((value) => ({ ticker: value }));
};

const createAssetPositionPayload = (form, asset, instruments) => {
  const registered = instruments.find((item) => ticker(item.ticker) === ticker(asset.ticker) && item.status === "active") || null;
  const preview = assetPositionPreview(form, asset);
  const instrument = registered ? { instrument_id: registered.instrument_id } : {
    ticker: ticker(asset.ticker),
    name: asset.name,
    exchange: ticker(asset.exchange),
    lot_size: Number(asset.lot_size || 1),
    status: "active",
  };
  return {
    ...instrument,
    shares: preview.shares,
    cost_basis: preview.costBasis,
    reference_price: Number(form.reference_price),
    position_date: form.position_date,
    notes: form.notes || "",
  };
};

const InvestmentPositionFields = ({ form, asset, heldTickers, allowedTickers, outcomeUnknown, fieldErrors, onAssetSelect, onAssetKindChange, onFieldChange }) => {
  const mutualFund = isMutualFundInstrument(asset || {});
  return <fieldset className={styles.intentFieldset} disabled={outcomeUnknown}>
    <InvestmentAssetPicker value={form.ticker} existingInstruments={heldTickers} allowedTickers={allowedTickers} disabled={outcomeUnknown} onSelect={onAssetSelect} onKindChange={onAssetKindChange} />
    {fieldErrors.ticker ? <p className={styles.fieldError} role="alert">{fieldErrors.ticker}</p> : null}
    {asset ? <>
      <div className={styles.formRow}>
        <InvestmentFormField id="investment-position-quantity" label={mutualFund ? "Jumlah unit" : "Jumlah lot"} required error={fieldErrors.opening_quantity}>
          <input min="1" step="1" type="number" value={form.opening_quantity} onChange={(event) => onFieldChange("opening_quantity", event.target.value)} />
        </InvestmentFormField>
        <InvestmentFormField id="investment-position-date" label="Tanggal posisi" required error={fieldErrors.position_date}>
          <TemporalInput type="date" max={TODAY()} value={form.position_date} onChange={(event) => onFieldChange("position_date", event.target.value)} />
        </InvestmentFormField>
      </div>
      <MoneyInput id="investment-position-average" label={mutualFund ? "Nilai rata-rata per unit" : "Harga rata-rata per saham"} required value={form.average_price} error={fieldErrors.average_price} onChange={(value) => onFieldChange("average_price", value)} />
      <MoneyInput id="investment-position-current" label={mutualFund ? "Nilai per unit saat ini" : "Harga saham saat ini"} required value={form.reference_price} error={fieldErrors.reference_price} onChange={(value) => onFieldChange("reference_price", value)} />
      <InvestmentFormField id="investment-position-notes" label="Catatan (opsional)" error={fieldErrors.notes}>
        <textarea maxLength="500" value={form.notes} onChange={(event) => onFieldChange("notes", event.target.value)} />
      </InvestmentFormField>
      <PositionSummary form={form} asset={asset} />
    </> : null}
  </fieldset>;
};

const InvestmentSetupDialog = ({ instruments = [], portfolios = [], owner = false, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState({
    ticker: "",
    opening_quantity: "",
    average_price: "",
    reference_price: "",
    position_date: TODAY(),
    notes: "",
  });
  const [asset, setAsset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  const heldTickers = useMemo(() => heldAssetEntries(portfolios), [portfolios]);
  const allowedTickers = useMemo(() => owner ? null : instruments.filter((item) => item.status === "active").map((item) => ticker(item.ticker)), [instruments, owner]);
  const guard = useUnsavedChangesGuard({ open: true, value: { ...form, asset: asset?.ticker || "" }, onClose, blocked: busy || outcomeUnknown });

  const clearErrorFor = (key) => setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    clearErrorFor(key);
    setError("");
  };
  const onAssetSelect = (nextAsset) => {
    if (outcomeUnknown) return;
    setAsset(nextAsset);
    setForm((current) => ({ ...current, ticker: nextAsset.ticker }));
    setFieldErrors({});
    setError("");
  };
  const onAssetKindChange = () => {
    if (outcomeUnknown) return;
    setAsset(null);
    setForm((current) => ({ ...current, ticker: "" }));
    setFieldErrors({});
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = validateInvestmentAssetPosition(form, asset);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    const payload = createAssetPositionPayload(form, asset, instruments);
    setBusy(true);
    setError("");
    try {
      const saved = await createInvestmentAssetPosition(payload);
      setOutcomeUnknown(false);
      invalidateInvestmentReads();
      onSuccess?.(saved, asset);
      onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Investasi belum berhasil ditambahkan.");
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    open
    title="Tambah investasi"
    description="Pilih saham atau reksa dana, lalu catat posisi yang Anda miliki saat ini."
    onClose={busy || outcomeUnknown ? undefined : guard.requestClose}
    discardGuard={guard}
    discardSubject="investasi"
    dismissible={!busy && !outcomeUnknown}
    footer={<>
      <Button type="button" onClick={guard.discardAndClose} disabled={busy || outcomeUnknown}>Batal</Button>
      <Button variant="primary" type="submit" form="investment-setup-form" loading={busy} disabled={!asset}>{outcomeUnknown ? "Coba lagi data yang sama" : "Simpan investasi"}</Button>
    </>}
  >
    <form ref={formRef} id="investment-setup-form" className={styles.form} onSubmit={submit} noValidate>
      {fieldErrors._form ? <div className="notice notice--danger" role="alert">{fieldErrors._form}</div> : null}
      {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
      {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data dikunci sementara. Jangan ubah aset, jumlah, harga, atau tanggal. Tekan “Coba lagi data yang sama” untuk memverifikasi hasil tanpa membuat catatan ganda.</p> : null}
      <InvestmentPositionFields form={form} asset={asset} heldTickers={heldTickers} allowedTickers={allowedTickers} outcomeUnknown={outcomeUnknown} fieldErrors={fieldErrors} onAssetSelect={onAssetSelect} onAssetKindChange={onAssetKindChange} onFieldChange={onFieldChange} />
    </form>
  </Modal>;
};

export default InvestmentSetupDialog;
