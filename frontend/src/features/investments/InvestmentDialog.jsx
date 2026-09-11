import { useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import { instrumentOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentAssetByTicker, isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import { buyInvestment, invalidateInvestmentReads, sellInvestment, updateInvestmentValuation } from "./investments.api.js";
import { investmentProjectedAverage, investmentTradePreview, selectInvestmentInstruments, validateInvestmentOperation } from "./investments.model.js";

import formStyles from "./InvestmentForm.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const instrumentSelectionOption = (item = {}) => {
  const mutualFund = isMutualFundInstrument(item);
  const catalog = investmentAssetByTicker(item.ticker);
  return {
    value: item.instrument_id,
    label: mutualFund ? (item.name || catalog?.name || "Reksa Dana") : item.ticker,
    meta: mutualFund ? (catalog?.category || "Reksa Dana") : item.name,
    ...instrumentOptionVisual(item),
  };
};

const InstrumentField = ({ form, onFieldChange, instruments, error }) => <InlineSelectionPicker
  className={formStyles.field}
  label="Aset investasi"
  required
  error={error}
  value={form.instrument_id || ""}
  onChange={(instrumentId) => onFieldChange("instrument_id", instrumentId)}
  placeholder="Pilih saham atau reksa dana"
  placeholderMeta="Cari dan pilih aset investasi"
  placeholderOption={{ mark: "IDX" }}
  searchable
  searchPlaceholder="Cari kode atau nama aset…"
  options={instruments.map(instrumentSelectionOption)}
/>;

const NotesField = ({ value, onChange, error }) => <InvestmentFormField id="investment-trade-notes" label="Catatan (opsional)" error={error}>
  <textarea maxLength="500" value={value || ""} onChange={(event) => onChange(event.target.value)} />
</InvestmentFormField>;

const tradeSelectableInstruments = (mode, instruments, portfolio) => {
  if (mode !== "sell") return instruments;
  const heldIds = new Set((portfolio.holdings || []).map((item) => item.instrument_id));
  return instruments.filter((item) => heldIds.has(item.instrument_id));
};

const SellAvailabilityHint = ({ holding, instrument }) => {
  if (!holding) return null;
  if (isMutualFundInstrument(instrument || holding)) return <small className={formStyles.formHint}>Tersedia {Number(holding.shares || 0).toLocaleString("id-ID")} unit.</small>;
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);
  const lots = Number(holding.shares || 0) / Math.max(1, lotSize);
  return <small className={formStyles.formHint}>Tersedia {lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot.</small>;
};

const TradeFields = ({ mode, form, onFieldChange, instruments, portfolio, errors }) => {
  const selectable = tradeSelectableInstruments(mode, instruments, portfolio);
  const holding = (portfolio.holdings || []).find((item) => item.instrument_id === form.instrument_id) || null;
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || holding || {});
  return <>
    <InstrumentField form={form} onFieldChange={onFieldChange} instruments={selectable} error={errors.instrument_id} />
    <div className={formStyles.formRow}>
      <InvestmentFormField id="investment-lots" label={mutualFund ? "Unit" : "Lot"} required error={errors.lots}>
        <input min="1" step="1" type="number" value={form.lots} onChange={(event) => onFieldChange("lots", event.target.value)} />
      </InvestmentFormField>
      <InvestmentFormField id="investment-trade-date" label="Tanggal" required error={errors.trade_date}>
        <TemporalInput type="date" max={TODAY()} value={form.trade_date} onChange={(event) => onFieldChange("trade_date", event.target.value)} />
      </InvestmentFormField>
    </div>
    <MoneyInput id="investment-trade-price" label={mutualFund ? "Nilai per unit" : "Harga per saham"} required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />
    {mode === "buy" && instrument ? (() => {
      const average = investmentProjectedAverage(form, instruments, portfolio);
      return <div className={formStyles.averagePreview} role="status"><span>{mutualFund ? "Average nilai/unit" : "Average harga/lembar"}</span><strong><Money value={average.nextAverage} /></strong><small>{average.currentShares > 0 ? <>Sebelum pembelian <Money value={average.currentAverage} /></> : "Posisi baru"}</small></div>;
    })() : null}
    <NotesField value={form.notes} error={errors.notes} onChange={(value) => onFieldChange("notes", value)} />
    {mode === "buy" ? <small className={formStyles.formHint}>Pembelian ini hanya menambah catatan posisi investasi dan tidak memindahkan saldo rekening.</small> : null}
    {mode === "sell" ? <SellAvailabilityHint holding={holding} instrument={instrument} /> : null}
  </>;
};

const TradeReview = ({ mode, form, instruments, portfolio }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  const mutualFund = isMutualFundInstrument(preview.instrument || {});
  return <section className={formStyles.review} aria-labelledby="investment-trade-review-title">
    <div>
      <h3 id="investment-trade-review-title">Tinjau catatan sebelum disimpan</h3>
      <p className={formStyles.notice}>Ini hanya pencatatan. Saldo Bersama tidak mengirim order ke broker dan tidak memindahkan saldo rekening.</p>
    </div>
    <dl className={formStyles.reviewGrid}>
      <div><dt>Aset</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
      <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} {mutualFund ? "unit" : "lot"}</dd></div>
      <div><dt>{mutualFund ? "Nilai per unit" : "Harga per saham"}</dt><dd><Money value={preview.pricePerShare} /></dd></div>
      <div><dt>Nilai tercatat</dt><dd><Money value={preview.rdnAmount} /></dd></div>
      {mode === "buy" ? (() => { const average = investmentProjectedAverage(form, instruments, portfolio); return <div><dt>{mutualFund ? "Average nilai/unit setelah beli" : "Average harga/lembar setelah beli"}</dt><dd><Money value={average.nextAverage} /></dd></div>; })() : null}
      <div><dt>Tanggal</dt><dd>{formatDateLongIndonesia(form.trade_date) || form.trade_date}</dd></div>
      {form.notes ? <div><dt>Catatan</dt><dd>{form.notes}</dd></div> : null}
    </dl>
  </section>;
};

const PriceFields = ({ form, onFieldChange, instruments, errors }) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || {});
  return <>
    <InstrumentField form={form} onFieldChange={onFieldChange} instruments={instruments} error={errors.instrument_id} />
    <MoneyInput id="investment-price" label={mutualFund ? "Nilai per unit" : "Harga per saham"} required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />
    <InvestmentFormField id="investment-valuation-date" label="Tanggal nilai" required error={errors.valuation_date}>
      <TemporalInput type="date" max={TODAY()} value={form.valuation_date} onChange={(event) => onFieldChange("valuation_date", event.target.value)} />
    </InvestmentFormField>
    <small className={formStyles.formHint}>Nilai ini menggantikan referensi manual terakhir untuk menghitung nilai aset. Tidak ada transaksi yang dibuat.</small>
  </>;
};

const dialogTitle = (mode) => ({ buy: "Catat pembelian", sell: "Catat penjualan", price: "Perbarui nilai" })[mode] || "Catat investasi";
const dialogDescription = (mode) => ({
  buy: "Tambahkan pembelian ke posisi aset. Pencatatan ini tidak memindahkan saldo rekening.",
  sell: "Kurangi posisi aset sesuai penjualan yang sudah Anda lakukan di luar Saldo Bersama.",
  price: "Perbarui harga atau nilai manual terakhir tanpa membuat transaksi.",
})[mode] || "Perbarui catatan investasi.";

const initialForm = ({ initialInstrumentId, initialDraft }) => ({
  trade_date: TODAY(),
  valuation_date: TODAY(),
  lots: 1,
  price_per_share: "",
  instrument_id: initialInstrumentId || "",
  notes: "",
  ...(initialDraft && typeof initialDraft === "object" ? initialDraft : {}),
});

const payloadForMode = (mode, form, portfolioId) => {
  if (mode === "price") return { portfolio_id: portfolioId, instrument_id: form.instrument_id, price_per_share: Number(form.price_per_share), valuation_date: form.valuation_date };
  return { portfolio_id: portfolioId, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), trade_date: form.trade_date, notes: form.notes || "" };
};

const actionForMode = (mode) => {
  if (mode === "buy") return buyInvestment;
  if (mode === "sell") return sellInvestment;
  return updateInvestmentValuation;
};

const InvestmentDialogFooter = ({ reviewing, busy, outcomeUnknown, isTrade, onEdit, onCancel }) => {
  const submitLabel = outcomeUnknown ? "Coba lagi data yang sama" : reviewing ? "Simpan catatan" : isTrade ? "Tinjau" : "Simpan nilai";
  return <>
    {reviewing ? <Button type="button" onClick={onEdit} disabled={busy || outcomeUnknown}>Ubah</Button> : <Button type="button" onClick={onCancel} disabled={busy || outcomeUnknown}>Batal</Button>}
    <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{submitLabel}</Button>
  </>;
};

const useInvestmentDialogController = ({ mode, portfolio, instruments, userRole, initialInstrumentId, initialDraft, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState(() => initialForm({ initialInstrumentId, initialDraft }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const isTrade = mode === "buy" || mode === "sell";
  const activeInstruments = selectInvestmentInstruments(instruments, portfolio?.holdings || [], "buy");
  const sellInstruments = selectInvestmentInstruments(instruments, portfolio?.holdings || [], "sell");
  const priceInstruments = selectInvestmentInstruments(instruments, portfolio?.holdings || [], "price");

  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const next = validateInvestmentOperation(mode, form, { instruments, portfolio, userRole });
    setFieldErrors(next);
    if (!reviewing && Object.keys(next).length) {
      globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    if (isTrade && !reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      const result = await actionForMode(mode)(payloadForMode(mode, form, portfolio.portfolio_id), portfolio.row_version);
      setOutcomeUnknown(false);
      invalidateInvestmentReads();
      onSuccess?.(mode, portfolio, result);
      onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setError(caught?.message || "Catatan investasi belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  };
  return { formRef, form, busy, error, fieldErrors, reviewing, setReviewing, outcomeUnknown, isTrade, activeInstruments, sellInstruments, priceInstruments, onFieldChange, submit };
};

const InvestmentDialogBody = ({ mode, portfolio, state }) => {
  if (state.reviewing) {
    const reviewInstruments = mode === "buy" ? state.activeInstruments : state.sellInstruments;
    return <TradeReview mode={mode} form={state.form} instruments={reviewInstruments} portfolio={portfolio} />;
  }
  if (mode === "price") return <fieldset className={formStyles.intentFieldset} disabled={state.outcomeUnknown}><PriceFields form={state.form} onFieldChange={state.onFieldChange} instruments={state.priceInstruments} errors={state.fieldErrors} /></fieldset>;
  const tradeInstruments = mode === "buy" ? state.activeInstruments : state.sellInstruments;
  return <fieldset className={formStyles.intentFieldset} disabled={state.outcomeUnknown}><TradeFields mode={mode} form={state.form} onFieldChange={state.onFieldChange} instruments={tradeInstruments} portfolio={portfolio} errors={state.fieldErrors} /></fieldset>;
};

const InvestmentDialog = ({ mode, portfolio, instruments, userRole, initialInstrumentId = "", initialDraft = null, onClose, onSuccess }) => {
  const state = useInvestmentDialogController({ mode, portfolio, instruments, userRole, initialInstrumentId, initialDraft, onClose, onSuccess });
  const guard = useUnsavedChangesGuard({ open: Boolean(mode && portfolio), value: state.form, onClose, blocked: state.busy || state.outcomeUnknown });
  if (!mode || !portfolio) return null;
  return <Modal
    open
    title={dialogTitle(mode)}
    description={dialogDescription(mode)}
    onClose={state.busy || state.outcomeUnknown ? undefined : guard.requestClose}
    discardGuard={guard}
    discardSubject="catatan investasi"
    dismissible={!state.busy && !state.outcomeUnknown}
    footer={<InvestmentDialogFooter reviewing={state.reviewing} busy={state.busy} outcomeUnknown={state.outcomeUnknown} isTrade={state.isTrade} onEdit={() => state.setReviewing(false)} onCancel={guard.discardAndClose} />}
  >
    <form ref={state.formRef} id="investment-dialog-form" className={formStyles.form} onSubmit={state.submit} noValidate>
      {state.fieldErrors._form ? <div className="notice notice--danger" role="alert">{state.fieldErrors._form}</div> : null}
      {state.error ? <div className={`notice ${state.outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{state.error}</div> : null}
      {state.outcomeUnknown ? <p className={formStyles.intentGuard} role="status">Data dikunci sementara. Jangan ubah aset, nominal, tanggal, atau jumlah. Tekan “Coba lagi data yang sama” untuk memverifikasi hasil tanpa menggandakan catatan.</p> : null}
      <InvestmentDialogBody mode={mode} portfolio={portfolio} state={state} />
    </form>
  </Modal>;
};

export default InvestmentDialog;
