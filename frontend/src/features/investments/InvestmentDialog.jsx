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
    {mode === "buy" ? <small className={styles.formHint}>Cash RDN tercatat saat ini <Money value={portfolio.rdn_cash} />. Saldo Bersama hanya mencatat transaksi yang sudah dilakukan di broker.</small> : null}
    {mode === "sell" && holding ? <small className={styles.formHint}>Tersedia {formatLotCount(holding.shares, lotSize)} lot ({Number(holding.shares || 0).toLocaleString("id-ID")} lembar).</small> : null}
  </>;
};

const TradeReview = ({ mode, form, instruments, portfolio }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  const cashBefore = Number(portfolio?.rdn_cash || 0);
  const cashAfter = mode === "sell" ? cashBefore + preview.rdnAmount : cashBefore - preview.rdnAmount;
  return (
    <section className={styles.review} aria-labelledby="investment-trade-review-title">
      <div>
        <h3 id="investment-trade-review-title">Tinjau catatan sebelum disimpan</h3>
        <p className={styles.notice}>Ini adalah catatan transaksi yang sudah dilakukan di broker, bukan order baru. Backend tetap memvalidasi saldo RDN, holding, lot, tanggal, izin, versi data, dan idempotency saat disimpan.</p>
      </div>
      <dl className={styles.reviewGrid}>
        <div><dt>Saham</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
        <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} lot · {preview.shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Harga per saham</dt><dd><Money value={preview.pricePerShare} /></dd></div>
        <div><dt>Nilai bruto</dt><dd><Money value={preview.grossAmount} /></dd></div>
        <div><dt>Fee</dt><dd><Money value={preview.feeAmount} /></dd></div>
        <div><dt>{mode === "buy" ? "Estimasi dana RDN keluar" : "Estimasi dana RDN masuk"}</dt><dd><Money value={preview.rdnAmount} /></dd></div>
        <div><dt>Cash RDN sebelum</dt><dd><Money value={cashBefore} /></dd></div>
        <div><dt>Estimasi Cash RDN setelah</dt><dd><Money value={cashAfter} tone={cashAfter < 0 ? "negative" : "default"} /></dd></div>
        <div><dt>Tanggal</dt><dd>{formatDateLongIndonesia(form.trade_date) || form.trade_date}</dd></div>
      </dl>
      {cashAfter < 0 ? <p className="notice notice--warning" role="status">Cash RDN tercatat tidak cukup untuk pembelian ini. Tambahkan dana melalui Transfer terlebih dahulu atau periksa nominal transaksi.</p> : null}
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

const dialogTitle = (mode, portfolio) => ({
  buy: "Catat pembelian saham",
  sell: "Catat penjualan saham",
  price: "Perbarui harga manual",
  reconcile: portfolio.broker === "ajaib" ? "Cocokkan dengan Ajaib" : "Cocokkan dengan broker",
  correction: "Koreksi pencatatan investasi",
})[mode];

const dialogDescription = (mode) => ({
  buy: "Catat transaksi yang sudah Anda lakukan di broker. Saldo Bersama tidak mengirim order beli ke broker.",
  sell: "Catat transaksi yang sudah Anda lakukan di broker. Saldo Bersama tidak mengirim order jual ke broker.",
  price: "Masukkan harga terakhir yang Anda lihat di broker atau sumber pilihan Anda. Harga tidak diperbarui otomatis.",
  reconcile: "Bandingkan kondisi broker dengan catatan Saldo Bersama. Pencocokan tidak menyesuaikan portfolio secara otomatis.",
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
  const actions = { buy: buyInvestment, sell: sellInvestment, price: updateInvestmentValuation, reconcile: reconcileInvestment, correction: correctInvestment };
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

const ReconciliationResult = ({ result, instruments, userRole, onClose, onOpenCorrection }) => {
  const matched = result?.status === "matched";
  const instrumentMap = new Map((instruments || []).map((item) => [item.instrument_id, item]));
  const differences = result?.holding_differences || [];
  return <section className={styles.review} aria-live="polite">
    <div className={`notice ${matched ? "notice--success" : "notice--warning"}`} role="status">
      <strong>{matched ? "Catatan cocok dengan broker." : "Ada perbedaan dengan broker."}</strong>
      <span>{matched ? "Tidak ada perubahan yang diperlukan." : "Pencocokan hanya menyimpan hasil perbandingan dan tidak mengubah cash atau holding secara otomatis."}</span>
    </div>
    <dl className={styles.reviewGrid}>
      <div><dt>Cash RDN tercatat</dt><dd><Money value={result?.recorded_cash} /></dd></div>
      <div><dt>Cash RDN aktual</dt><dd><Money value={result?.actual_cash} /></dd></div>
      <div><dt>Selisih cash</dt><dd><Money value={result?.cash_difference} tone={Number(result?.cash_difference || 0) === 0 ? "default" : "negative"} /></dd></div>
      <div><dt>Status</dt><dd>{matched ? "Cocok" : "Perlu diperiksa"}</dd></div>
    </dl>
    {differences.length ? <div className={styles.activitySection}>
      <h3>Perbedaan holding</h3>
      <div className={styles.activityList}>{differences.map((item) => {
        const instrument = instrumentMap.get(item.instrument_id);
        return <div className={styles.readOnlyNote} key={item.instrument_id}><strong>{instrument?.ticker || instrument?.name || "Saham"}</strong><span>Catatan {Number(item.recorded_shares || 0).toLocaleString("id-ID")} lembar · broker {Number(item.actual_shares || 0).toLocaleString("id-ID")} lembar · selisih {Number(item.difference || 0).toLocaleString("id-ID")} lembar</span></div>;
      })}</div>
    </div> : null}
    <div className="form-actions">
      {!matched && userRole === "owner" ? <Button onClick={onOpenCorrection}>Koreksi catatan</Button> : null}
      <Button variant="primary" onClick={onClose}>Selesai</Button>
    </div>
  </section>;
};

const InsufficientRdnGuidance = ({ error, portfolio, onFundRdn }) => {
  if (error?.code !== "INSUFFICIENT_RDN" || !onFundRdn) return null;
  const projectedBalance = Number(error?.details?.balance);
  const shortage = Number.isFinite(projectedBalance) && projectedBalance < 0 ? Math.abs(projectedBalance) : 0;
  return <div className={styles.actionGuidance} role="status">
    <span>{shortage > 0 ? <>Pembelian akan membuat RDN kurang <Money value={shortage} /> pada tanggal yang divalidasi server.</> : <>Saldo RDN tidak cukup untuk pembelian ini.</>} Tambahkan dana melalui Transfer, lalu tinjau kembali catatan pembelian.</span>
    <Button type="button" onClick={() => onFundRdn(portfolio)}>Tambah dana ke RDN</Button>
  </div>;
};

const useInvestmentDialogState = ({ mode, portfolio, instruments, userRole, initialInstrumentId, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState(() => ({ trade_date: TODAY(), valuation_date: TODAY(), reconciliation_date: TODAY(), correction_date: TODAY(), lots: 1, fee_amount: 0, actual_cash: portfolio?.rdn_cash ?? 0, instrument_id: initialInstrumentId || "" }));
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
  return { formRef, form, busy, error, operationError, fieldErrors, reviewing, setReviewing, outcomeUnknown, reconciliationResult, activeInstruments, sellInstruments, priceInstruments, portfolioInstruments, isTrade, onFieldChange, submit };
};

const InvestmentDialog = ({ mode, portfolio, instruments, userRole, initialInstrumentId = "", onClose, onSuccess, onOpenCorrection, onFundRdn }) => {
  const safePortfolio = portfolio || { holdings: [], rdn_cash: 0 };
  const state = useInvestmentDialogState({ mode, portfolio: safePortfolio, instruments, userRole, initialInstrumentId, onClose, onSuccess });
  if (!mode || !portfolio) return null;
  if (state.reconciliationResult) {
    return <Modal open title={dialogTitle(mode, portfolio)} description={dialogDescription(mode)} onClose={onClose} footer={null}>
      <ReconciliationResult result={state.reconciliationResult} instruments={instruments} userRole={userRole} onClose={onClose} onOpenCorrection={() => onOpenCorrection?.(portfolio)} />
    </Modal>;
  }
  const reviewInstruments = mode === "buy" ? state.activeInstruments : state.sellInstruments;
  const body = <InvestmentFields mode={mode} form={state.form} onFieldChange={state.onFieldChange} activeInstruments={state.activeInstruments} sellInstruments={state.sellInstruments} priceInstruments={state.priceInstruments} portfolioInstruments={state.portfolioInstruments} portfolio={portfolio} instruments={instruments} errors={state.fieldErrors} />;
  const footer = <InvestmentDialogFooter reviewing={state.reviewing} busy={state.busy} outcomeUnknown={state.outcomeUnknown} mode={mode} isTrade={state.isTrade} onEdit={() => { state.setReviewing(false); }} />;
  return (
    <Modal open title={dialogTitle(mode, portfolio)} description={dialogDescription(mode)} onClose={state.busy || state.outcomeUnknown ? undefined : onClose} dismissible={!state.busy && !state.outcomeUnknown} footer={footer}>
      <form ref={state.formRef} id="investment-dialog-form" className={styles.form} onSubmit={state.submit} noValidate>
        {state.fieldErrors._form ? <div className="notice notice--danger" role="alert">{state.fieldErrors._form}</div> : null}
        {state.error ? <div className={`notice ${state.outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{state.error}</div> : null}
        <InsufficientRdnGuidance error={state.operationError} portfolio={portfolio} onFundRdn={onFundRdn} />
        {state.outcomeUnknown ? <p className={styles.intentGuard} role="status">Data dikunci sementara. Jangan ubah saham, nominal, tanggal, atau jumlah lot. Tekan “Coba lagi data yang sama” agar idempotency key yang sama memverifikasi hasil tanpa menggandakan perubahan.</p> : null}
        {state.reviewing ? <TradeReview mode={mode} form={state.form} instruments={reviewInstruments} portfolio={portfolio} /> : <fieldset className={styles.intentFieldset} disabled={state.outcomeUnknown}>{body}</fieldset>}
      </form>
    </Modal>
  );
};

export default InvestmentDialog;
