import { useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import {
  buyInvestment,
  correctInvestment,
  invalidateInvestmentReads,
  reconcileInvestment,
  sellInvestment,
  updateInvestmentValuation,
} from "./investments.api.js";
import { investmentTradePreview, selectInvestmentInstruments, validateInvestmentOperation } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const safeId = (value) => String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "-");
const formatLotCount = (shares, lotSize) => {
  const lots = Number(lotSize) > 0 ? Number(shares || 0) / Number(lotSize) : 0;
  return lots.toLocaleString("id-ID", { maximumFractionDigits: 2 });
};

const InstrumentField = ({ form, onFieldChange, instruments, error }) => (
  <InvestmentFormField id="investment-instrument" label="Saham" required error={error}>
    <select value={form.instrument_id || ""} onChange={(event) => onFieldChange("instrument_id", event.target.value)}>
      <option value="">Pilih saham</option>
      {instruments.map((item) => <option key={item.instrument_id} value={item.instrument_id}>{item.ticker} · {item.name}</option>)}
    </select>
  </InvestmentFormField>
);

const TradeFields = ({ mode, form, onFieldChange, instruments, portfolio, errors }) => {
  const heldIds = new Set((portfolio.holdings || []).map((item) => item.instrument_id));
  const selectable = mode === "sell" ? instruments.filter((item) => heldIds.has(item.instrument_id)) : instruments;
  const holding = (portfolio.holdings || []).find((item) => item.instrument_id === form.instrument_id) || null;
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);

  return <>
    <InstrumentField form={form} onFieldChange={onFieldChange} instruments={selectable} error={errors.instrument_id} />
    <div className={styles.formRow}>
      <InvestmentFormField id="investment-lots" label="Lot" required error={errors.lots}>
        <input min="1" step="1" type="number" value={form.lots} onChange={(event) => onFieldChange("lots", event.target.value)} />
      </InvestmentFormField>
      <InvestmentFormField id="investment-trade-date" label="Tanggal" required error={errors.trade_date}>
        <input type="date" max={TODAY()} value={form.trade_date} onChange={(event) => onFieldChange("trade_date", event.target.value)} />
      </InvestmentFormField>
    </div>
    <MoneyInput id="investment-trade-price" label="Harga per saham" required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />
    <MoneyInput id="investment-trade-fee" label="Fee" value={form.fee_amount} error={errors.fee_amount} onChange={(value) => onFieldChange("fee_amount", value)} />
    {mode === "sell" && holding ? <small className={styles.formHint}>Tersedia {formatLotCount(holding.shares, lotSize)} lot ({Number(holding.shares || 0).toLocaleString("id-ID")} lembar).</small> : null}
  </>;
};

const TradeReview = ({ mode, form, instruments }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  return (
    <section className={styles.review} aria-labelledby="investment-trade-review-title">
      <div>
        <h3 id="investment-trade-review-title">Tinjau catatan sebelum disimpan</h3>
        <p className={styles.notice}>Ini adalah catatan transaksi yang sudah dilakukan di aplikasi investasi, bukan order baru. Backend tetap memvalidasi saldo RDN, holding, lot, tanggal, izin, versi data, dan idempotency saat disimpan.</p>
      </div>
      <dl className={styles.reviewGrid}>
        <div><dt>Saham</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
        <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} lot · {preview.shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Harga per saham</dt><dd><Money value={preview.pricePerShare} /></dd></div>
        <div><dt>Nilai bruto</dt><dd><Money value={preview.grossAmount} /></dd></div>
        <div><dt>Fee</dt><dd><Money value={preview.feeAmount} /></dd></div>
        <div><dt>{mode === "buy" ? "Estimasi dana RDN keluar" : "Estimasi dana RDN masuk"}</dt><dd><Money value={preview.rdnAmount} /></dd></div>
        <div><dt>Tanggal</dt><dd>{formatDateLongIndonesia(form.trade_date) || form.trade_date}</dd></div>
      </dl>
    </section>
  );
};

const PriceFields = ({ form, onFieldChange, instruments, errors }) => <>
  <InstrumentField form={form} onFieldChange={onFieldChange} instruments={instruments} error={errors.instrument_id} />
  <MoneyInput id="investment-price" label="Harga manual per saham" required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />
  <InvestmentFormField id="investment-valuation-date" label="Tanggal harga" required error={errors.valuation_date}>
    <input type="date" max={TODAY()} value={form.valuation_date} onChange={(event) => onFieldChange("valuation_date", event.target.value)} />
  </InvestmentFormField>
</>;

const ReconcileFields = ({ form, onFieldChange, instruments, portfolio, errors }) => {
  const current = new Map((portfolio.holdings || []).map((item) => [item.instrument_id, item.shares]));
  return <>
    <MoneyInput id="investment-actual-cash" label="Cash RDN aktual" required value={form.actual_cash} error={errors.actual_cash} onChange={(value) => onFieldChange("actual_cash", value)} />
    <InvestmentFormField id="investment-reconciliation-date" label="Tanggal pencocokan" required error={errors.reconciliation_date}>
      <input type="date" max={TODAY()} value={form.reconciliation_date} onChange={(event) => onFieldChange("reconciliation_date", event.target.value)} />
    </InvestmentFormField>
    {instruments.map((item) => {
      const key = `shares:${item.instrument_id}`;
      return (
        <InvestmentFormField key={item.instrument_id} id={`investment-shares-${safeId(item.instrument_id)}`} label={`${item.ticker} · lembar aktual`} error={errors[key]}>
          <input min="0" step="1" type="number" value={form[key] ?? current.get(item.instrument_id) ?? 0} onChange={(event) => onFieldChange(key, event.target.value)} />
        </InvestmentFormField>
      );
    })}
    <InvestmentFormField id="investment-reconciliation-notes" label="Catatan">
      <textarea maxLength="500" value={form.notes || ""} onChange={(event) => onFieldChange("notes", event.target.value)} />
    </InvestmentFormField>
  </>;
};

const CorrectionFields = ({ form, onFieldChange, instruments, errors }) => <>
  <p className={styles.notice}>Koreksi tidak menghapus trade lama. Gunakan hanya setelah mismatch diverifikasi.</p>
  <InvestmentFormField id="investment-correction-date" label="Tanggal koreksi" required error={errors.correction_date}>
    <input type="date" max={TODAY()} value={form.correction_date} onChange={(event) => onFieldChange("correction_date", event.target.value)} />
  </InvestmentFormField>
  <InvestmentFormField id="investment-correction-instrument" label="Saham (kosongkan untuk koreksi cash saja)" error={errors.instrument_id}>
    <select value={form.instrument_id || ""} onChange={(event) => onFieldChange("instrument_id", event.target.value)}>
      <option value="">Cash RDN saja</option>
      {instruments.map((item) => <option key={item.instrument_id} value={item.instrument_id}>{item.ticker}</option>)}
    </select>
  </InvestmentFormField>
  <div className={styles.formRow}>
    <InvestmentFormField id="investment-share-delta" label="Delta lembar" error={errors.share_delta}><input step="1" type="number" value={form.share_delta || 0} onChange={(event) => onFieldChange("share_delta", event.target.value)} /></InvestmentFormField>
    <InvestmentFormField id="investment-cost-basis-delta" label="Delta cost basis" error={errors.cost_basis_delta}><input step="1" type="number" value={form.cost_basis_delta || 0} onChange={(event) => onFieldChange("cost_basis_delta", event.target.value)} /></InvestmentFormField>
  </div>
  <InvestmentFormField id="investment-cash-delta" label="Delta cash RDN" error={errors.cash_delta}><input step="1" type="number" value={form.cash_delta || 0} onChange={(event) => onFieldChange("cash_delta", event.target.value)} /></InvestmentFormField>
  <InvestmentFormField id="investment-correction-reason" label="Alasan" required error={errors.reason}><textarea minLength="5" maxLength="500" value={form.reason || ""} onChange={(event) => onFieldChange("reason", event.target.value)} /></InvestmentFormField>
</>;

const dialogTitle = (mode) => ({
  buy: "Catat pembelian saham",
  sell: "Catat penjualan saham",
  price: "Perbarui harga manual",
  reconcile: "Cocokkan catatan",
  correction: "Koreksi pencatatan investasi",
})[mode];

const dialogDescription = (mode) => ({
  buy: "Catat transaksi yang sudah Anda lakukan di aplikasi investasi. Saldo Bersama tidak mengirim order beli.",
  sell: "Catat transaksi yang sudah Anda lakukan di aplikasi investasi. Saldo Bersama tidak mengirim order jual.",
  price: "Masukkan harga terakhir yang Anda lihat di aplikasi investasi atau sumber pilihan Anda. Harga tidak diperbarui otomatis.",
  reconcile: "Bandingkan kondisi investasi Anda dengan catatan Saldo Bersama. Pencocokan tidak menyesuaikan catatan secara otomatis.",
  correction: "Perbaiki selisih pencatatan secara eksplisit tanpa menulis ulang histori transaksi lama.",
})[mode];

const buildHoldingsPayload = (form, portfolio, instruments) => {
  const current = new Map((portfolio.holdings || []).map((item) => [item.instrument_id, item.shares]));
  return instruments
    .map((item) => ({ instrument_id: item.instrument_id, shares: Number(form[`shares:${item.instrument_id}`] ?? current.get(item.instrument_id) ?? 0) }))
    .filter((item) => item.shares > 0 || current.has(item.instrument_id));
};

const runInvestmentAction = ({ mode, form, portfolio, portfolioInstruments }) => {
  const base = { portfolio_id: portfolio.portfolio_id };
  const rowVersion = portfolio.row_version;
  const payloads = {
    buy: { ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date },
    sell: { ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date },
    price: { ...base, instrument_id: form.instrument_id, price_per_share: Number(form.price_per_share), valuation_date: form.valuation_date },
    reconcile: { ...base, actual_cash: Number(form.actual_cash), holdings: buildHoldingsPayload(form, portfolio, portfolioInstruments), reconciliation_date: form.reconciliation_date, notes: form.notes || "" },
    correction: { ...base, instrument_id: form.instrument_id || undefined, share_delta: Number(form.share_delta || 0), cost_basis_delta: Number(form.cost_basis_delta || 0), cash_delta: Number(form.cash_delta || 0), correction_date: form.correction_date, reason: form.reason || "" },
  };
  const actions = {
    buy: buyInvestment,
    sell: sellInvestment,
    price: updateInvestmentValuation,
    reconcile: reconcileInvestment,
    correction: correctInvestment,
  };
  return actions[mode](payloads[mode], rowVersion);
};

const InvestmentFields = ({ mode, form, onFieldChange, activeInstruments, sellInstruments, priceInstruments, portfolioInstruments, portfolio, instruments, errors }) => ({
  buy: <TradeFields mode="buy" form={form} onFieldChange={onFieldChange} instruments={activeInstruments} portfolio={portfolio} errors={errors} />,
  sell: <TradeFields mode="sell" form={form} onFieldChange={onFieldChange} instruments={sellInstruments} portfolio={portfolio} errors={errors} />,
  price: <PriceFields form={form} onFieldChange={onFieldChange} instruments={priceInstruments} errors={errors} />,
  reconcile: <ReconcileFields form={form} onFieldChange={onFieldChange} instruments={portfolioInstruments} portfolio={portfolio} errors={errors} />,
  correction: <CorrectionFields form={form} onFieldChange={onFieldChange} instruments={instruments} errors={errors} />,
})[mode];

const InvestmentDialogFooter = ({ reviewing, busy, outcomeUnknown, mode, isTrade, onEdit }) => {
  const retryLabel = outcomeUnknown ? "Coba lagi data yang sama" : "";
  if (reviewing) return <>
    <Button disabled={busy || outcomeUnknown} onClick={onEdit}>Ubah</Button>
    <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{retryLabel || (mode === "buy" ? "Simpan catatan beli" : "Simpan catatan jual")}</Button>
  </>;
  const defaultLabel = isTrade ? (mode === "buy" ? "Tinjau catatan beli" : "Tinjau catatan jual") : "Simpan catatan";
  return <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{retryLabel || defaultLabel}</Button>;
};


const InvestmentErrorAction = ({ code, portfolio, onAddFunds, onClose }) => {
  if (code !== "INSUFFICIENT_RDN" || !onAddFunds) return null;
  const addFunds = () => { onClose(); onAddFunds(portfolio); };
  return <div className={styles.errorAction}><span>Tambahkan dana melalui Transfer ke Cash RDN, lalu ulangi Catat beli dengan data transaksi yang sama.</span><Button type="button" onClick={addFunds}>Tambah dana ke RDN</Button></div>;
};

const InvestmentDialog = ({ mode, portfolio, instruments, userRole, onAddFunds, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState(() => ({ trade_date: TODAY(), valuation_date: TODAY(), reconciliation_date: TODAY(), correction_date: TODAY(), lots: 1, fee_amount: 0, actual_cash: portfolio?.rdn_cash ?? 0 }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  if (!mode || !portfolio) return null;

  const activeInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "buy");
  const sellInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "sell");
  const priceInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "price");
  const portfolioInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "reconcile");
  const isTrade = ["buy", "sell"].includes(mode);
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError("");
    setErrorCode("");
  };
  const focusFirstInvalid = () => globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  const validate = () => {
    const next = validateInvestmentOperation(mode, form, { instruments, portfolio, userRole });
    setFieldErrors(next);
    if (!Object.keys(next).length) return true;
    focusFirstInvalid();
    return false;
  };
  const editReview = () => { setReviewing(false); setError(""); setErrorCode(""); };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setErrorCode("");
    if (!reviewing && !validate()) return;
    if (isTrade && !reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      await runInvestmentAction({ mode, form, portfolio, portfolioInstruments });
      setOutcomeUnknown(false);
      invalidateInvestmentReads();
      onSuccess(mode, portfolio);
      onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setErrorCode(String(caught?.code || ""));
      setError(caught?.message || "Catatan investasi belum berhasil disimpan.");
    } finally {
      setBusy(false);
    }
  };
  const reviewInstruments = mode === "buy" ? activeInstruments : sellInstruments;
  const body = <InvestmentFields mode={mode} form={form} onFieldChange={onFieldChange} activeInstruments={activeInstruments} sellInstruments={sellInstruments} priceInstruments={priceInstruments} portfolioInstruments={portfolioInstruments} portfolio={portfolio} instruments={instruments} errors={fieldErrors} />;

  return (
    <Modal open title={dialogTitle(mode)} description={dialogDescription(mode)} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={<InvestmentDialogFooter reviewing={reviewing} busy={busy} outcomeUnknown={outcomeUnknown} mode={mode} isTrade={isTrade} onEdit={editReview} />}>
      <form ref={formRef} id="investment-dialog-form" className={styles.form} onSubmit={submit} noValidate>
        {fieldErrors._form ? <div className="notice notice--danger" role="alert">{fieldErrors._form}</div> : null}
        {error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{error}</div> : null}
        {!outcomeUnknown ? <InvestmentErrorAction code={errorCode} portfolio={portfolio} onAddFunds={onAddFunds} onClose={onClose} /> : null}
        {outcomeUnknown ? <p className={styles.intentGuard} role="status">Data dikunci sementara. Jangan ubah saham, nominal, tanggal, atau jumlah lot. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa menggandakan perubahan.</p> : null}
        {reviewing ? <TradeReview mode={mode} form={form} instruments={reviewInstruments} /> : <fieldset className={styles.intentFieldset} disabled={outcomeUnknown}>{body}</fieldset>}
      </form>
    </Modal>
  );
};

export default InvestmentDialog;
