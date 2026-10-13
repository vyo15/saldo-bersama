import { useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { TargetIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { instrumentOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { investmentAssetByTicker, isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import InvestmentFormField from "./InvestmentFormField.jsx";
import InvestmentDecimalInput from "./InvestmentDecimalInput.jsx";
import InvestmentUnitPrice from "./InvestmentUnitPrice.jsx";
import { buyInvestment, invalidateInvestmentReads, sellInvestment, updateInvestmentValuation } from "./investments.api.js";
import { investmentProjectedAverage, investmentTradePreview, selectInvestmentInstruments, validateInvestmentOperation } from "./investments.model.js";
import { investmentSellQuickQuantity, investmentTradeImpact } from "./investmentTradePreview.js";
import formStyles from "./InvestmentForm.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const instrumentSelectionOption = (item = {}) => {
  const mutualFund = isMutualFundInstrument(item);
  const catalog = investmentAssetByTicker(item.ticker);
  return { value: item.instrument_id, label: mutualFund ? (item.name || catalog?.name || "Reksa Dana") : item.ticker, meta: mutualFund ? (catalog?.category || "Reksa Dana") : item.name, ...instrumentOptionVisual(item) };
};

const InstrumentField = ({ form, onFieldChange, instruments, error }) => <InlineSelectionPicker className={formStyles.field} label="Aset investasi" required error={error} value={form.instrument_id || ""} onChange={(instrumentId) => onFieldChange("instrument_id", instrumentId)} placeholder="Pilih saham atau reksa dana" placeholderOption={{ mark: "IDX" }} searchable searchPlaceholder="Cari kode atau nama aset…" options={instruments.map(instrumentSelectionOption)} />;

const NotesField = ({ value, onChange, error }) => <InvestmentFormField id="investment-trade-notes" label="Catatan (opsional)" error={error}><textarea maxLength="500" value={value || ""} onChange={(event) => onChange(event.target.value)} /></InvestmentFormField>;

const tradeSelectableInstruments = (mode, instruments, portfolio) => {
  if (mode !== "sell") return instruments;
  const heldIds = new Set((portfolio.holdings || []).filter((item) => Number(item.shares || 0) > 0).map((item) => item.instrument_id));
  return instruments.filter((item) => heldIds.has(item.instrument_id));
};

const goalOptionsForBuy = (goals = []) => goals.filter((goal) => goal.status === "active" && ["investment", "mixed"].includes(goal.funding_mode) && goal.can_invest !== false).map((goal) => ({ value: goal.goal_id, label: goal.name, meta: `Sisa Rp ${Number(goal.remaining_amount || 0).toLocaleString("id-ID")}`, icon: TargetIcon }));
const allocationForGoal = (holding, goalId) => (holding?.goal_allocations || []).find((item) => item.goal_id === goalId && Number(item.shares || 0) > 0) || null;
const goalOptionsForSell = (goals = [], holding) => (holding?.goal_allocations || []).filter((allocation) => Number(allocation.shares || 0) > 0).map((allocation) => {
  const goal = goals.find((item) => item.goal_id === allocation.goal_id);
  return { value: allocation.goal_id, label: goal?.name || allocation.goal_name || "Target", meta: `${Number(allocation.shares || 0).toLocaleString("id-ID")} lembar/unit terhubung`, icon: TargetIcon };
});

const availableShares = (holding, goalId) => {
  if (!holding) return 0;
  if (goalId) return Number(allocationForGoal(holding, goalId)?.shares || 0);
  return Number(holding.unallocated_shares ?? holding.shares ?? 0);
};

const SellAvailabilityHint = ({ holding, instrument, goalId }) => {
  if (!holding) return null;
  const shares = availableShares(holding, goalId);
  if (isMutualFundInstrument(instrument || holding)) return <small className={formStyles.formHint}>Tersedia {shares.toLocaleString("id-ID")} unit {goalId ? "untuk Target ini" : "yang belum terhubung ke Target"}.</small>;
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);
  const lots = shares / Math.max(1, lotSize);
  return <small className={formStyles.formHint}>Tersedia {lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot {goalId ? "untuk Target ini" : "yang belum terhubung ke Target"}.</small>;
};

const GoalTradeField = ({ mode, form, onFieldChange, goals, holding, error }) => {
  const options = mode === "buy" ? goalOptionsForBuy(goals) : goalOptionsForSell(goals, holding);
  const placeholder = mode === "buy" ? "Tidak terkait Target" : "Dari aset bebas (di luar Target)";
  return <>
    {mode === "sell" && (holding?.goal_allocations || []).some((entry) => Number(entry.shares || 0) > 0) ? <p className={formStyles.formHint}>Pilih sumber penjualan. Unit yang masuk Target tidak ikut dijual dari aset bebas.</p> : null}
    {(mode === "buy" || options.length > 0) ? <InlineSelectionPicker className={formStyles.field} label={mode === "sell" ? "Sumber aset yang dijual" : "Untuk Target (opsional)"} error={error} value={form.goal_id || ""} onChange={(value) => onFieldChange("goal_id", value)} placeholder={placeholder} placeholderOption={{ icon: TargetIcon }} searchable={options.length > 8} options={options} /> : null}
    {mode === "buy" && form.goal_id ? <CompactNotice tone="info" title="Pembelian terhubung Target">Nilai pasar aset ini akan ikut menjadi progress Target. Tidak dibuat catatan tabungan kedua.</CompactNotice> : null}
    {mode === "sell" && form.goal_id ? <VisualChoiceGroup legend="Hasil penjualan" name="investment-goal-sale-proceeds" value={form.retain_for_goal === false ? "release" : "retain"} onChange={(value) => onFieldChange("retain_for_goal", value === "retain")} columns={2} compact options={[{ value: "retain", label: "Tetap untuk Target", description: "Hasil jual tetap dihitung sebagai dana Target", icon: TargetIcon }, { value: "release", label: "Lepaskan dari Target", description: "Hasil jual tidak lagi menjadi progress Target", icon: TargetIcon }]} /> : null}
  </>;
};

const SellQuickActions = ({ mode, holding, instrument, goalId, onFieldChange }) => {
  if (mode !== "sell" || !holding) return null;
  const mutualFund = isMutualFundInstrument(instrument || holding);
  const choices = [{ fraction: .25, label: "25%" }, { fraction: .5, label: "50%" }, { fraction: 1, label: "Jual semua tersedia" }];
  return <div className={formStyles.sellQuick} role="group" aria-label="Jumlah cepat penjualan">
    {choices.map(({ fraction, label }) => {
      const quantity = investmentSellQuickQuantity(holding, instrument || holding, goalId, fraction);
      return <button type="button" key={label} disabled={quantity <= 0} onClick={() => onFieldChange("lots", String(quantity))} aria-label={`${label}: ${quantity.toLocaleString("id-ID")} ${mutualFund ? "unit" : "lot"}`}>{label}</button>;
    })}
  </div>;
};

const TradeQuantityField = ({ mutualFund, form, onFieldChange, errors }) => <div className={formStyles.formRow}>
  <InvestmentFormField id="investment-lots" label={mutualFund ? "Unit" : "Lot"} required error={errors.lots}>
    {mutualFund
      ? <InvestmentDecimalInput value={form.lots} onChange={(value) => onFieldChange("lots", value)} />
      : <input min="1" step="1" inputMode="numeric" type="number" value={form.lots} onChange={(event) => onFieldChange("lots", event.target.value)} />}
  </InvestmentFormField>
</div>;

const TradePriceField = ({ mutualFund, form, onFieldChange, errors }) => mutualFund
  ? <InvestmentFormField id="investment-trade-price" label="NAB per unit" required error={errors.price_per_share}><InvestmentDecimalInput value={form.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} /></InvestmentFormField>
  : <MoneyInput id="investment-trade-price" label="Harga per saham" required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />;

const TradeReferencePrice = ({ holding, onFieldChange }) => {
  if (!holding || Number(holding.price_per_share || 0) <= 0) return null;
  return <div className={formStyles.referencePrice}>
    <span>Referensi tersimpan{holding.valuation_date ? ` · ${formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}` : ""} · bukan harga live</span>
    <button type="button" onClick={() => onFieldChange("price_per_share", String(holding.price_per_share))} aria-label="Gunakan harga referensi yang tersimpan"><InvestmentUnitPrice value={holding.price_per_share} /> <span>Gunakan</span></button>
  </div>;
};

const TradeAdditionalDetails = ({ form, onFieldChange, errors }) => <details className={formStyles.setupOptional}>
  <summary>Detail transaksi{form.fee_amount || form.notes || form.trade_date !== TODAY() ? " · Disesuaikan" : ""}</summary>
  <InvestmentFormField id="investment-trade-date" label="Tanggal" required error={errors.trade_date}><TemporalInput type="date" max={TODAY()} value={form.trade_date} onChange={(event) => onFieldChange("trade_date", event.target.value)} /></InvestmentFormField>
  <MoneyInput id="investment-trade-fee" label="Biaya broker (opsional)" value={form.fee_amount || ""} error={errors.fee_amount} onChange={(value) => onFieldChange("fee_amount", value)} />
  <NotesField value={form.notes} error={errors.notes} onChange={(value) => onFieldChange("notes", value)} />
</details>;

const TradeBuyAveragePreview = ({ mode, instrument, mutualFund, form, instruments, portfolio }) => {
  if (mode !== "buy" || !instrument) return null;
  const average = investmentProjectedAverage(form, instruments, portfolio);
  return <div className={formStyles.averagePreview} role="status">
    <span>{mutualFund ? "Average nilai/unit" : "Average harga/lembar"}</span>
    <strong><InvestmentUnitPrice value={average.nextAverage} /></strong>
    <small>{average.currentShares > 0 ? <>Sebelum pembelian <InvestmentUnitPrice value={average.currentAverage} /></> : "Posisi baru"}</small>
  </div>;
};

const TradeAmountPreview = ({ mode, form, instruments, portfolio, instrument }) => {
  if (!instrument || Number(form.lots) <= 0 || Number(form.price_per_share) <= 0) return null;
  return <div className={formStyles.tradeImpact} role="status">
    <span>{mode === "sell" ? "Estimasi bersih penjualan" : "Estimasi total beli"}</span>
    <strong><Money value={investmentTradePreview(mode, form, instruments).rdnAmount} /></strong>
    <small>{Number(portfolio.is_system_hidden || 0) ? "Hanya pencatatan posisi" : "Periksa kembali angka sebelum simpan"}</small>
  </div>;
};

const TradeFields = ({ mode, form, onFieldChange, instruments, portfolio, goals, errors }) => {
  const selectable = tradeSelectableInstruments(mode, instruments, portfolio);
  const holding = (portfolio.holdings || []).find((item) => item.instrument_id === form.instrument_id) || null;
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || holding || {});
  return <>
    <InstrumentField form={form} onFieldChange={onFieldChange} instruments={selectable} error={errors.instrument_id} />
    <GoalTradeField mode={mode} form={form} onFieldChange={onFieldChange} goals={goals} holding={holding} error={errors.goal_id} />
    <SellQuickActions mode={mode} holding={holding} instrument={instrument} goalId={form.goal_id} onFieldChange={onFieldChange} />
    <TradeQuantityField mutualFund={mutualFund} form={form} onFieldChange={onFieldChange} errors={errors} />
    <TradePriceField mutualFund={mutualFund} form={form} onFieldChange={onFieldChange} errors={errors} />
    <TradeReferencePrice holding={holding} onFieldChange={onFieldChange} />
    <TradeAdditionalDetails form={form} onFieldChange={onFieldChange} errors={errors} />
    <TradeBuyAveragePreview mode={mode} instrument={instrument} mutualFund={mutualFund} form={form} instruments={instruments} portfolio={portfolio} />
    {mode === "buy" ? <small className={formStyles.formHint}>{Number(portfolio.is_system_hidden || 0) === 0 ? "Pembelian mengurangi cash RDN tercatat. Pastikan saldo RDN mencukupi." : "Pembelian pada aset dengan rekening internal hanya menambah catatan posisi investasi, tanpa mengubah saldo bank."}</small> : null}
    {mode === "sell" ? <SellAvailabilityHint holding={holding} instrument={instrument} goalId={form.goal_id} /> : null}
    <TradeAmountPreview mode={mode} form={form} instruments={instruments} portfolio={portfolio} instrument={instrument} />
  </>;
};

const TradeReviewBaseRows = ({ mode, form, preview, mutualFund, portfolio, goal }) => {
  const cashLabel = Number(portfolio.is_system_hidden || 0) === 0
    ? (mode === "buy" ? "Total pengurang RDN" : "Bersih masuk RDN") : "Nilai bersih tercatat";
  return <>
    <div><dt>Aset</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
    <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} {mutualFund ? "unit" : "lot"}</dd></div>
    <div><dt>{mutualFund ? "Nilai per unit" : "Harga per saham"}</dt><dd><InvestmentUnitPrice value={preview.pricePerShare} /></dd></div>
    <div><dt>Nilai transaksi</dt><dd><Money value={preview.grossAmount} /></dd></div>
    <div><dt>Biaya broker {form.fee_amount ? "tercatat" : "belum diisi"}</dt><dd>{form.fee_amount ? <Money value={preview.feeAmount} /> : "—"}</dd></div>
    <div><dt>{cashLabel}</dt><dd><Money value={preview.rdnAmount} /></dd></div>
    <div><dt>Target</dt><dd>{goal ? goal.name : "Tidak terkait Target"}</dd></div>
    {mode === "sell" && goal ? <div><dt>Hasil penjualan</dt><dd>{form.retain_for_goal === false ? "Lepaskan dari Target" : "Tetap untuk Target"}</dd></div> : null}
  </>;
};

const TradeReviewPositionRows = ({ mode, form, instruments, portfolio, preview, impact, mutualFund }) => {
  if (mode === "buy") {
    const average = investmentProjectedAverage(form, instruments, portfolio);
    return <>
      <div><dt>{mutualFund ? "Average nilai/unit setelah beli" : "Average harga/lembar setelah beli"}</dt><dd><InvestmentUnitPrice value={average.nextAverage} /></dd></div>
      <div><dt>Kepemilikan setelah beli</dt><dd>{(mutualFund ? impact.remainingShares : impact.remainingShares / preview.lotSize).toLocaleString("id-ID", { maximumFractionDigits: 2 })} {mutualFund ? "unit" : "lot"}</dd></div>
    </>;
  }
  if (mode !== "sell") return null;
  return <>
    <div><dt>Sisa kepemilikan setelah jual</dt><dd>{(mutualFund ? impact.remainingShares : impact.remainingShares / preview.lotSize).toLocaleString("id-ID", { maximumFractionDigits: 2 })} {mutualFund ? "unit" : "lot"}</dd></div>
    <div><dt>Modal yang dilepas (estimasi)</dt><dd><Money value={impact.releasedCost} /></dd></div>
    <div><dt>Hasil terealisasi (estimasi)</dt><dd><Money value={impact.realizedPl} /></dd></div>
  </>;
};

const TradeReview = ({ mode, form, instruments, portfolio, goals }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  const mutualFund = isMutualFundInstrument(preview.instrument || {});
  const goal = goals.find((item) => item.goal_id === form.goal_id) || null;
  const impact = investmentTradeImpact(mode, form, instruments, portfolio);
  const cashNote = Number(portfolio.is_system_hidden || 0) !== 0
    ? "Ini hanya pencatatan posisi manual; saldo bank tidak berubah."
    : mode === "buy"
      ? "Cash RDN tercatat akan berkurang sebesar nilai bersih transaksi."
      : "Cash RDN tercatat akan bertambah sebesar nilai bersih transaksi.";
  return <section className={formStyles.review} aria-labelledby="investment-trade-review-title"><div>
    <h3 id="investment-trade-review-title">Tinjau catatan sebelum disimpan</h3>
    <p className={formStyles.notice}>Saldo Bersama tidak mengirim order ke broker. {cashNote}</p>
  </div><dl className={formStyles.reviewGrid}>
    <TradeReviewBaseRows mode={mode} form={form} preview={preview} mutualFund={mutualFund} portfolio={portfolio} goal={goal} />
    <TradeReviewPositionRows mode={mode} form={form} instruments={instruments} portfolio={portfolio} preview={preview} impact={impact} mutualFund={mutualFund} />
    {impact.cashChanges ? <div><dt>Saldo RDN tercatat setelah {mode === "sell" ? "jual" : "beli"}</dt><dd><Money value={impact.afterCash} /></dd></div> : null}
    <div><dt>Tanggal</dt><dd>{formatDateLongIndonesia(form.trade_date) || form.trade_date}</dd></div>
    {form.notes ? <div><dt>Catatan</dt><dd>{form.notes}</dd></div> : null}
  </dl></section>;
};

const PriceFields = ({ form, onFieldChange, instruments, errors }) => {
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const mutualFund = isMutualFundInstrument(instrument || {});
  return <><InstrumentField form={form} onFieldChange={onFieldChange} instruments={instruments} error={errors.instrument_id} />{mutualFund ? <InvestmentFormField id="investment-price" label="NAB per unit" required error={errors.price_per_share}><InvestmentDecimalInput value={form.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} /></InvestmentFormField> : <MoneyInput id="investment-price" label="Harga per saham" required value={form.price_per_share || ""} error={errors.price_per_share} onChange={(value) => onFieldChange("price_per_share", value)} />}<details className={formStyles.setupOptional}><summary>Sesuaikan dengan nilai broker{form.market_value ? " · Terisi" : ""}</summary><MoneyInput id="investment-market-value" label="Total nilai saat ini dari broker (opsional)" value={form.market_value || ""} error={errors.market_value} onChange={(value) => onFieldChange("market_value", value)} /></details><InvestmentFormField id="investment-valuation-date" label="Tanggal nilai" required error={errors.valuation_date}><TemporalInput type="date" max={TODAY()} value={form.valuation_date} onChange={(event) => onFieldChange("valuation_date", event.target.value)} /></InvestmentFormField><small className={formStyles.formHint}>Nilai ini menggantikan referensi manual terakhir untuk menghitung nilai aset. Tidak ada transaksi yang dibuat.</small></>;
};

const dialogTitle = (mode) => ({ buy: "Catat pembelian", sell: "Catat penjualan", price: "Perbarui nilai" })[mode] || "Catat investasi";
const dialogDescription = (mode) => ({ buy: "Tambahkan pembelian ke posisi aset. Bisa ditautkan langsung ke Target.", sell: "Kurangi posisi aset dan tentukan apakah hasil jual tetap menjadi dana Target.", price: "Perbarui harga atau nilai manual terakhir tanpa membuat transaksi." })[mode] || "Perbarui catatan investasi.";

const initialForm = ({ initialInstrumentId, initialDraft, initialGoalId }) => ({ trade_date: TODAY(), valuation_date: TODAY(), lots: 1, price_per_share: "", fee_amount: "", market_value: "", instrument_id: initialInstrumentId || "", goal_id: initialGoalId || "", retain_for_goal: true, notes: "", ...(initialDraft && typeof initialDraft === "object" ? initialDraft : {}) });
const payloadForMode = (mode, form, portfolioId) => {
  if (mode === "price") return { portfolio_id: portfolioId, instrument_id: form.instrument_id, price_per_share: Number(form.price_per_share), ...(form.market_value !== "" && form.market_value != null ? { market_value: Number(form.market_value) } : {}), valuation_date: form.valuation_date };
  return { portfolio_id: portfolioId, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date, notes: form.notes || "", ...(form.goal_id ? { goal_id: form.goal_id } : {}), ...(mode === "sell" && form.goal_id ? { retain_for_goal: form.retain_for_goal !== false } : {}) };
};
const actionForMode = (mode) => mode === "buy" ? buyInvestment : mode === "sell" ? sellInvestment : updateInvestmentValuation;

const InvestmentDialogFooter = ({ reviewing, busy, outcomeUnknown, isTrade, onEdit, onCancel }) => <>{reviewing ? <Button type="button" onClick={onEdit} disabled={busy || outcomeUnknown}>Ubah</Button> : <Button type="button" onClick={onCancel} disabled={busy || outcomeUnknown}>Batal</Button>}<Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{outcomeUnknown ? "Coba lagi data yang sama" : reviewing ? "Simpan catatan" : isTrade ? "Tinjau" : "Simpan nilai"}</Button></>;

const useInvestmentDialogController = ({ mode, portfolio, instruments, goals, userRole, initialInstrumentId, initialDraft, initialGoalId, onClose, onSuccess }) => {
  const formRef = useRef(null);
  const [form, setForm] = useState(() => {
    const next = initialForm({ initialInstrumentId, initialDraft, initialGoalId });
    const selected = (portfolio?.holdings || []).find((item) => item.instrument_id === next.instrument_id);
    if (mode === "sell" && !next.goal_id && selected && Number(selected.unallocated_shares ?? selected.shares ?? 0) <= 0) {
      const availableGoal = (selected.goal_allocations || []).find((entry) => Number(entry.shares || 0) > 0);
      if (availableGoal) next.goal_id = availableGoal.goal_id;
    }
    return next;
  });
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
    setForm((current) => {
      if (key !== "instrument_id" || mode !== "sell") return { ...current, [key]: value };
      const nextHolding = (portfolio?.holdings || []).find((entry) => entry.instrument_id === value);
      const availableGoal = nextHolding && Number(nextHolding.unallocated_shares ?? nextHolding.shares ?? 0) <= 0
        ? (nextHolding.goal_allocations || []).find((entry) => Number(entry.shares || 0) > 0)
        : null;
      return { ...current, instrument_id: value, goal_id: availableGoal?.goal_id || "", lots: "" };
    });
    setFieldErrors((current) => current[key] ? Object.fromEntries(Object.entries(current).filter(([name]) => name !== key && name !== "_form")) : current);
    setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const next = validateInvestmentOperation(mode, form, { instruments, portfolio, goals, userRole });
    setFieldErrors(next);
    if (!reviewing && Object.keys(next).length) { globalThis.requestAnimationFrame?.(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus()); return; }
    if (isTrade && !reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      const result = await actionForMode(mode)(payloadForMode(mode, form, portfolio.portfolio_id), portfolio.row_version);
      setOutcomeUnknown(false); invalidateInvestmentReads(); onSuccess?.(mode, portfolio, result, form.instrument_id); onClose();
    } catch (caught) { setOutcomeUnknown(isOutcomeUnknownError(caught)); setError(caught?.message || "Catatan investasi belum berhasil disimpan."); } finally { setBusy(false); }
  };
  return { formRef, form, busy, error, fieldErrors, reviewing, setReviewing, outcomeUnknown, isTrade, activeInstruments, sellInstruments, priceInstruments, onFieldChange, submit };
};

const InvestmentDialogBody = ({ mode, portfolio, goals, state }) => {
  if (state.reviewing) return <TradeReview mode={mode} form={state.form} instruments={mode === "buy" ? state.activeInstruments : state.sellInstruments} portfolio={portfolio} goals={goals} />;
  if (mode === "price") return <fieldset className={formStyles.intentFieldset} disabled={state.outcomeUnknown}><PriceFields form={state.form} onFieldChange={state.onFieldChange} instruments={state.priceInstruments} errors={state.fieldErrors} /></fieldset>;
  return <fieldset className={formStyles.intentFieldset} disabled={state.outcomeUnknown}><TradeFields mode={mode} form={state.form} onFieldChange={state.onFieldChange} instruments={mode === "buy" ? state.activeInstruments : state.sellInstruments} portfolio={portfolio} goals={goals} errors={state.fieldErrors} /></fieldset>;
};

const InvestmentDialog = ({ mode, portfolio, instruments, goals = [], userRole, initialInstrumentId = "", initialDraft = null, initialGoalId = "", onClose, onSuccess }) => {
  const state = useInvestmentDialogController({ mode, portfolio, instruments, goals, userRole, initialInstrumentId, initialDraft, initialGoalId, onClose, onSuccess });
  const guard = useUnsavedChangesGuard({ open: Boolean(mode && portfolio), value: state.form, onClose, blocked: state.busy || state.outcomeUnknown });
  if (!mode || !portfolio) return null;
  return <Modal open title={dialogTitle(mode)} description={dialogDescription(mode)} onClose={state.busy || state.outcomeUnknown ? undefined : guard.requestClose} discardGuard={guard} discardSubject="catatan investasi" dismissible={!state.busy && !state.outcomeUnknown} footer={<InvestmentDialogFooter reviewing={state.reviewing} busy={state.busy} outcomeUnknown={state.outcomeUnknown} isTrade={state.isTrade} onEdit={() => state.setReviewing(false)} onCancel={guard.discardAndClose} />}>
    <form ref={state.formRef} id="investment-dialog-form" className={formStyles.form} onSubmit={state.submit} noValidate>
      {state.fieldErrors._form ? <div className="notice notice--danger" role="alert">{state.fieldErrors._form}</div> : null}
      {state.error ? <div className={`notice ${state.outcomeUnknown ? "notice--warning" : "notice--danger"}`} role="alert">{state.error}</div> : null}
      {state.outcomeUnknown ? <p className={formStyles.intentGuard} role="status">Data dikunci sementara. Jangan ubah aset, nominal, tanggal, atau jumlah. Tekan “Coba lagi data yang sama” untuk memverifikasi hasil tanpa menggandakan catatan.</p> : null}
      <InvestmentDialogBody mode={mode} portfolio={portfolio} goals={goals} state={state} />
    </form>
  </Modal>;
};

export default InvestmentDialog;
