import { useEffect, useMemo, useRef, useState } from "react";
import { FiLink2, FiMinusCircle, FiTrendingUp } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import CompactNotice from "../../../components/common/CompactNotice.jsx";
import InlineSelectionPicker from "../../../components/common/InlineSelectionPicker.jsx";
import Modal from "../../../components/common/Modal.jsx";
import Money from "../../../components/common/Money.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import TemporalInput from "../../../components/common/TemporalInput.jsx";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { AccountIcon, CashIcon, InvestmentIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { accountOptionVisual, instrumentOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { assertPositiveRupiah, formatRupiah } from "../../../domain/money.js";
import { todayInJakarta } from "../../../domain/dates.js";
import { useGuardedMutation } from "../../../hooks/useGuardedMutation.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { isMutualFundInstrument } from "../../../shared/presentation/investmentAssets.js";
import { allocateGoalInvestment, moveGoal, releaseGoalInvestment } from "../goals.api.js";

const directRoute = (routes, sourceId, destinationId) => (routes || []).find((route) => route.source_account_id === sourceId && route.destination_account_id === destinationId && route.mode === "direct");

const goalFundingOptions = (goal) => {
  const mode = String(goal?.funding_mode || "cash");
  const options = [];
  if (["cash", "mixed"].includes(mode)) options.push({ value: "cash", label: "Rekening", description: "Simpan sebagai dana tunai", icon: CashIcon });
  if (["investment", "mixed"].includes(mode)) options.push({ value: "investment", label: "Investasi", description: "Gunakan saham atau reksa dana", icon: InvestmentIcon });
  return options;
};

const investmentActionOptions = (hasLinkedInvestment) => [
  { value: "buy", label: "Beli baru", description: "Catat pembelian langsung untuk Target", icon: FiTrendingUp },
  { value: "link", label: "Hubungkan aset", description: "Pakai investasi yang sudah dimiliki", icon: FiLink2 },
  ...(hasLinkedInvestment ? [{ value: "release", label: "Lepaskan", description: "Keluarkan aset/dana dari Target", icon: FiMinusCircle }] : []),
];

const investmentSourceOptions = (portfolios) => portfolios.map((portfolio) => ({
  value: portfolio.portfolio_id,
  label: portfolio.name || "Sumber investasi",
  meta: portfolio.market_value ? `Nilai tercatat ${formatRupiah(portfolio.market_value)}` : "Sumber investasi",
  icon: InvestmentIcon,
}));

const holdingLabel = (holding) => `${holding.ticker || holding.name || "Aset"}${holding.name && holding.ticker ? ` · ${holding.name}` : ""}`;
const holdingOptions = (holdings) => holdings.map((holding) => ({
  value: holding.instrument_id,
  label: holdingLabel(holding),
  meta: `Belum terkait Target ${Number(holding.unallocated_shares || 0).toLocaleString("id-ID")} lembar/unit`,
  ...instrumentOptionVisual(holding),
}));

const linkedHoldingOptions = (holdings) => holdings.map((holding) => ({
  value: `${holding.portfolio_id}:${holding.instrument_id}`,
  label: holdingLabel(holding),
  meta: `Terhubung ${Number(holding.shares || 0).toLocaleString("id-ID")} lembar/unit · ${formatRupiah(holding.market_value || 0)}`,
  ...instrumentOptionVisual(holding),
}));

const retainedCashByPortfolio = (investmentOverview, goalId) => {
  const values = [];
  for (const portfolio of investmentOverview?.portfolios || []) {
    const amount = (portfolio.goal_allocations || [])
      .filter((allocation) => allocation.goal_id === goalId)
      .reduce((sum, allocation) => sum + Number(allocation.retained_cash || 0), 0);
    if (amount > 0) values.push({ portfolio, amount });
  }
  return values;
};

const CashFundingForm = ({ goal, accounts, transferRoutes, initialSourceAccountId, suggestedAmount, manualAmount, busy, error, onSubmit }) => {
  const compatibleAccounts = useMemo(() => (accounts || []).filter((account) => account.account_id !== goal.account_id && directRoute(transferRoutes, account.account_id, goal.account_id)), [accounts, goal.account_id, transferRoutes]);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Menabung untuk Target");
  const [date, setDate] = useState(todayInJakarta());
  const [fieldErrors, setFieldErrors] = useState({});
  const amountRef = useRef(null);

  useEffect(() => {
    const source = compatibleAccounts.some((account) => account.account_id === initialSourceAccountId)
      ? initialSourceAccountId
      : compatibleAccounts.length === 1 ? compatibleAccounts[0].account_id : "";
    setSourceAccountId(source);
    const remaining = Math.max(0, Number(goal.remaining_amount || 0));
    const preferred = manualAmount ? 0 : Math.max(0, Number(suggestedAmount || goal.required_monthly_amount || 0));
    setAmount(String(Math.min(remaining, preferred) || ""));
  }, [compatibleAccounts, goal.goal_id, goal.remaining_amount, goal.required_monthly_amount, initialSourceAccountId, manualAmount, suggestedAmount]);

  const submit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    let value = 0;
    if (!sourceAccountId) nextErrors.sourceAccountId = "Pilih rekening sumber.";
    try { value = assertPositiveRupiah(amount); }
    catch { nextErrors.amount = "Masukkan nominal tabungan yang valid."; }
    if (!nextErrors.amount && value > Number(goal.remaining_amount || 0)) nextErrors.amount = `Maksimal ${formatRupiah(goal.remaining_amount || 0)} sesuai sisa Target.`;
    const sourceAccount = compatibleAccounts.find((account) => account.account_id === sourceAccountId) || null;
    const sourceAvailable = Number(sourceAccount?.available_balance ?? sourceAccount?.balance ?? 0);
    if (!nextErrors.amount && sourceAccount && value > sourceAvailable) nextErrors.amount = `Dana rekening hanya ${formatRupiah(sourceAvailable)}.`;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.amount) amountRef.current?.focus({ preventScroll: false });
      return;
    }
    return onSubmit({
      goal_id: goal.goal_id,
      movement_type: "deposit",
      amount: value,
      source_account_id: sourceAccountId,
      destination_account_id: goal.account_id,
      transaction_date: date,
      reason: reason.trim() || `Menabung untuk ${goal.name}`,
    }, value);
  };

  return <form id="goal-funding-cash" className="form-grid" onSubmit={submit}>
    <CompactNotice className="form-grid__full" tone="info" title="Satu pencatatan">Transfer ini langsung menjadi progres tunai Target. Tidak dibuat catatan keuangan kedua, sehingga progress tidak dihitung ganda.</CompactNotice>
    <InlineSelectionPicker className="form-grid__full" label="Dari rekening" required value={sourceAccountId} onChange={(value) => { setSourceAccountId(value); setFieldErrors((current) => ({ ...current, sourceAccountId: "" })); }} error={fieldErrors.sourceAccountId || ""} placeholder="Pilih rekening sumber" placeholderOption={{ icon: AccountIcon }} options={compatibleAccounts.map((account) => ({ value: account.account_id, label: accountDisplayLabel(account), meta: `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`, ...accountOptionVisual(account) }))} />
    <MoneyInput ref={amountRef} id="goal-funding-amount" label="Nominal ditabung" required value={amount} error={fieldErrors.amount || ""} onChange={(value) => { setAmount(value); setFieldErrors((current) => ({ ...current, amount: "" })); }} />
    <label className="field"><span>Tanggal *</span><TemporalInput required type="date" max={todayInJakarta()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    <label className="field form-grid__full"><span>Catatan</span><input maxLength="180" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {sourceAccountId && amount ? (() => { const source = compatibleAccounts.find((account) => account.account_id === sourceAccountId); const current = Number(source?.available_balance ?? source?.balance ?? 0); const value = Number(amount || 0); return source && value > 0 && value <= current && value <= Number(goal.remaining_amount || 0) ? <div className="notice notice--neutral form-grid__full">Rekening {formatRupiah(current)} → {formatRupiah(current - value)} · Target {formatRupiah(goal.current_amount || 0)} → {formatRupiah(Number(goal.current_amount || 0) + value)}</div> : null; })() : null}
    <div className="notice notice--neutral form-grid__full">Sisa Target <Money value={goal.remaining_amount || 0} />.</div>
    {!compatibleAccounts.length ? <CompactNotice className="form-grid__full" tone="warning" title="Belum ada rekening sumber">Tambahkan rekening Bersama lain yang dapat mentransfer ke rekening Target.</CompactNotice> : null}
    {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
    <div className="form-actions form-grid__full"><Button type="submit" variant="primary" loading={busy} disabled={!compatibleAccounts.length}>Tambah dana</Button></div>
  </form>;
};

// Buy, link, and release share state so investment funding stays atomic inside one Target workflow.
// eslint-disable-next-line complexity, max-lines-per-function
const InvestmentFundingForm = ({ goal, investmentOverview, initialAction = "buy", busy, error, onBuy, onAllocate, onRelease }) => {
  const allPortfolios = investmentOverview?.portfolios || [];
  const portfolios = allPortfolios.filter((item) => item.can_operate !== false && item.owner_scope === goal.scope && String(item.owner_user_id || "") === String(goal.owner_user_id || ""));
  const linkedHoldings = goal.investment_holdings || [];
  const retained = retainedCashByPortfolio(investmentOverview, goal.goal_id);
  const hasLinkedInvestment = linkedHoldings.some((item) => Number(item.shares || 0) > 0) || retained.some((item) => item.amount > 0);
  const [action, setAction] = useState(initialAction);
  const [portfolioId, setPortfolioId] = useState("");
  const [instrumentId, setInstrumentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [releaseRef, setReleaseRef] = useState("");
  const [releaseCashPortfolioId, setReleaseCashPortfolioId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [date, setDate] = useState(todayInJakarta());
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!investmentActionOptions(hasLinkedInvestment).some((item) => item.value === action)) setAction("buy");
  }, [action, hasLinkedInvestment]);
  useEffect(() => {
    if (!portfolios.some((item) => item.portfolio_id === portfolioId)) setPortfolioId(portfolios.length === 1 ? portfolios[0].portfolio_id : "");
  }, [portfolioId, portfolios]);

  const portfolio = portfolios.find((item) => item.portfolio_id === portfolioId) || null;
  const availableHoldings = (portfolio?.holdings || []).filter((holding) => Number(holding.unallocated_shares || 0) > 0);
  const allocatableHoldings = portfolios.flatMap((source) => (source.holdings || [])
    .filter((item) => Number(item.unallocated_shares || 0) > 0)
    .map((item) => ({ ...item, portfolio_id: source.portfolio_id, source_name: source.name || "Sumber investasi" })));
  const selectedHoldingRef = instrumentId ? `${portfolioId}:${instrumentId}` : "";
  const holding = availableHoldings.find((item) => item.instrument_id === instrumentId) || null;
  const mutualFund = isMutualFundInstrument(holding || {});
  const lotSize = Math.max(1, Number(holding?.lot_size || 100));
  const maxQuantity = holding ? (mutualFund ? Number(holding.unallocated_shares || 0) : Math.floor(Number(holding.unallocated_shares || 0) / lotSize)) : 0;

  const releaseHolding = linkedHoldings.find((item) => `${item.portfolio_id}:${item.instrument_id}` === releaseRef) || null;
  const releaseMutualFund = isMutualFundInstrument(releaseHolding || {});
  const releaseLotSize = Math.max(1, Number(releaseHolding?.lot_size || 100));
  const maxReleaseQuantity = releaseHolding ? (releaseMutualFund ? Number(releaseHolding.shares || 0) : Math.floor(Number(releaseHolding.shares || 0) / releaseLotSize)) : 0;

  const submitLink = async (event) => {
    event.preventDefault();
    const normalized = Number(quantity);
    const nextErrors = {};
    if (!portfolioId || !instrumentId) nextErrors.holding = "Pilih aset investasi yang ingin dihubungkan.";
    if (!nextErrors.holding && (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > maxQuantity)) nextErrors.quantity = `Jumlah harus 1–${maxQuantity.toLocaleString("id-ID")} ${mutualFund ? "unit" : "lot"}.`;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const shares = mutualFund ? normalized : normalized * lotSize;
    return onAllocate({ goal_id: goal.goal_id, portfolio_id: portfolioId, instrument_id: instrumentId, shares, event_date: date, reason: `Ditautkan ke Target ${goal.name}` });
  };

  const submitReleaseHolding = async (event) => {
    event.preventDefault();
    const normalized = Number(quantity);
    const nextErrors = {};
    if (!releaseHolding) nextErrors.releaseHolding = "Pilih aset investasi yang ingin dilepaskan.";
    if (!nextErrors.releaseHolding && (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > maxReleaseQuantity)) nextErrors.releaseQuantity = `Jumlah harus 1–${maxReleaseQuantity.toLocaleString("id-ID")} ${releaseMutualFund ? "unit" : "lot"}.`;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const shares = releaseMutualFund ? normalized : normalized * releaseLotSize;
    return onRelease({ goal_id: goal.goal_id, portfolio_id: releaseHolding.portfolio_id, instrument_id: releaseHolding.instrument_id, shares, event_date: date, reason: `Dilepas dari Target ${goal.name}` });
  };

  const submitReleaseCash = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    let normalized = 0;
    if (!releaseCashPortfolioId) nextErrors.releaseCashSource = "Pilih sumber dana hasil penjualan.";
    try { normalized = assertPositiveRupiah(cashAmount); }
    catch { nextErrors.cashAmount = "Masukkan nominal yang valid."; }
    const available = retained.find((item) => item.portfolio.portfolio_id === releaseCashPortfolioId)?.amount || 0;
    if (!nextErrors.cashAmount && releaseCashPortfolioId && normalized > available) nextErrors.cashAmount = `Maksimal ${formatRupiah(available)} sesuai dana hasil penjualan yang tersedia.`;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    return onRelease({ goal_id: goal.goal_id, portfolio_id: releaseCashPortfolioId, cash_amount: normalized, event_date: date, reason: `Dana hasil jual dilepas dari Target ${goal.name}` });
  };

  if (!portfolios.length) return <div className="page-stack page-stack--compact"><CompactNotice tone="warning" title="Belum ada investasi Bersama">Tambahkan sumber dan aset investasi Bersama terlebih dahulu, lalu kembali ke Target.</CompactNotice>{error ? <div className="notice notice--danger" role="alert">{error.message}</div> : null}<Button type="button" variant="primary" onClick={() => onBuy(null)}>Buka Investasi</Button></div>;

  return <div className="page-stack page-stack--compact">
    <VisualChoiceGroup legend="Apa yang ingin dilakukan?" name={`goal-investment-action-${goal.goal_id}`} value={action} onChange={(next) => { setAction(next); setQuantity(""); setFieldErrors({}); }} options={investmentActionOptions(hasLinkedInvestment)} columns={hasLinkedInvestment ? 3 : 2} compact />
    {action === "buy" ? <div className="form-grid">
      <CompactNotice className="form-grid__full" tone="info" title="Pembelian untuk Target">Catat pembelian seperti biasa. Pilihan Target akan ikut terisi sehingga nilai pasar langsung menjadi progres.</CompactNotice>
      <InlineSelectionPicker className="form-grid__full" label="Sumber investasi" required value={portfolioId} error={fieldErrors.buySource || ""} onChange={(value) => { setPortfolioId(value); setFieldErrors({}); }} placeholder="Pilih sumber investasi" placeholderOption={{ icon: InvestmentIcon }} options={investmentSourceOptions(portfolios)} />
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
      <div className="form-actions form-grid__full"><Button type="button" variant="primary" onClick={() => { if (!portfolioId) { setFieldErrors({ buySource: "Pilih sumber investasi." }); return; } onBuy(portfolioId); }}>Lanjut catat pembelian</Button></div>
    </div> : null}
    {action === "link" ? <form className="form-grid" onSubmit={submitLink}>
      <InlineSelectionPicker className="form-grid__full" label="Aset yang sudah dimiliki" required value={selectedHoldingRef} error={fieldErrors.holding || ""} onChange={(value) => { const [nextPortfolioId, nextInstrumentId] = String(value).split(":"); setPortfolioId(nextPortfolioId || ""); setInstrumentId(nextInstrumentId || ""); setQuantity(""); setFieldErrors({}); }} placeholder="Pilih aset" searchable options={allocatableHoldings.map((item) => ({ ...holdingOptions([item])[0], value: `${item.portfolio_id}:${item.instrument_id}`, meta: `${holdingOptions([item])[0].meta} · ${item.source_name}` }))} />
      <label className="field"><span>{mutualFund ? "Unit" : "Lot"} ditautkan *</span><input type="number" min="1" max={maxQuantity || undefined} step="1" value={quantity} aria-invalid={Boolean(fieldErrors.quantity) || undefined} aria-describedby={fieldErrors.quantity ? `goal-link-quantity-error-${goal.goal_id}` : undefined} onChange={(event) => { setQuantity(event.target.value); setFieldErrors((current) => ({ ...current, quantity: "" })); }} />{fieldErrors.quantity ? <small id={`goal-link-quantity-error-${goal.goal_id}`} className="field__error">{fieldErrors.quantity}</small> : null}</label>
      <label className="field"><span>Tanggal *</span><TemporalInput required type="date" max={todayInJakarta()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {holding ? <div className="notice notice--neutral form-grid__full">Maksimal {maxQuantity.toLocaleString("id-ID")} {mutualFund ? "unit" : "lot"} yang belum terhubung ke Target lain.</div> : null}
      {portfolioId && !availableHoldings.length ? <CompactNotice className="form-grid__full" tone="info" title="Belum ada aset bebas">Semua kepemilikan pada sumber ini sudah terhubung atau belum memiliki saldo.</CompactNotice> : null}
      {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
      <div className="form-actions form-grid__full"><Button type="submit" variant="primary" loading={busy} disabled={!holding}>Hubungkan ke Target</Button></div>
    </form> : null}
    {action === "release" ? <div className="page-stack page-stack--compact">
      {linkedHoldings.length ? <form className="form-grid" onSubmit={submitReleaseHolding}>
        <InlineSelectionPicker className="form-grid__full" label="Investasi terhubung" required value={releaseRef} error={fieldErrors.releaseHolding || ""} onChange={(value) => { setReleaseRef(value); setQuantity(""); setFieldErrors({}); }} placeholder="Pilih aset" searchable options={linkedHoldingOptions(linkedHoldings)} />
        <label className="field"><span>{releaseMutualFund ? "Unit" : "Lot"} dilepas *</span><input type="number" min="1" max={maxReleaseQuantity || undefined} step="1" value={quantity} aria-invalid={Boolean(fieldErrors.releaseQuantity) || undefined} aria-describedby={fieldErrors.releaseQuantity ? `goal-release-quantity-error-${goal.goal_id}` : undefined} onChange={(event) => { setQuantity(event.target.value); setFieldErrors((current) => ({ ...current, releaseQuantity: "" })); }} />{fieldErrors.releaseQuantity ? <small id={`goal-release-quantity-error-${goal.goal_id}`} className="field__error">{fieldErrors.releaseQuantity}</small> : null}</label>
        <label className="field"><span>Tanggal *</span><TemporalInput required type="date" max={todayInJakarta()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
        <div className="form-actions form-grid__full"><Button type="submit" loading={busy} disabled={!releaseHolding}>Lepaskan aset</Button></div>
      </form> : null}
      {retained.length ? <form className="form-grid" onSubmit={submitReleaseCash}>
        <InlineSelectionPicker className="form-grid__full" label="Dana hasil penjualan" required value={releaseCashPortfolioId} error={fieldErrors.releaseCashSource || ""} onChange={(value) => { setReleaseCashPortfolioId(value); setCashAmount(""); setFieldErrors({}); }} placeholder="Pilih sumber dana" options={retained.map(({ portfolio: item, amount }) => ({ value: item.portfolio_id, label: item.name || "Sumber investasi", meta: `Tersedia ${formatRupiah(amount)}`, icon: InvestmentIcon }))} />
        <MoneyInput id="goal-release-investment-cash" label="Nominal dilepas" required value={cashAmount} error={fieldErrors.cashAmount || ""} onChange={(value) => { setCashAmount(value); setFieldErrors((current) => ({ ...current, cashAmount: "" })); }} />
        <div className="form-actions"><Button type="submit" loading={busy} disabled={!releaseCashPortfolioId}>Lepaskan dana</Button></div>
      </form> : null}
      {!linkedHoldings.length && !retained.length ? <CompactNotice tone="info" title="Tidak ada yang perlu dilepas">Belum ada investasi atau hasil penjualan yang masih terhubung ke Target ini.</CompactNotice> : null}
    </div> : null}
  </div>;
};

const GoalFundingModal = ({ goal, accounts, transferRoutes, investmentOverview, initialSourceAccountId = "", suggestedAmount = 0, manualAmount = false, onClose, onChanged, onBuyInvestment }) => {
  const options = goalFundingOptions(goal);
  const [mode, setMode] = useState(options[0]?.value || "cash");
  const mutation = useGuardedMutation();
  const retryIntentRef = useRef(null);
  const busy = mutation.busy;
  const error = mutation.error;
  const outcomeUnknown = mutation.outcomeUnknown;
  const resetMutation = mutation.reset;

  useEffect(() => {
    const nextOptions = goalFundingOptions(goal);
    if (!nextOptions.some((item) => item.value === mode)) setMode(nextOptions[0]?.value || "cash");
    if (!outcomeUnknown) resetMutation();
  }, [goal, mode, outcomeUnknown, resetMutation]);

  const executeIntent = async (intent) => mutation.run(async () => {
    const result = await intent.request(intent.payload, {});
    await onChanged?.({ result, goal, amount: intent.amount });
    retryIntentRef.current = null;
    return result;
  });

  const run = async (request, payload, amount = 0) => {
    const intent = { request, payload, amount };
    retryIntentRef.current = intent;
    try { return await executeIntent(intent); }
    catch { return null; }
  };

  const retrySameIntent = async () => {
    const intent = retryIntentRef.current;
    if (!intent || mutation.busy) return;
    try { await executeIntent(intent); } catch { /* error is exposed by guarded mutation */ }
  };

  const requestClose = () => {
    if (busy || mutation.outcomeUnknown) return false;
    mutation.reset();
    retryIntentRef.current = null;
    onClose?.();
    return true;
  };

  if (!goal) return null;
  return <Modal open title="Tambah dana Target" description={goal.name} onClose={requestClose} dismissible={!busy && !mutation.outcomeUnknown}>
    <div className="page-stack page-stack--compact">
      {mutation.outcomeUnknown ? <CompactNotice tone="warning" title="Status belum dapat dipastikan">Jangan ubah data dulu. Coba lagi dengan data yang sama agar setoran tidak tercatat ganda.</CompactNotice> : null}
      <fieldset className="mutation-retry-lock" disabled={mutation.outcomeUnknown}>
        <div className="notice notice--neutral"><strong><Money value={goal.current_amount || 0} /></strong> dari <Money value={goal.target_amount || 0} /> · sisa <Money value={goal.remaining_amount || 0} /></div>
        {options.length > 1 ? <VisualChoiceGroup legend="Simpan sebagai" name={`goal-funding-mode-${goal.goal_id}`} value={mode} onChange={(value) => { setMode(value); mutation.reset(); }} options={options} columns={2} compact /> : null}
        {mode === "cash" ? <CashFundingForm goal={goal} accounts={accounts} transferRoutes={transferRoutes} initialSourceAccountId={initialSourceAccountId} suggestedAmount={suggestedAmount} manualAmount={manualAmount} busy={busy} error={error} onSubmit={(payload, amount) => run(moveGoal, payload, amount)} /> : null}
        {mode === "investment" ? <InvestmentFundingForm goal={goal} investmentOverview={investmentOverview} busy={busy} error={error} onBuy={(portfolioId) => onBuyInvestment?.(goal, portfolioId)} onAllocate={(payload) => run(allocateGoalInvestment, payload)} onRelease={(payload) => run(releaseGoalInvestment, payload)} /> : null}
      </fieldset>
      {mutation.outcomeUnknown ? <div className="form-actions"><Button type="button" variant="primary" loading={mutation.busy} onClick={retrySameIntent}>Coba lagi data yang sama</Button></div> : null}
    </div>
  </Modal>;
};
export default GoalFundingModal;
