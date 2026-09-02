import { useMemo, useState } from "react";
import { FiActivity, FiDollarSign, FiEdit3, FiPlus, FiRefreshCw, FiTrendingUp } from "react-icons/fi";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import {
  buyInvestment, correctInvestment, createInvestmentPortfolio, invalidateInvestmentReads, reconcileInvestment, sellInvestment, updateInvestmentValuation, upsertInvestmentInstrument,
} from "./investments.api.js";
import { investmentTradePreview, selectInvestmentInstruments } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const EMPTY_FORM = Object.freeze({});
const tone = (value) => Number(value || 0) > 0 ? styles.positive : Number(value || 0) < 0 ? styles.negative : "";
const FormField = ({ label, children }) => <label className={styles.field}><span>{label}</span>{children}</label>;
const InstrumentField = ({ form, setForm, instruments }) => (
  <FormField label="Saham">
    <select required value={form.instrument_id || ""} onChange={(event) => setForm((value) => ({ ...value, instrument_id: event.target.value }))}>
      <option value="">Pilih saham</option>
      {instruments.map((item) => <option key={item.instrument_id} value={item.instrument_id}>{item.ticker} · {item.name}</option>)}
    </select>
  </FormField>
);

const TradeFields = ({ mode, form, setForm, instruments, portfolio }) => {
  const heldIds = new Set((portfolio.holdings || []).map((item) => item.instrument_id));
  const selectable = mode === "sell" ? instruments.filter((item) => heldIds.has(item.instrument_id)) : instruments;
  const holding = (portfolio.holdings || []).find((item) => item.instrument_id === form.instrument_id) || null;
  const instrument = instruments.find((item) => item.instrument_id === form.instrument_id) || null;
  const lotSize = Number(instrument?.lot_size || holding?.lot_size || 100);
  return <>
    <InstrumentField form={form} setForm={setForm} instruments={selectable} />
    <div className={styles.formRow}>
      <FormField label="Lot"><input required min="1" step="1" type="number" value={form.lots} onChange={(event) => setForm((value) => ({ ...value, lots: event.target.value }))} /></FormField>
      <FormField label="Tanggal"><input required type="date" max={TODAY()} value={form.trade_date} onChange={(event) => setForm((value) => ({ ...value, trade_date: event.target.value }))} /></FormField>
    </div>
    <MoneyInput id="investment-trade-price" label="Harga per saham" required value={form.price_per_share || ""} onChange={(value) => setForm((current) => ({ ...current, price_per_share: value }))} />
    <MoneyInput id="investment-trade-fee" label="Fee" value={form.fee_amount} onChange={(value) => setForm((current) => ({ ...current, fee_amount: value }))} />
    {mode === "sell" && holding ? <small>Tersedia {Math.floor(holding.shares / lotSize).toLocaleString("id-ID")} lot ({holding.shares.toLocaleString("id-ID")} lembar).</small> : null}
  </>;
};

const TradeReview = ({ mode, form, instruments }) => {
  const preview = investmentTradePreview(mode, form, instruments);
  return <section className={styles.review} aria-labelledby="investment-trade-review-title">
    <div>
      <h3 id="investment-trade-review-title">Tinjau sebelum konfirmasi</h3>
      <p className={styles.notice}>Ringkasan ini hanya estimasi tampilan. Backend tetap memvalidasi saldo RDN, holding, lot, tanggal, izin, versi data, dan idempotency saat konfirmasi.</p>
    </div>
    <dl className={styles.reviewGrid}>
      <div><dt>Saham</dt><dd>{preview.instrument ? `${preview.instrument.ticker} · ${preview.instrument.name}` : "-"}</dd></div>
      <div><dt>Kuantitas</dt><dd>{preview.lots.toLocaleString("id-ID")} lot · {preview.shares.toLocaleString("id-ID")} lembar</dd></div>
      <div><dt>Harga per saham</dt><dd><Money value={preview.pricePerShare} /></dd></div>
      <div><dt>Nilai bruto</dt><dd><Money value={preview.grossAmount} /></dd></div>
      <div><dt>Fee</dt><dd><Money value={preview.feeAmount} /></dd></div>
      <div><dt>{mode === "buy" ? "Estimasi dana RDN keluar" : "Estimasi dana RDN masuk"}</dt><dd><Money value={preview.rdnAmount} /></dd></div>
      <div><dt>Tanggal</dt><dd>{form.trade_date}</dd></div>
    </dl>
  </section>;
};

const PriceFields = ({ form, setForm, instruments }) => <>
  <InstrumentField form={form} setForm={setForm} instruments={instruments} />
  <MoneyInput id="investment-price" label="Harga manual per saham" required value={form.price_per_share || ""} onChange={(value) => setForm((current) => ({ ...current, price_per_share: value }))} />
  <FormField label="Tanggal harga"><input required type="date" max={TODAY()} value={form.valuation_date} onChange={(event) => setForm((value) => ({ ...value, valuation_date: event.target.value }))} /></FormField>
</>;

const ReconcileFields = ({ form, setForm, instruments, portfolio }) => {
  const current = new Map((portfolio.holdings || []).map((item) => [item.instrument_id, item.shares]));
  return <>
    <MoneyInput id="investment-actual-cash" label="Cash RDN aktual" required value={form.actual_cash} onChange={(value) => setForm((state) => ({ ...state, actual_cash: value }))} />
    <FormField label="Tanggal pencocokan"><input required type="date" max={TODAY()} value={form.reconciliation_date} onChange={(event) => setForm((value) => ({ ...value, reconciliation_date: event.target.value }))} /></FormField>
    {instruments.map((item) => <FormField key={item.instrument_id} label={`${item.ticker} · lembar aktual`}><input min="0" step="1" type="number" value={form[`shares:${item.instrument_id}`] ?? current.get(item.instrument_id) ?? 0} onChange={(event) => setForm((value) => ({ ...value, [`shares:${item.instrument_id}`]: event.target.value }))} /></FormField>)}
    <FormField label="Catatan"><textarea maxLength="500" value={form.notes || ""} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} /></FormField>
  </>;
};

const CorrectionFields = ({ form, setForm, instruments }) => <>
  <p className={styles.notice}>Koreksi tidak menghapus trade lama. Gunakan hanya setelah mismatch diverifikasi.</p>
  <FormField label="Tanggal koreksi"><input required type="date" max={TODAY()} value={form.correction_date} onChange={(event) => setForm((value) => ({ ...value, correction_date: event.target.value }))} /></FormField>
  <FormField label="Saham (kosongkan untuk koreksi cash saja)"><select value={form.instrument_id || ""} onChange={(event) => setForm((value) => ({ ...value, instrument_id: event.target.value }))}><option value="">Cash RDN saja</option>{instruments.map((item) => <option key={item.instrument_id} value={item.instrument_id}>{item.ticker}</option>)}</select></FormField>
  <div className={styles.formRow}>
    <FormField label="Delta lembar"><input step="1" type="number" value={form.share_delta || 0} onChange={(event) => setForm((value) => ({ ...value, share_delta: event.target.value }))} /></FormField>
    <FormField label="Delta cost basis"><input step="1" type="number" value={form.cost_basis_delta || 0} onChange={(event) => setForm((value) => ({ ...value, cost_basis_delta: event.target.value }))} /></FormField>
  </div>
  <FormField label="Delta cash RDN"><input step="1" type="number" value={form.cash_delta || 0} onChange={(event) => setForm((value) => ({ ...value, cash_delta: event.target.value }))} /></FormField>
  <FormField label="Alasan"><textarea required minLength="5" maxLength="500" value={form.reason || ""} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} /></FormField>
</>;

const InvestmentDialog = ({ mode, portfolio, instruments, userRole, onClose, onSuccess }) => {
  const [form, setForm] = useState(() => ({ trade_date: TODAY(), valuation_date: TODAY(), reconciliation_date: TODAY(), correction_date: TODAY(), lots: 1, fee_amount: 0, actual_cash: portfolio?.rdn_cash ?? 0, ...EMPTY_FORM }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  if (!mode || !portfolio) return null;
  const title = ({ buy: "Beli saham", sell: "Jual saham", price: "Update harga", reconcile: "Cocokkan Ajaib", correction: "Koreksi investasi" })[mode];
  const activeInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "buy");
  const sellInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "sell");
  const portfolioInstruments = selectInvestmentInstruments(instruments, portfolio.holdings, "reconcile");
  const base = { portfolio_id: portfolio.portfolio_id };
  const holdingsPayload = () => {
    const current = new Map((portfolio.holdings || []).map((item) => [item.instrument_id, item.shares]));
    return portfolioInstruments.map((item) => ({ instrument_id: item.instrument_id, shares: Number(form[`shares:${item.instrument_id}`] ?? current.get(item.instrument_id) ?? 0) })).filter((item) => item.shares > 0 || current.has(item.instrument_id));
  };
  const actions = {
    buy: () => buyInvestment({ ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date }, portfolio.row_version),
    sell: () => sellInvestment({ ...base, instrument_id: form.instrument_id, lots: Number(form.lots), price_per_share: Number(form.price_per_share), fee_amount: Number(form.fee_amount || 0), trade_date: form.trade_date }, portfolio.row_version),
    price: () => updateInvestmentValuation({ ...base, instrument_id: form.instrument_id, price_per_share: Number(form.price_per_share), valuation_date: form.valuation_date }, portfolio.row_version),
    reconcile: () => reconcileInvestment({ ...base, actual_cash: Number(form.actual_cash), holdings: holdingsPayload(), reconciliation_date: form.reconciliation_date, notes: form.notes || "" }, portfolio.row_version),
    correction: () => userRole === "owner" ? correctInvestment({ ...base, instrument_id: form.instrument_id || undefined, share_delta: Number(form.share_delta || 0), cost_basis_delta: Number(form.cost_basis_delta || 0), cash_delta: Number(form.cash_delta || 0), correction_date: form.correction_date, reason: form.reason || "" }, portfolio.row_version) : Promise.reject(new Error("Koreksi investasi hanya tersedia untuk Administrator.")),
  };
  const isTrade = mode === "buy" || mode === "sell";
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (isTrade && !reviewing) { setReviewing(true); return; }
    setBusy(true);
    try {
      await actions[mode]();
      invalidateInvestmentReads(); onSuccess(mode); onClose();
    } catch (caught) { setError(caught?.message || "Perubahan investasi belum berhasil."); }
    finally { setBusy(false); }
  };
  const body = {
    buy: <TradeFields mode="buy" form={form} setForm={setForm} instruments={activeInstruments} portfolio={portfolio} />,
    sell: <TradeFields mode="sell" form={form} setForm={setForm} instruments={sellInstruments} portfolio={portfolio} />,
    price: <PriceFields form={form} setForm={setForm} instruments={portfolioInstruments} />,
    reconcile: <ReconcileFields form={form} setForm={setForm} instruments={portfolioInstruments} portfolio={portfolio} />,
    correction: <CorrectionFields form={form} setForm={setForm} instruments={instruments} />,
  }[mode];
  const footer = reviewing ? <>
    <Button disabled={busy} onClick={() => { setReviewing(false); setError(""); }}>Ubah</Button>
    <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{mode === "buy" ? "Konfirmasi beli" : "Konfirmasi jual"}</Button>
  </> : <Button variant="primary" type="submit" form="investment-dialog-form" loading={busy}>{isTrade ? (mode === "buy" ? "Tinjau pembelian" : "Tinjau penjualan") : "Simpan"}</Button>;
  return (
    <Modal open title={title} onClose={busy ? undefined : onClose} dismissible={!busy} footer={footer}>
      <form id="investment-dialog-form" className={styles.form} onSubmit={submit}>
        {error ? <div className="notice notice--danger" role="alert">{error}</div> : null}
        {reviewing ? <TradeReview mode={mode} form={form} instruments={mode === "buy" ? activeInstruments : sellInstruments} /> : body}
      </form>
    </Modal>
  );
};

const SetupDialog = ({ accounts, owner, onClose, onSuccess }) => {
  const [kind, setKind] = useState("portfolio"); const [form, setForm] = useState({ name: "Ajaib", broker: "ajaib", lot_size: 100, exchange: "IDX" }); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { if (kind === "portfolio") await createInvestmentPortfolio({ name: form.name, broker: form.broker, rdn_account_id: form.rdn_account_id }); else await upsertInvestmentInstrument({ ticker: form.ticker, name: form.instrument_name, exchange: form.exchange, lot_size: Number(form.lot_size), status: "active" }); invalidateInvestmentReads(); onSuccess(kind); onClose(); } catch (caught) { setError(caught?.message || "Setup investasi belum berhasil."); } finally { setBusy(false); } };
  return <Modal open title="Siapkan investasi" onClose={busy ? undefined : onClose} dismissible={!busy} footer={<Button variant="primary" type="submit" form="investment-setup-form" loading={busy}>Simpan</Button>}><form id="investment-setup-form" className={styles.form} onSubmit={submit}>{error ? <div className="notice notice--danger" role="alert">{error}</div> : null}<FormField label="Yang ingin ditambahkan"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="portfolio">Portfolio Ajaib</option>{owner ? <option value="instrument">Instrumen saham</option> : null}</select></FormField>{kind === "portfolio" ? <><FormField label="Nama portfolio"><input required maxLength="100" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} /></FormField><FormField label="Rekening RDN"><select required value={form.rdn_account_id || ""} onChange={(e) => setForm((v) => ({ ...v, rdn_account_id: e.target.value }))}><option value="">Pilih rekening jenis Investasi</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{item.name}</option>)}</select></FormField></> : <><div className={styles.formRow}><FormField label="Ticker"><input required maxLength="16" value={form.ticker || ""} onChange={(e) => setForm((v) => ({ ...v, ticker: e.target.value.toUpperCase() }))} /></FormField><FormField label="Bursa"><input required maxLength="16" value={form.exchange} onChange={(e) => setForm((v) => ({ ...v, exchange: e.target.value.toUpperCase() }))} /></FormField></div><FormField label="Nama saham"><input required maxLength="120" value={form.instrument_name || ""} onChange={(e) => setForm((v) => ({ ...v, instrument_name: e.target.value }))} /></FormField><FormField label="Lembar per lot"><input required min="1" step="1" type="number" value={form.lot_size} onChange={(e) => setForm((v) => ({ ...v, lot_size: e.target.value }))} /></FormField></>}</form></Modal>;
};

const InvestmentsPage = () => {
  const { user } = useAuth(); const overview = useApiResource("investments.overview"); const accountsResource = useApiResource("accounts.list"); const [dialog, setDialog] = useState(null); const [setupOpen, setSetupOpen] = useState(false); const [notice, setNotice] = useState("");
  const accounts = useMemo(() => (accountsResource.data?.items || []).filter((item) => item.status === "active" && item.account_type === "investment" && item.can_transact && !Number(item.allow_negative)), [accountsResource.data]);
  if (overview.status === "loading" || accountsResource.status === "loading") return <LoadingScreen label="Memuat investasi..." />;
  if (overview.status === "error") return <ErrorState error={overview.error} onRetry={overview.reload} />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  const data = overview.data || { summary: {}, portfolios: [], instruments: [] };
  return <div className={`page-stack ${styles.page}`}><RefreshWarning error={overview.refreshError || accountsResource.refreshError} onRetry={() => { overview.reload().catch(() => {}); accountsResource.reload().catch(() => {}); }} /><PageHeader eyebrow="Pencatatan manual" title="Investasi" description="Catat RDN, saham, transaksi beli/jual, harga manual, P/L, dan pencocokan Ajaib tanpa menyimpan credential broker." actions={<Button icon={FiPlus} onClick={() => setSetupOpen(true)}>Siapkan</Button>} />{notice ? <div className="notice notice--success" role="status">{notice}</div> : null}<div className={styles.summaryGrid}><Card className={styles.summaryCard}><span>Nilai portfolio</span><strong><Money value={data.summary?.portfolio_value} /></strong></Card><Card className={styles.summaryCard}><span>Cash RDN</span><strong><Money value={data.summary?.rdn_cash} /></strong></Card><Card className={styles.summaryCard}><span>Modal saham</span><strong><Money value={data.summary?.cost_basis} /></strong></Card><Card className={styles.summaryCard}><span>P/L belum direalisasi</span><strong className={tone(data.summary?.unrealized_pl)}><Money value={data.summary?.unrealized_pl} /></strong></Card></div>{data.portfolios.length === 0 ? <EmptyState title="Belum ada portfolio" description="Buat rekening jenis Investasi untuk RDN, lalu hubungkan sebagai portfolio Ajaib." action={<Button icon={FiPlus} onClick={() => setSetupOpen(true)}>Siapkan portfolio</Button>} /> : data.portfolios.map((item) => <Card key={item.portfolio_id} className={styles.portfolio}><div className={styles.portfolioHeader}><div><h2>{item.name}</h2><p className={styles.portfolioMeta}>{item.broker === "ajaib" ? "Ajaib" : "Broker lain"} · RDN {item.rdn_account_name}</p></div><div className={styles.actions}>{item.can_operate ? <><Button icon={FiPlus} variant="primary" onClick={() => setDialog({ mode: "buy", portfolio: item })}>Beli</Button><Button icon={FiDollarSign} onClick={() => setDialog({ mode: "sell", portfolio: item })}>Jual</Button><Button icon={FiTrendingUp} onClick={() => setDialog({ mode: "price", portfolio: item })}>Harga</Button><Button icon={FiRefreshCw} onClick={() => setDialog({ mode: "reconcile", portfolio: item })}>Cocokkan</Button>{user?.role === "owner" ? <Button icon={FiEdit3} onClick={() => setDialog({ mode: "correction", portfolio: item })}>Koreksi</Button> : null}</> : null}</div></div><div className={styles.summaryGrid}><div className={styles.metric}><small>Cash RDN</small><Money value={item.rdn_cash} /></div><div className={styles.metric}><small>Nilai saham</small><Money value={item.market_value} /></div><div className={styles.metric}><small>Realized P/L</small><span className={tone(item.realized_pl)}><Money value={item.realized_pl} /></span></div><div className={styles.metric}><small>Unrealized P/L</small><span className={tone(item.unrealized_pl)}><Money value={item.unrealized_pl} /></span></div></div><section aria-labelledby={`holdings-${item.portfolio_id}`}><h3 id={`holdings-${item.portfolio_id}`}>Portfolio</h3><div className={styles.holdings}>{item.holdings.length ? item.holdings.map((holding) => <article key={holding.instrument_id} className={styles.holding}><div><h3>{holding.ticker}</h3><small>{holding.name}</small></div><div className={styles.metric}><small>Kepemilikan</small><strong>{Math.floor(holding.shares / Number(holding.lot_size || 100)).toLocaleString("id-ID")} lot · {holding.shares.toLocaleString("id-ID")} lembar</strong></div><div className={styles.metric}><small>Nilai sekarang</small><Money value={holding.market_value} /></div><div className={styles.metric}><small>P/L</small><span className={tone(holding.unrealized_pl)}><Money value={holding.unrealized_pl} /></span></div></article>) : <p className={styles.empty}>Belum ada saham. Deposit RDN melalui transfer rekening, lalu catat pembelian.</p>}</div></section>{item.activity?.length ? <section aria-labelledby={`activity-${item.portfolio_id}`}><h3 id={`activity-${item.portfolio_id}`}>Aktivitas terbaru</h3><div className={styles.activity}>{item.activity.slice(0, 5).map((activity) => <div className={styles.activityItem} key={activity.activity_id}><span><FiActivity aria-hidden="true" /> {activity.activity_type === "trade" ? `${activity.trade_type === "buy" ? "Beli" : "Jual"} ${activity.ticker || "saham"}` : "Koreksi"}</span><small>{activity.activity_date}</small></div>)}</div></section> : null}</Card>)}{setupOpen ? <SetupDialog accounts={accounts} owner={user?.role === "owner"} onClose={() => setSetupOpen(false)} onSuccess={(kind) => setNotice(kind === "portfolio" ? "Portfolio investasi tersimpan." : "Instrumen investasi tersimpan.")} /> : null}{dialog ? <InvestmentDialog mode={dialog.mode} portfolio={dialog.portfolio} instruments={data.instruments || []} userRole={user?.role} onClose={() => setDialog(null)} onSuccess={(mode) => setNotice(mode === "reconcile" ? "Pencocokan tersimpan tanpa mengubah portfolio otomatis." : "Perubahan investasi tersimpan.")} /> : null}</div>;
};

export default InvestmentsPage;
