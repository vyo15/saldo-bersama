import { useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiChevronDown,
  FiChevronRight,
  FiEdit3,
  FiMinus,
  FiMoreHorizontal,
  FiPlus,
  FiRefreshCw,
  FiTrendingUp,
} from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { investmentRdnDisplayLabel } from "../../shared/presentation/account.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";

import layoutStyles from "./InvestmentsPage.module.css";
import heroStyles from "./InvestmentHero.module.css";
import portfolioStyles from "./PortfolioCard.module.css";
import holdingStyles from "./HoldingCard.module.css";
import activityStyles from "./InvestmentActivity.module.css";
import sharedStyles from "./InvestmentShared.module.css";

const tone = (value) => Number(value || 0) > 0
  ? sharedStyles.positive
  : Number(value || 0) < 0
    ? sharedStyles.negative
    : sharedStyles.neutral;

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
    <section className={heroStyles.hero} aria-labelledby="investment-total-value">
      <div className={heroStyles.heroMain}>
        <div className={heroStyles.heroCopy}>
          <span className={heroStyles.heroLabel}>Total portfolio</span>
          <strong className={heroStyles.heroValue} id="investment-total-value"><Money value={total} /></strong>
          <div className={heroStyles.heroReturnRow}>
            <span className={`${heroStyles.heroReturn} ${tone(summary?.unrealized_pl)}`}>
              <FiTrendingUp aria-hidden="true" />
              <span><Money value={summary?.unrealized_pl} />{unrealizedPercent != null ? ` · ${percentLabel(unrealizedPercent)}` : ""}</span>
            </span>
            <span className={heroStyles.heroMeta}>{portfolioCount.toLocaleString("id-ID")} portfolio · {(summary?.holding_count || 0).toLocaleString("id-ID")} saham</span>
          </div>
        </div>
        <dl className={heroStyles.heroMiniMetrics}>
          <div><dt>Nilai saham</dt><dd><Money value={summary?.market_value} /></dd></div>
          <div><dt>Cash RDN</dt><dd><Money value={summary?.rdn_cash} /></dd></div>
        </dl>
      </div>

      <div className={heroStyles.allocationTrack} aria-label={`Porsi nilai saham ${marketShare.toLocaleString("id-ID", { maximumFractionDigits: 0 })}% dari total portfolio`}>
        <span style={{ width: `${marketShare}%` }} aria-hidden="true" />
      </div>

      <div className={heroStyles.heroFooter}>
        <p>Harga memakai catatan manual terakhir, bukan harga pasar live.</p>
        <details className={heroStyles.heroDetails}>
          <summary>Rincian nilai <FiChevronDown aria-hidden="true" /></summary>
          <dl className={heroStyles.heroDetailMetrics}>
            <div><dt>Nilai saham</dt><dd><Money value={summary?.market_value} /></dd></div>
            <div><dt>Cash RDN</dt><dd><Money value={summary?.rdn_cash} /></dd></div>
            <div><dt>Realized P/L</dt><dd className={tone(summary?.realized_pl)}><Money value={summary?.realized_pl} /></dd></div>
            <div><dt>Unrealized P/L</dt><dd className={tone(summary?.unrealized_pl)}><Money value={summary?.unrealized_pl} /></dd></div>
          </dl>
          <p className={heroStyles.heroDetailNote}>Total portfolio = nilai saham + Cash RDN.</p>
        </details>
      </div>
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

const SheetAction = ({ icon: Icon, title, description, disabled = false, onClick }) => (
  <button className={portfolioStyles.sheetAction} type="button" disabled={disabled} onClick={onClick}>
    <span className={portfolioStyles.sheetActionIcon} aria-hidden="true"><Icon /></span>
    <span className={portfolioStyles.sheetActionCopy}><strong>{title}</strong><small>{description}</small></span>
    <FiChevronRight className={portfolioStyles.sheetActionChevron} aria-hidden="true" />
  </button>
);

const PortfolioActions = ({ portfolio, instruments, owner, onAction, onSetup, onTransfer }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  if (!portfolio.can_operate) return <p className={sharedStyles.readOnlyNote}>Portfolio ini dapat dilihat untuk transparansi, tetapi hanya pemilik rekening yang dapat mengubah catatannya.</p>;
  const state = portfolioActionState({ portfolio, instruments, owner });
  const cash = Number(portfolio.rdn_cash || 0);
  const runMoreAction = (callback) => {
    setMoreOpen(false);
    callback();
  };
  return <>
    <section className={portfolioStyles.actionArea} aria-label={`Aksi ${portfolio.name}`}>
      <div className={portfolioStyles.quickActions}>
        <Button className={`${portfolioStyles.quickAction} ${portfolioStyles.quickActionPrimary}`} icon={FiPlus} variant="primary" disabled={!state.hasBuyInstrument} onClick={() => onAction("buy", portfolio)} aria-label="Catat pembelian">Catat beli</Button>
        <Button className={`${portfolioStyles.quickAction} ${portfolioStyles.quickActionSell}`} icon={FiMinus} disabled={!state.hasSellableHolding} onClick={() => onAction("sell", portfolio)} aria-label="Catat penjualan">Catat jual</Button>
        <button className={`${portfolioStyles.quickAction} ${portfolioStyles.quickActionMore}`} type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}>
          <FiMoreHorizontal aria-hidden="true" /><span>Lainnya</span>
        </button>
      </div>
      {state.guidance ? <div className={portfolioStyles.actionGuidance} role="note"><span>{state.guidance}</span>{!state.hasBuyInstrument && owner ? <Button className={portfolioStyles.guidanceAction} type="button" onClick={() => onSetup("instrument")}>Tambah instrumen</Button> : null}</div> : null}
    </section>

    <Modal open={moreOpen} title="Aksi lainnya" description={portfolio.name} onClose={() => setMoreOpen(false)} size="sm" className={portfolioStyles.actionSheet}>
      <div className={portfolioStyles.sheetActionList}>
        <SheetAction icon={FiTrendingUp} title="Perbarui harga" description="Perbarui harga referensi manual" disabled={!state.hasPriceInstrument} onClick={() => runMoreAction(() => onAction("price", portfolio))} />
        <SheetAction icon={FiRefreshCw} title="Cocokkan" description="Verifikasi Cash RDN dan holding aktual" onClick={() => runMoreAction(() => onAction("reconcile", portfolio))} />
        <SheetAction icon={FiArrowDownLeft} title="Tambah dana ke RDN" description="Transfer internal ke rekening RDN" onClick={() => runMoreAction(() => onTransfer("fund", portfolio))} />
        <SheetAction icon={FiArrowUpRight} title="Tarik dana dari RDN" description="Transfer Cash RDN kembali ke rekening" disabled={cash <= 0} onClick={() => runMoreAction(() => onTransfer("withdraw", portfolio))} />
        {portfolio.opening_position_available ? <SheetAction icon={FiPlus} title="Posisi awal" description="Catat saham yang sudah dimiliki" disabled={!state.hasBuyInstrument} onClick={() => runMoreAction(() => onAction("opening_position", portfolio))} /> : null}
        {owner ? <SheetAction icon={FiEdit3} title="Koreksi catatan" description="Perbaiki selisih yang sudah diverifikasi" onClick={() => runMoreAction(() => onAction("correction", portfolio))} /> : null}
      </div>
    </Modal>
  </>;
};

const HoldingCard = ({ holding, onOpenDetail }) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const lots = lotSize > 0 ? shares / lotSize : 0;
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const tickerMark = String(holding.ticker || "--").slice(0, 4);
  const openOnKeyboard = (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(); }
  };
  return (
    <article className={`${holdingStyles.holdingCard} ${holdingStyles.holdingCardInteractive}`} role="button" tabIndex="0" onClick={onOpenDetail} onKeyDown={openOnKeyboard} aria-label={`Buka rincian ${holding.ticker || "saham"}`}>
      <div className={holdingStyles.holdingIdentity}>
        <span className={holdingStyles.tickerMark} aria-hidden="true">{tickerMark}</span>
        <div>
          <div className={holdingStyles.holdingNameRow}><h4>{holding.ticker || "Saham"}</h4><span>{lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot</span></div>
          <p>{holding.name || "Instrumen investasi"}</p>
        </div>
      </div>
      <div className={holdingStyles.holdingValueBlock}>
        <div>
          <span>Nilai saham</span>
          <strong><Money value={holding.market_value} /></strong>
          <small className={tone(holding.unrealized_pl)}>{returnPercent != null ? percentLabel(returnPercent) : <Money value={holding.unrealized_pl} />}</small>
        </div>
        <FiChevronRight className={holdingStyles.holdingChevron} aria-hidden="true" />
      </div>
      <dl className={holdingStyles.holdingMetrics}>
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

const ActivityItem = ({ activity, portfolioName = "" }) => (
  <li className={activityStyles.activityItem}>
    <span className={activityStyles.activityIcon} aria-hidden="true"><FiActivity /></span>
    <div className={activityStyles.activityCopy}>
      <strong>{investmentActivityLabel(activity)}</strong>
      <small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}{portfolioName ? ` · ${portfolioName}` : ""}</small>
    </div>
    <div className={activityStyles.activityValue}><ActivityValue activity={activity} /></div>
  </li>
);

const PortfolioCard = ({ portfolio, instruments, owner, onAction, onSetup, onTransfer, onHolding }) => {
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const total = portfolioTotal(portfolio);
  const unrealizedPercent = investmentReturnPercent(portfolio.unrealized_pl, portfolio.cost_basis);
  const visibleHoldings = showAllHoldings ? portfolio.holdings : portfolio.holdings.slice(0, 4);
  const canToggleHoldings = portfolio.holdings.length > 4;
  return (
    <Card as="article" className={portfolioStyles.portfolioCard}>
      <header className={portfolioStyles.portfolioHeader}>
        <div className={portfolioStyles.portfolioTitleBlock}>
          <span className="sr-only">Sumber catatan</span>
          <div className={portfolioStyles.portfolioIdentityRow}><h2>{portfolio.name}</h2><span className={portfolioStyles.rdnChip}>RDN · {rdnLabel(portfolio)}</span></div>
          <p>Satu portfolio ini selalu menggunakan Cash RDN dari rekening di atas.</p>
        </div>
        <div className={portfolioStyles.portfolioValue}>
          <span>Nilai saat ini</span>
          <strong><Money value={total} /></strong>
          <small className={tone(portfolio.unrealized_pl)}>{unrealizedPercent != null ? percentLabel(unrealizedPercent) : <Money value={portfolio.unrealized_pl} />}</small>
        </div>
      </header>

      <PortfolioActions portfolio={portfolio} instruments={instruments} owner={owner} onAction={onAction} onSetup={onSetup} onTransfer={onTransfer} />

      <section className={holdingStyles.holdingsSection} aria-labelledby={`holdings-${portfolio.portfolio_id}`}>
        <div className={sharedStyles.sectionHeading}>
          <div><h3 id={`holdings-${portfolio.portfolio_id}`}>Kepemilikan saham</h3><p>Klik saham untuk melihat rincian holding dan aktivitasnya.</p></div>
          {canToggleHoldings ? <button className={sharedStyles.sectionLink} type="button" onClick={() => setShowAllHoldings((current) => !current)}>{showAllHoldings ? "Ringkas" : `Lihat semua (${portfolio.holdings.length.toLocaleString("id-ID")})`}</button> : <span>{portfolio.holdings.length.toLocaleString("id-ID")} saham</span>}
        </div>
        {portfolio.holdings.length
          ? <div className={holdingStyles.holdings}>{visibleHoldings.map((holding) => <HoldingCard key={holding.instrument_id} holding={holding} onOpenDetail={() => onHolding(portfolio, holding)} />)}</div>
          : <p className={sharedStyles.inlineEmpty}>Belum ada saham. Catat posisi awal yang sudah dimiliki atau pembelian yang sudah benar-benar terjadi di aplikasi investasi.</p>}
      </section>

      <details className={portfolioStyles.portfolioDetails}>
        <summary><span>Rincian portfolio & komposisi</span><FiChevronDown aria-hidden="true" /></summary>
        <section className={portfolioStyles.composition} aria-label={`Komposisi ${portfolio.name}`}>
          <ProgressBar value={portfolio.market_value} max={total} label="Porsi nilai saham" />
          <dl className={portfolioStyles.compositionMetrics}>
            <div><dt>Nilai saham</dt><dd><Money value={portfolio.market_value} /></dd></div>
            <div><dt>Cash RDN</dt><dd><Money value={portfolio.rdn_cash} /></dd></div>
            <div><dt>Realized P/L</dt><dd className={tone(portfolio.realized_pl)}><Money value={portfolio.realized_pl} /></dd></div>
            <div><dt>Unrealized P/L</dt><dd className={tone(portfolio.unrealized_pl)}><Money value={portfolio.unrealized_pl} /></dd></div>
          </dl>
          <p className={portfolioStyles.compositionNote}>Nilai saham memakai harga manual atau transaksi terakhir yang tercatat.</p>
        </section>
      </details>
    </Card>
  );
};

const activityRowsForPortfolios = (portfolios = []) => portfolios
  .flatMap((portfolio) => (portfolio.activity || []).map((activity, index) => ({ portfolio, activity, index })))
  .sort((left, right) => String(right.activity.activity_date || "").localeCompare(String(left.activity.activity_date || "")))
  .slice(0, 20);

const InvestmentActivityPanel = ({ portfolios }) => {
  const rows = useMemo(() => activityRowsForPortfolios(portfolios), [portfolios]);
  return <Card className={activityStyles.activityCard}>
    <div className={sharedStyles.sectionHeading}>
      <div><h3>Aktivitas saham terbaru</h3><p>Pembelian, penjualan, harga manual, posisi awal, dan koreksi tampil sebagai event yang eksplisit.</p></div>
      <span>{rows.length.toLocaleString("id-ID")} terbaru</span>
    </div>
    {rows.length
      ? <ul className={activityStyles.activityList}>{rows.map(({ portfolio, activity, index }) => <ActivityItem key={`${portfolio.portfolio_id}:${activity.activity_type}:${activity.activity_id || index}`} activity={activity} portfolioName={portfolio.name} />)}</ul>
      : <p className={sharedStyles.inlineEmpty}>Belum ada aktivitas investasi yang tercatat.</p>}
  </Card>;
};

const InvestmentOverview = ({ data, owner, onAction, onSetup, onTransfer, onHolding }) => {
  const [activeTab, setActiveTab] = useState("portfolio");
  const portfolioTabRef = useRef(null);
  const activityTabRef = useRef(null);
  const activityCount = useMemo(() => data.portfolios.reduce((total, portfolio) => total + (portfolio.activity?.length || 0), 0), [data.portfolios]);
  const selectTabFromKeyboard = (event) => {
    const tabs = ["portfolio", "activity"];
    const currentIndex = tabs.indexOf(event.currentTarget.dataset.tab);
    if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    (nextTab === "portfolio" ? portfolioTabRef : activityTabRef).current?.focus();
  };
  return <div className={layoutStyles.dashboard}>
    <PortfolioHero summary={data.summary || {}} portfolioCount={data.portfolios.length} />
    <div className={layoutStyles.segment} role="tablist" aria-label="Tampilan investasi">
      <button ref={portfolioTabRef} id="investment-tab-portfolio" data-tab="portfolio" className={activeTab === "portfolio" ? layoutStyles.segmentActive : ""} type="button" role="tab" aria-selected={activeTab === "portfolio"} aria-controls="investment-panel-portfolio" tabIndex={activeTab === "portfolio" ? 0 : -1} onKeyDown={selectTabFromKeyboard} onClick={() => setActiveTab("portfolio")}>Portfolio <span>{data.portfolios.length.toLocaleString("id-ID")}</span></button>
      <button ref={activityTabRef} id="investment-tab-activity" data-tab="activity" className={activeTab === "activity" ? layoutStyles.segmentActive : ""} type="button" role="tab" aria-selected={activeTab === "activity"} aria-controls="investment-panel-activity" tabIndex={activeTab === "activity" ? 0 : -1} onKeyDown={selectTabFromKeyboard} onClick={() => setActiveTab("activity")}>Aktivitas {activityCount ? <span>{Math.min(activityCount, 99).toLocaleString("id-ID")}{activityCount > 99 ? "+" : ""}</span> : null}</button>
    </div>
    {activeTab === "portfolio"
      ? <div id="investment-panel-portfolio" role="tabpanel" aria-labelledby="investment-tab-portfolio"><div className={layoutStyles.portfolioList}>{data.portfolios.map((portfolio) => <PortfolioCard key={portfolio.portfolio_id} portfolio={portfolio} instruments={data.instruments || []} owner={owner} onAction={onAction} onSetup={onSetup} onTransfer={onTransfer} onHolding={onHolding} />)}</div></div>
      : <div id="investment-panel-activity" role="tabpanel" aria-labelledby="investment-tab-activity"><InvestmentActivityPanel portfolios={data.portfolios} /></div>}
  </div>;
};

export default InvestmentOverview;
