import {
  FiActivity,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiDollarSign,
  FiEdit3,
  FiPlus,
  FiRefreshCw,
  FiTrendingUp,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const tone = (value) => Number(value || 0) > 0
  ? styles.positive
  : Number(value || 0) < 0
    ? styles.negative
    : styles.neutral;

const percentLabel = (value) => value == null
  ? null
  : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const portfolioTotal = (portfolio = {}) => Number(portfolio.rdn_cash || 0) + Number(portfolio.market_value || 0);
const marketSharePercent = (marketValue, total) => total > 0 ? Math.max(0, Math.min(100, (Number(marketValue || 0) / total) * 100)) : 0;
const rdnLabel = (portfolio) => investmentRdnDisplayLabel({
  name: portfolio?.rdn_account_name,
  owner_scope: portfolio?.owner_scope,
  is_owned_by_actor: portfolio?.is_owned_by_actor,
});

const PortfolioHero = ({ summary, portfolioCount }) => {
  const total = Number(summary?.portfolio_value || 0);
  const unrealizedPercent = investmentReturnPercent(summary?.unrealized_pl, summary?.cost_basis);
  const marketShare = marketSharePercent(summary?.market_value, total);
  return (
    <section className={styles.hero} aria-labelledby="investment-total-value">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroMain}>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Ringkasan investasi tercatat</span>
          <span className={styles.heroLabel}>Total portfolio</span>
          <strong className={styles.heroValue} id="investment-total-value"><Money value={total} /></strong>
          <div className={styles.heroReturnRow}>
            <span className={`${styles.heroReturn} ${tone(summary?.unrealized_pl)}`}><FiTrendingUp aria-hidden="true" /><span>Unrealized <Money value={summary?.unrealized_pl} /></span>{unrealizedPercent != null ? <small>{percentLabel(unrealizedPercent)}</small> : null}</span>
            <span className={styles.heroMeta}>{portfolioCount.toLocaleString("id-ID")} portfolio · {(summary?.holding_count || 0).toLocaleString("id-ID")} holding</span>
          </div>
        </div>
        <div className={styles.heroAllocation} aria-label="Komposisi total portfolio">
          <div className={styles.allocationDonut} style={{ "--market-share": `${marketShare}%` }} aria-hidden="true"><span><small>Saham</small><strong>{marketShare.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%</strong></span></div>
          <div className={styles.allocationLegend}>
            <div><span className={`${styles.legendDot} ${styles.legendMarket}`} /><p><small>Nilai saham</small><strong><Money value={summary?.market_value} /></strong></p></div>
            <div><span className={`${styles.legendDot} ${styles.legendCash}`} /><p><small>Cash RDN</small><strong><Money value={summary?.rdn_cash} /></strong></p></div>
            <span className={styles.allocationCaption}>Total portfolio = nilai saham + Cash RDN.</span>
          </div>
        </div>
      </div>
      <dl className={styles.heroMetrics}>
        <div><dt>Nilai saham</dt><dd><Money value={summary?.market_value} /></dd></div>
        <div><dt>Cash RDN</dt><dd><Money value={summary?.rdn_cash} /></dd></div>
        <div><dt>Realized P/L</dt><dd className={tone(summary?.realized_pl)}><Money value={summary?.realized_pl} /></dd></div>
        <div><dt>Unrealized P/L</dt><dd className={tone(summary?.unrealized_pl)}><Money value={summary?.unrealized_pl} /></dd></div>
      </dl>
      <p className={styles.heroDisclaimer}>Nilai saham memakai harga manual terakhir atau harga transaksi terakhir yang tercatat; bukan harga pasar live.</p>
    </section>
  );
};

const missingBuyInstrumentGuidance = ({ hasPriceInstrument, owner }) => {
  if (hasPriceInstrument) return "Belum ada instrumen aktif untuk Catat pembelian. Holding yang ada tetap dapat diperbarui harganya dan dicocokkan.";
  return owner
    ? "Belum ada instrumen saham aktif. Tambahkan instrumen agar pencatatan pembelian atau posisi awal tersedia."
    : "Belum ada instrumen saham aktif. Instrumen baru dikelola Administrator.";
};

const unsellableHoldingGuidance = (owner) => owner
  ? "Holding tercatat kurang dari 1 lot sehingga belum dapat dicatat sebagai penjualan lot. Gunakan Koreksi bila jumlah lembar memang perlu diperbaiki."
  : "Holding tercatat kurang dari 1 lot sehingga belum dapat dicatat sebagai penjualan lot. Hubungi Administrator bila jumlah lembar perlu diperbaiki.";

const portfolioActionState = ({ portfolio, instruments, owner }) => {
  const heldIds = new Set(portfolio.holdings.map((item) => item.instrument_id));
  const hasBuyInstrument = instruments.some((item) => item.status === "active");
  const hasHolding = portfolio.holdings.length > 0;
  const hasSellableHolding = portfolio.holdings.some((item) => Number(item.shares || 0) >= Number(item.lot_size || 100));
  const hasPriceInstrument = instruments.some((item) => heldIds.has(item.instrument_id));
  let guidance = "";
  if (!hasBuyInstrument) guidance = missingBuyInstrumentGuidance({ hasPriceInstrument, owner });
  else if (!hasHolding) guidance = "Catat penjualan dan Perbarui harga tersedia setelah portfolio memiliki holding saham.";
  else if (!hasSellableHolding) guidance = unsellableHoldingGuidance(owner);
  else if (!hasPriceInstrument) guidance = "Belum ada instrumen yang dapat diberi harga manual.";
  return { hasBuyInstrument, hasHolding, hasSellableHolding, hasPriceInstrument, guidance };
};

const PortfolioActions = ({ portfolio, instruments, owner, onAction, onSetup, onTransfer }) => {
  if (!portfolio.can_operate) return <p className={styles.readOnlyNote}>Portfolio ini dapat dilihat untuk transparansi, tetapi hanya pemilik rekening yang dapat mengubah catatannya.</p>;
  const state = portfolioActionState({ portfolio, instruments, owner });
  const cash = Number(portfolio.rdn_cash || 0);
  return <section className={styles.actionArea} aria-label={`Aksi ${portfolio.name}`}>
    <div className={styles.quickActions}>
      <Button className={`${styles.quickAction} ${styles.quickActionPrimary}`} icon={FiPlus} variant="primary" disabled={!state.hasBuyInstrument} onClick={() => onAction("buy", portfolio)}>Catat pembelian</Button>
      <Button className={styles.quickAction} icon={FiDollarSign} disabled={!state.hasSellableHolding} onClick={() => onAction("sell", portfolio)}>Catat penjualan</Button>
      <Button className={styles.quickAction} icon={FiTrendingUp} disabled={!state.hasPriceInstrument} onClick={() => onAction("price", portfolio)}>Perbarui harga</Button>
      <Button className={styles.quickAction} icon={FiRefreshCw} onClick={() => onAction("reconcile", portfolio)}>Cocokkan</Button>
    </div>
    <div className={styles.actionFooter}>
      <div className="form-actions">
        <Button type="button" icon={FiArrowDownLeft} onClick={() => onTransfer("fund", portfolio)}>Tambah dana ke RDN</Button>
        <Button type="button" icon={FiArrowUpRight} disabled={cash <= 0} onClick={() => onTransfer("withdraw", portfolio)}>Tarik dana dari RDN</Button>
        {portfolio.opening_position_available ? <Button type="button" onClick={() => onAction("opening_position", portfolio)} disabled={!state.hasBuyInstrument}>Tambah posisi awal</Button> : null}
      </div>
      {owner ? <Button className={styles.correctionAction} type="button" icon={FiEdit3} onClick={() => onAction("correction", portfolio)}>Koreksi catatan</Button> : null}
    </div>
    {state.guidance ? <div className={styles.actionGuidance} role="note"><span>{state.guidance}</span>{!state.hasBuyInstrument && owner ? <Button type="button" onClick={() => onSetup("instrument")}>Tambah instrumen</Button> : null}</div> : null}
  </section>;
};

const HoldingCard = ({ holding, onOpenDetail }) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const lots = lotSize > 0 ? shares / lotSize : 0;
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const tickerMark = String(holding.ticker || "--").slice(0, 2);
  const openOnKeyboard = (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(); }
  };
  return (
    <article className={`${styles.holdingCard} ${styles.holdingCardInteractive}`} role="button" tabIndex="0" onClick={onOpenDetail} onKeyDown={openOnKeyboard} aria-label={`Buka rincian ${holding.ticker || "saham"}`}>
      <div className={styles.holdingIdentity}>
        <span className={styles.tickerMark} aria-hidden="true">{tickerMark}</span>
        <div>
          <div className={styles.holdingNameRow}><h4>{holding.ticker || "Saham"}</h4><span>{lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot</span></div>
          <p>{holding.name || "Instrumen investasi"}</p>
        </div>
      </div>
      <div className={styles.holdingValueBlock}>
        <span>Nilai saham</span>
        <strong><Money value={holding.market_value} /></strong>
        <small className={tone(holding.unrealized_pl)}><Money value={holding.unrealized_pl} />{returnPercent != null ? ` · ${percentLabel(returnPercent)}` : ""}</small>
      </div>
      <dl className={styles.holdingMetrics}>
        <div><dt>Kepemilikan</dt><dd>{shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Average cost</dt><dd><Money value={holding.average_cost} /></dd></div>
        <div><dt>Harga terakhir</dt><dd><Money value={holding.price_per_share} />{holding.valuation_date ? <small>{formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}</small> : null}</dd></div>
      </dl>
    </article>
  );
};

const ActivityValue = ({ activity }) => {
  const cash = Number(activity.cash_amount || 0);
  if (activity.activity_type === "trade") return <><span>{activity.trade_type === "buy" ? "Cash RDN keluar" : "Cash RDN masuk"}</span><Money value={cash} /></>;
  if (activity.activity_type === "valuation") return <><span>Harga referensi</span><Money value={activity.price_per_share} /></>;
  if (activity.activity_type === "opening_position") return <><span>Posisi awal</span><strong>{Number(activity.share_delta || 0).toLocaleString("id-ID")} lembar</strong></>;
  if (cash !== 0) return <><span>Delta Cash RDN</span><Money value={cash} /></>;
  if (Number(activity.share_delta || 0) !== 0) return <><span>Delta holding</span><strong>{Number(activity.share_delta || 0) > 0 ? "+" : ""}{Number(activity.share_delta || 0).toLocaleString("id-ID")} lembar</strong></>;
  return <span>Koreksi tercatat</span>;
};

const ActivityItem = ({ activity }) => (
  <li className={styles.activityItem}>
    <span className={styles.activityIcon} aria-hidden="true"><FiActivity /></span>
    <div className={styles.activityCopy}>
      <strong>{investmentActivityLabel(activity)}</strong>
      <small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small>
    </div>
    <div className={styles.activityValue}><ActivityValue activity={activity} /></div>
  </li>
);

const PortfolioCard = ({ portfolio, instruments, owner, onAction, onSetup, onTransfer, onHolding }) => {
  const total = portfolioTotal(portfolio);
  const unrealizedPercent = investmentReturnPercent(portfolio.unrealized_pl, portfolio.cost_basis);
  return (
    <Card as="article" className={styles.portfolioCard}>
      <header className={styles.portfolioHeader}>
        <div className={styles.portfolioTitleBlock}>
          <div className={styles.portfolioIdentityRow}><span className={styles.portfolioBroker}>Sumber catatan</span><span className={styles.rdnChip}>{rdnLabel(portfolio)}</span></div>
          <h2>{portfolio.name}</h2>
          <p>Satu portfolio ini selalu menggunakan Cash RDN dari rekening di atas.</p>
        </div>
        <div className={styles.portfolioValue}>
          <span>Total portfolio</span>
          <strong><Money value={total} /></strong>
          <small className={tone(portfolio.unrealized_pl)}>Unrealized <Money value={portfolio.unrealized_pl} />{unrealizedPercent != null ? ` · ${percentLabel(unrealizedPercent)}` : ""}</small>
        </div>
      </header>

      <PortfolioActions portfolio={portfolio} instruments={instruments} owner={owner} onAction={onAction} onSetup={onSetup} onTransfer={onTransfer} />

      <section className={styles.composition} aria-label={`Komposisi ${portfolio.name}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionEyebrow}>Komposisi aset</span><h3>Nilai saham dan Cash RDN</h3><p>Total portfolio dihitung dari nilai saham berdasarkan harga catatan terakhir ditambah Cash RDN.</p></div>
          <span><Money value={total} /> total</span>
        </div>
        <ProgressBar value={portfolio.market_value} max={total} label="Porsi nilai saham" />
        <dl className={styles.compositionMetrics}>
          <div><dt>Nilai saham</dt><dd><Money value={portfolio.market_value} /></dd></div>
          <div><dt>Cash RDN</dt><dd><Money value={portfolio.rdn_cash} /></dd></div>
          <div><dt>Realized P/L</dt><dd className={tone(portfolio.realized_pl)}><Money value={portfolio.realized_pl} /></dd></div>
          <div><dt>Unrealized P/L</dt><dd className={tone(portfolio.unrealized_pl)}><Money value={portfolio.unrealized_pl} /></dd></div>
        </dl>
      </section>

      <section className={styles.holdingsSection} aria-labelledby={`holdings-${portfolio.portfolio_id}`}>
        <div className={styles.sectionHeading}>
          <div><span className={styles.sectionEyebrow}>Kepemilikan</span><h3 id={`holdings-${portfolio.portfolio_id}`}>Holding saham</h3><p>Klik holding untuk melihat rincian dan aktivitas saham tersebut.</p></div>
          <span>{portfolio.holdings.length.toLocaleString("id-ID")} saham</span>
        </div>
        {portfolio.holdings.length
          ? <div className={styles.holdings}>{portfolio.holdings.map((holding) => <HoldingCard key={holding.instrument_id} holding={holding} onOpenDetail={() => onHolding(portfolio, holding)} />)}</div>
          : <p className={styles.inlineEmpty}>Belum ada saham. Anda dapat mencatat posisi awal yang sudah dimiliki atau mencatat pembelian baru setelah transaksi benar-benar terjadi di aplikasi investasi.</p>}
      </section>

      {portfolio.activity?.length ? <section className={styles.activitySection} aria-labelledby={`activity-${portfolio.portfolio_id}`}>
        <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>Audit trail</span><h3 id={`activity-${portfolio.portfolio_id}`}>Aktivitas saham terbaru</h3><p>Pembelian, penjualan, harga manual, posisi awal, dan koreksi ditampilkan sebagai event yang eksplisit.</p></div></div>
        <ul className={styles.activityList}>{portfolio.activity.slice(0, 5).map((activity) => <ActivityItem key={`${activity.activity_type}:${activity.activity_id}`} activity={activity} />)}</ul>
      </section> : null}
    </Card>
  );
};

const InvestmentOverview = ({ data, owner, onAction, onSetup, onTransfer, onHolding }) => (
  <div className={styles.dashboard}>
    <PortfolioHero summary={data.summary || {}} portfolioCount={data.portfolios.length} />
    <div className={styles.portfolioList}>
      {data.portfolios.map((portfolio) => <PortfolioCard key={portfolio.portfolio_id} portfolio={portfolio} instruments={data.instruments || []} owner={owner} onAction={onAction} onSetup={onSetup} onTransfer={onTransfer} onHolding={onHolding} />)}
    </div>
  </div>
);

export default InvestmentOverview;
