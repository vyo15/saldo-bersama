import { useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import {
  buyInvestment,
  correctInvestment,
  createOpeningPosition,
  invalidateInvestmentReads,
  reconcileInvestment,
  sellInvestment,
  updateInvestmentValuation,
} from "./investments.api.js";
import { investmentTradePreview, selectInvestmentInstruments, validateInvestmentOperation } from "./investments.model.js";

import formStyles from "./InvestmentForm.module.css";
import activityStyles from "./InvestmentActivity.module.css";
import sharedStyles from "./InvestmentShared.module.css";
import portfolioStyles from "./PortfolioCard.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const safeId = (value) => String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "-");
const formatLotCount = (shares, lotSize) => {
  const lots = Number(lotSize) > 0 ? Number(shares || 0) / Number(lotSize) : 0;
  return lots.toLocaleString("id-ID", { maximumFractionDigits: 2 });
};
const signedShares = (value) => {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("id-ID")} lembar`;
};

const InstrumentField = ({ form, onFieldChange, instruments, error }) => (
  <SelectionField className={formStyles.field} label="Saham" required error={error} value={form.instrument_id || ""} onChange={(instrumentId) => onFieldChange("instrument_id", instrumentId)} placeholder="Pilih saham" searchable searchPlaceholder="Cari kode atau nama saham…" options={instruments.map((item) => ({ value: item.instrument_id, label: item.ticker, meta: item.name }))} />
);

const NotesField = ({ id, label = "Catatan (opsional)", value, onChange, error }) => (
  <InvestmentFormField id={id} label={label} error={error}>
    <textarea maxLength="500" value={value || ""} onChange={(event) => onChange(event.target.value)} />
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
    <div className={formStyles.formRow}>
      <InvestmentFormField id="investment-lots" label="Lot" required error={errors.lots}>
        <input min="1" step="1" type="number" value={form.lots} onChange={(event) => onFieldChange("lots", event.target.value)} />
      </InvestmentFormField>
      <InvestmentFormField id="investment-trade-date" label="Tanggal" required error={errors.trade_date}>
        <input type="date" max={TODAY()} value={form.trade_date} onChange={(event) => onFieldChange("trade_date", event.target.value)} />
      </InvestmentFormField>
    </div>
    <MoneyInput id="investment-trade-price" label="Harga per saham" required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />
    <MoneyInput id="investment-trade-fee" label="Fee" value={form.fee_amount} error={errors.fee_amount} onChange={(value) => onFieldChange("fee_amount", value)} />
    <NotesField id="investment-trade-notes" value={form.notes} error={errors.notes} onChange={(value) => onFieldChange("notes", value)} />
    {mode === "buy" ? <small className={formStyles.formHint}>Cash RDN tercatat saat ini <Money value={portfolio.rdn_cash} />. Saldo Bersama hanya mencatat transaksi yang sudah dilakukan di aplikasi investasi.</small> : null}
    {mode === "sell" && holding ? <small className={formStyles.formHint}>Tersedia {formatLotCount(holding.shares, lotSize)} lot ({Number(holding.shares || 0).toLocaleString("id-ID")} lembar).</small> : null}
  </>;
};

const TradeReview = ({ mode, form, instruments, portfolio }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  const cashBefore = Number(portfolio?.rdn_cash || 0);
  const cashAfter = mode === "sell" ? cashBefore + preview.rdnAmount : cashBefore - preview.rdnAmount;
  return (
    <section className={formStyles.review} aria-labelledby="investment-trade-review-title">
      <div>
        <h3 id="investment-trade-review-title">Tinjau catatan sebelum disimpan</h3>
        <p className={formStyles.notice}>Ini adalah catatan transaksi yang sudah dilakukan di aplikasi investasi, bukan order baru. Backend tetap memvalidasi saldo RDN, holding, lot, tanggal, izin, versi data, dan idempotency saat disimpan.</p>
      </div>
      <dl className={formStyles.reviewGrid}>
        <div><dt>Saham</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
        <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} lot · {preview.shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Harga per saham</dt><dd><Money value={preview.pricePerShare} /></dd></div>
        <div><dt>Nilai bruto</dt><dd><Money value={preview.grossAmount} /></dd></div>
        <div><dt>Fee</dt><dd><Money value={preview.feeAmount} /></dd></div>
        <div><dt>{mode === "buy" ? "Estimasi dana RDN keluar" : "Estimasi dana RDN masuk"}</dt><dd><Money value={preview.rdnAmount} /></dd></div>
        <div><dt>Cash RDN sebelum</dt><dd><Money value={cashBefore} /></dd></div>
        <div><dt>Estimasi Cash RDN setelah</dt><dd><Money value={cashAfter} tone={cashAfter < 0 ? "negative" : "default"} /></dd></div>
        <div><dt>Tanggal</dt><dd>{formatDateLongIndonesia(form.trade_date) || form.trade_date}</dd></div>
        {form.notes ? <div><dt>Catatan</dt><dd>{form.notes}</dd></div> : null}
      </dl>
      {cashAfter < 0 ? <p className="notice notice--warning" role="status">Cash RDN tercatat tidak cukup untuk pembelian ini. Tambahkan dana melalui Transfer terlebih dahulu atau periksa nominal transaksi.</p> : null}
    </section>
  );
};

const OpeningPositionFields = ({ form, onFieldChange, instruments, portfolio, errors }) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  return <>
    <p className={formStyles.notice}>Posisi awal mencatat kondisi yang sudah ada saat Anda mulai memakai Saldo Bersama. Ini bukan transaksi beli dan tidak membuat histori pembelian palsu.</p>
    <InstrumentField form={form} onFieldChange={onFieldChange} instruments={instruments} error={errors.instrument_id} />
    <div className={formStyles.formRow}>
      <InvestmentFormField id="investment-opening-shares" label="Jumlah lembar" required error={errors.shares}>
        <input min="1" step="1" type="number" value={form.shares || ""} onChange={(event) => onFieldChange("shares", event.target.value)} />
      </InvestmentFormField>
      <InvestmentFormField id="investment-opening-date" label="Tanggal posisi awal" required error={errors.position_date}>
        <input type="date" max={TODAY()} value={form.position_date} onChange={(event) => onFieldChange("position_date", event.target.value)} />
      </InvestmentFormField>
    </div>
    {instrument && Number(form.shares || 0) > 0 ? <small className={formStyles.formHint}>{Number(form.shares).toLocaleString("id-ID")} lembar ≈ {formatLotCount(form.shares, instrument.lot_size)} lot berdasarkan lot size {Number(instrument.lot_size || 100).toLocaleString("id-ID")}.</small> : null}
    <MoneyInput id="investment-opening-cost" label="Total modal / cost basis" required value={form.cost_basis || ""} error={errors.cost_basis} onChange={(value) => onFieldChange("cost_basis", value)} />
    {Number(form.shares || 0) > 0 && Number(form.cost_basis || 0) > 0 ? <small className={formStyles.formHint}>Average cost tercatat ≈ <Money value={Math.round(Number(form.cost_basis) / Number(form.shares))} /> per lembar.</small> : null}
    <MoneyInput id="investment-opening-price" label="Harga referensi saat ini" required value={form.reference_price || ""} error={errors.reference_price} onChange={(value) => onFieldChange("reference_price", value)} />
    <MoneyInput id="investment-opening-cash" label="Cash RDN awal" required value={form.actual_cash} error={errors.actual_cash} onChange={(value) => onFieldChange("actual_cash", value)} />
    <small className={formStyles.formHint}>Isi saldo Cash RDN yang benar pada kondisi awal. Sistem mencatat selisihnya secara append-only; tidak ada transfer atau pemasukan/pengeluaran yang dibuat otomatis. Cash RDN tercatat saat ini <Money value={portfolio.rdn_cash} />.</small>
    <NotesField id="investment-opening-notes" value={form.notes} error={errors.notes} onChange={(value) => onFieldChange("notes", value)} />
  </>;
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
    <NotesField id="investment-reconciliation-notes" label="Catatan" value={form.notes} onChange={(value) => onFieldChange("notes", value)} />
  </>;
};

const CorrectionFields = ({ form, onFieldChange, instruments, errors }) => <>
  <p className={formStyles.notice}>Koreksi tidak menghapus histori lama. Gunakan hanya setelah selisih diverifikasi.</p>
  <InvestmentFormField id="investment-correction-date" label="Tanggal koreksi" required error={errors.correction_date}>
    <input type="date" max={TODAY()} value={form.correction_date} onChange={(event) => onFieldChange("correction_date", event.target.value)} />
  </InvestmentFormField>
  <SelectionField className={formStyles.field} label="Saham (kosongkan untuk koreksi cash saja)" error={errors.instrument_id} value={form.instrument_id || ""} onChange={(instrumentId) => onFieldChange("instrument_id", instrumentId)} options={[{ value: "", label: "Cash RDN saja" }, ...instruments.map((item) => ({ value: item.instrument_id, label: item.ticker, meta: item.name }))]} searchable={instruments.length > 8} searchPlaceholder="Cari saham…" />
  <div className={formStyles.formRow}>
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
  reconcile: "Cocokkan catatan investasi",
  correction: "Koreksi pencatatan investasi",
  opening_position: "Tambah posisi awal",
})[mode];

const dialogDescription = (mode) => ({
  buy: "Catat transaksi yang sudah Anda lakukan di aplikasi investasi. Saldo Bersama tidak mengirim order beli.",
  sell: "Catat transaksi yang sudah Anda lakukan di aplikasi investasi. Saldo Bersama tidak mengirim order jual.",
  price: "Masukkan harga referensi terakhir dari sumber pilihan Anda. Harga tidak diperbarui otomatis.",
  reconcile: "Bandingkan kondisi aktual dengan catatan Saldo Bersama. Pencocokan tidak menyesuaikan portfolio secara otomatis.",
  correction: "Perbaiki selisih pencatatan secara eksplisit tanpa menulis ulang histori transaksi lama.",
  opening_position: "Masukkan saham dan Cash RDN yang sudah Anda miliki saat mulai mencatat, tanpa merekonstruksi transaksi lama.",
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
    buy: { ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date, notes: form.notes || "" },
    sell: { ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date, notes: form.notes || "" },
    price: { ...base, instrument_id: form.instrument_id, price_per_share: Number(form.price_per_share), valuation_date: form.valuation_date },
    reconcile: { ...base, actual_cash: Number(form.actual_cash), holdings: buildHoldingsPayload(form, portfolio, portfolioInstruments), reconciliation_date: form.reconciliation_date, notes: form.notes || "" },
    correction: { ...base, instrument_id: form.instrument_id || undefined, share_delta: Number(form.share_delta || 0), cost_basis_delta: Number(form.cost_basis_delta || 0), cash_delta: Number(form.cash_delta || 0), correction_date: form.correction_date, reason: form.reason || "" },
    opening_position: { ...base, instrument_id: form.instrument_id, shares: Number(form.shares), cost_basis: Number(form.cost_basis), reference_price: Number(form.reference_price), actual_cash: Number(form.actual_cash), position_date: form.position_date, notes: form.notes || "" },
  };
  const actions = { buy: buyInvestment, sell: sellInvestment, price: updateInvestmentValuation, reconcile: reconcileInvestment, correction: correctInvestment, opening_position: createOpeningPosition };
  return actions[mode](payloads[mode], rowVersion);
};

const InvestmentFields = ({ mode, form, onFieldChange, activeInstruments, sellInstruments, priceInstruments, openingInstruments, portfolioInstruments, portfolio, instruments, errors }) => ({
  buy: <TradeFields mode="buy" form={form} onFieldChange={onFieldChange} instruments={activeInstruments} portfolio={portfolio} errors={errors} />,
  sell: <TradeFields mode="sell" form={form} onFieldChange={onFieldChange} instruments={sellInstruments} portfolio={portfolio} errors={errors} />,
  price: <PriceFields form={form} onFieldChange={onFieldChange} instruments={priceInstruments} errors={errors} />,
  reconcile: <ReconcileFields form={form} onFieldChange={onFieldChange} instruments={portfolioInstruments} portfolio={portfolio} errors={errors} />,
  correction: <CorrectionFields form={form} onFieldChange={onFieldChange} instruments={instruments} errors={errors} />,
  opening_position: <OpeningPositionFields form={form} onFieldChange={onFieldChange} instruments={openingInstruments} portfolio={portfolio} errors={errors} />,
})[mode];

const InvestmentDialogFooter = ({ reviewing, busy, outcomeUnknown, mode, isTrade, onEdit }) => {
  const retryLabel = outcomeUnknown ? "Coba lagi data yang sama" : "";
  if (reviewing) return <>
    <Button disabled={busy || outcomeUnknown} onClick={onEdit}>Ubah</Button>
    <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{retryLabel || (mode === "buy" ? "Simpan catatan beli" : "Simpan catatan jual")}</Button>
  </>;
  const labels = { opening_position: "Simpan posisi awal", price: "Simpan harga", reconcile: "Cocokkan", correction: "Simpan koreksi" };
  const defaultLabel = isTrade ? (mode === "buy" ? "Tinjau catatan beli" : "Tinjau catatan jual") : labels[mode] || "Simpan catatan";
  return <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{retryLabel || defaultLabel}</Button>;
};

const ReconciliationNotice = ({ matched }) => <div className={`notice ${matched ? "notice--success" : "notice--warning"}`} role="status">
  <strong>{matched ? "Catatan cocok dengan kondisi aktual." : "Ada perbedaan dengan kondisi aktual."}</strong>
  <span>{matched ? "Tidak ada perubahan yang diperlukan." : "Pencocokan hanya menyimpan hasil perbandingan dan tidak mengubah Cash RDN atau holding secara otomatis."}</span>
</div>;

const ReconciliationHoldings = ({ comparisons, instruments }) => {
  if (!comparisons.length) return null;
  const instrumentMap = new Map((instruments || []).map((item) => [item.instrument_id, item]));
  return <div className={activityStyles.activitySection}>
    <h3>Perbandingan holding</h3>
    <div className={activityStyles.activityList}>{comparisons.map((item) => {
      const instrument = instrumentMap.get(item.instrument_id);
      return <div className={sharedStyles.readOnlyNote} key={item.instrument_id}>
        <strong>{instrument?.ticker || instrument?.name || "Saham"}</strong>
        <span>Tercatat {Number(item.recorded_shares || 0).toLocaleString("id-ID")} lembar · aktual {Number(item.actual_shares || 0).toLocaleString("id-ID")} lembar · selisih {signedShares(item.difference)}</span>
      </div>;
    })}</div>
  </div>;
};

const ReconciliationActions = ({ matched, userRole, result, onClose, onOpenCorrection, onReviewHistory }) => <div className="form-actions">
  {!matched ? <Button onClick={() => onReviewHistory?.(result)}>Periksa histori</Button> : null}
  {!matched && userRole === "owner" ? <Button onClick={() => onOpenCorrection?.(result)}>Catat koreksi</Button> : null}
  <Button variant="primary" onClick={onClose}>Selesai</Button>
</div>;

const ReconciliationResult = ({ result, instruments, userRole, onClose, onOpenCorrection, onReviewHistory }) => {
  const matched = result?.status === "matched";
  const comparisons = result?.holding_comparisons || result?.holding_differences || [];
  const cashTone = Number(result?.cash_difference || 0) === 0 ? "default" : "negative";
  return <section className={formStyles.review} aria-live="polite">
    <ReconciliationNotice matched={matched} />
    <dl className={formStyles.reviewGrid}>
      <div><dt>Cash RDN tercatat</dt><dd><Money value={result?.recorded_cash} /></dd></div>
      <div><dt>Cash RDN aktual</dt><dd><Money value={result?.actual_cash} /></dd></div>
      <div><dt>Selisih cash</dt><dd><Money value={result?.cash_difference} tone={cashTone} /></dd></div>
      <div><dt>Status</dt><dd>{matched ? "Cocok" : "Perlu diperiksa"}</dd></div>
    </dl>
    <ReconciliationHoldings comparisons={comparisons} instruments={instruments} />
    <ReconciliationActions matched={matched} userRole={userRole} result={result} onClose={onClose} onOpenCorrection={onOpenCorrection} onReviewHistory={onReviewHistory} />
  </section>;
};

const buyDraft = (form) => ({
  instrument_id: String(form.instrument_id || ""),
  lots: form.lots,
  price_per_share: form.price_per_share,
  fee_amount: form.fee_amount,
  trade_date: form.trade_date,
  notes: form.notes || "",
});

const InsufficientRdnGuidance = ({ error, portfolio, form, onFundRdn }) => {
  if (error?.code !== "INSUFFICIENT_RDN" || !onFundRdn) return null;
  const projectedBalance = Number(error?.details?.balance);
  const shortage = Number.isFinite(projectedBalance) && projectedBalance < 0 ? Math.abs(projectedBalance) : 0;
  return <div className={portfolioStyles.actionGuidance} role="status">
    <span>{shortage > 0 ? <>Pembelian membutuhkan tambahan <Money value={shortage} /> agar Cash RDN tidak negatif pada tanggal yang divalidasi server.</> : <>Saldo RDN tidak cukup untuk pembelian ini.</>} Draft pembelian akan dipertahankan setelah Transfer selesai.</span>
    <Button type="button" onClick={() => onFundRdn(portfolio, shortage, buyDraft(form))}>Tambah dana</Button>
  </div>;
};

const initialInvestmentForm = ({ portfolio, initialInstrumentId, initialDraft }) => {
  const base = {
    trade_date: TODAY(), valuation_date: TODAY(), reconciliation_date: TODAY(), correction_date: TODAY(), position_date: TODAY(),
    lots: 1, fee_amount: 0, actual_cash: portfolio?.rdn_cash ?? 0, instrument_id: initialInstrumentId || "", notes: "",
    shares: "", cost_basis: "", reference_price: "", share_delta: 0, cost_basis_delta: 0, cash_delta: 0, reason: "",
  };
  const source = initialDraft && typeof initialDraft === "object" ? initialDraft : {};
  const allowed = ["instrument_id", "lots", "price_per_share", "fee_amount", "trade_date", "notes", "shares", "cost_basis", "reference_price", "actual_cash", "position_date"];
  for (const key of allowed) if (Object.hasOwn(source, key)) base[key] = source[key];
  return base;
};

const useInvestmentDialogState = ({ mode, portfolio, instruments, userRole, initialInstrumentId, initialDraft, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState(() => initialInvestmentForm({ portfolio, initialInstrumentId, initialDraft }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState(null);
  const activeInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "buy");
  const sellInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "sell");
  const priceInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "price");
  const openingInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "opening_position");
  const portfolioInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "reconcile");
  const isTrade = ["buy", "sell"].includes(mode);
  const onFieldChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError("");
    setOperationError(null);
  };
  const validate = () => {
    const next = validateInvestmentOperation(mode, form, { instruments, portfolio, userRole });
    setFieldErrors(next);
    if (!Object.keys(next).length) return true;
    globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
    return false;
  };
  const submit = async (event) => {
    event.preventDefault(); setError(""); setOperationError(null);
    if (!reviewing && !validate()) return;
    if (isTrade && !reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      const result = await runInvestmentAction({ mode, form, portfolio, portfolioInstruments });
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess(mode, portfolio, result);
      if (mode === "reconcile") setReconciliationResult(result);
      else onClose();
    } catch (caught) {
      setOutcomeUnknown(isOutcomeUnknownError(caught));
      setOperationError(caught);
      setError(caught?.message || "Catatan investasi belum berhasil disimpan.");
    } finally { setBusy(false); }
  };
  return { formRef, form, busy, error, operationError, fieldErrors, reviewing, setReviewing, outcomeUnknown, reconciliationResult, activeInstruments, sellInstruments, priceInstruments, openingInstruments, portfolioInstruments, isTrade, onFieldChange, submit };
};

const InvestmentDialog = ({ mode, portfolio, instruments, userRole, initialInstrumentId = "", initialDraft = null, onClose, onSuccess, onOpenCorrection, onReviewHistory, onFundRdn }) => {
  const safePortfolio = portfolio || { holdings: [], rdn_cash: 0 };
  const state = useInvestmentDialogState({ mode, portfolio: safePortfolio, instruments, userRole, initialInstrumentId, initialDraft, onClose, onSuccess });
  if (!mode || !portfolio) return null;
  if (state.reconciliationResult) {
    return <Modal open title={dialogTitle(mode)} description={dialogDescription(mode)} onClose={onClose} footer={null}>
      <ReconciliationResult result={state.reconciliationResult} instruments={instruments} userRole={userRole} onClose={onClose} onOpenCorrection={() => onOpenCorrection?.(portfolio, state.reconciliationResult)} onReviewHistory={() => onReviewHistory?.(portfolio, state.reconciliationResult)} />
    </Modal>;
  }
  const reviewInstruments = mode === "buy" ? state.activeInstruments : state.sellInstruments;
  const { busy, outcomeUnknown } = state;
  const body = <InvestmentFields mode={mode} form={state.form} onFieldChange={state.onFieldChange} activeInstruments={state.activeInstruments} sellInstruments={state.sellInstruments} priceInstruments={state.priceInstruments} openingInstruments={state.openingInstruments} portfolioInstruments={state.portfolioInstruments} portfolio={portfolio} instruments={instruments} errors={state.fieldErrors} />;
  const footer = <InvestmentDialogFooter reviewing={state.reviewing} busy={state.busy} outcomeUnknown={outcomeUnknown} mode={mode} isTrade={state.isTrade} onEdit={() => { state.setReviewing(false); }} />;
  return (
    <Modal open title={dialogTitle(mode)} description={dialogDescription(mode)} onClose={busy || outcomeUnknown ? undefined : onClose} dismissible={!busy && !outcomeUnknown} footer={footer}>
      <form ref={state.formRef} id="investment-dialog-form" className={formStyles.form} onSubmit={state.submit} noValidate>
        {state.fieldErrors._form ? <div className="notice notice--danger" role="alert">{state.fieldErrors._form}</div> : null}
        {state.error ? <div className={`notice ${outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{state.error}</div> : null}
        {mode === "buy" ? <InsufficientRdnGuidance error={state.operationError} portfolio={portfolio} form={state.form} onFundRdn={onFundRdn} /> : null}
        {outcomeUnknown ? <p className={formStyles.intentGuard} role="status">Data dikunci sementara. Jangan ubah saham, nominal, tanggal, atau jumlah. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa menggandakan perubahan.</p> : null}
        {state.reviewing ? <TradeReview mode={mode} form={state.form} instruments={reviewInstruments} portfolio={portfolio} /> : <fieldset className={formStyles.intentFieldset} disabled={outcomeUnknown}>{body}</fieldset>}
      </form>
    </Modal>
  );
};

export default InvestmentDialog;
