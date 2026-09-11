import { useMemo, useRef, useState } from "react";
import { FiActivity, FiMinus, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";
import InvestmentAssetLogo from "./InvestmentAssetLogo.jsx";

import layoutStyles from "./InvestmentsPage.module.css";
import heroStyles from "./InvestmentHero.module.css";
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
  : `${value > 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const investmentTrendIcon = (value) => {
  const amount = Number(value || 0);
  if (amount > 0) return FiTrendingUp;
  if (amount < 0) return FiTrendingDown;
  return FiMinus;
};

const InvestmentHero = ({ summary, assetCount }) => {
  const values = summary || {};
  const total = Number(values.market_value || 0);
  const unrealizedPercent = investmentReturnPercent(values.unrealized_pl, values.cost_basis);
  const TrendIcon = investmentTrendIcon(values.unrealized_pl);
  const invested = Number(values.cost_basis || 0) > 0 || assetCount > 0;
  return (
    <section className={heroStyles.hero} aria-labelledby="investment-total-value">
      <div className={heroStyles.heroMain}>
        <div className={heroStyles.heroCopy}>
          <span className={heroStyles.heroLabel}>Total investasi tercatat</span>
          <strong className={heroStyles.heroValue} id="investment-total-value"><Money value={total} /></strong>
          <div className={heroStyles.heroReturnRow}>
            {invested ? <span className={`${heroStyles.heroReturn} ${tone(values.unrealized_pl)}`}>
              <TrendIcon aria-hidden="true" />
              <span><Money value={values.unrealized_pl} />{unrealizedPercent != null ? ` · ${percentLabel(unrealizedPercent)}` : ""}</span>
            </span> : <span className={heroStyles.heroReturn}>Belum ada aset tercatat</span>}
            <span className={heroStyles.heroMeta}>{assetCount.toLocaleString("id-ID")} aset</span>
          </div>
        </div>
        <dl className={heroStyles.heroMiniMetrics}>
          <div><dt>Modal tercatat</dt><dd><Money value={values.cost_basis} /></dd></div>
          <div><dt>Nilai saat ini</dt><dd><Money value={values.market_value} /></dd></div>
        </dl>
      </div>
      <div className={heroStyles.heroFooter}>
        <p>Harga memakai catatan manual terakhir, bukan harga pasar live.</p>
      </div>
    </section>
  );
};

const AssetRow = ({ portfolio, holding, onOpenDetail }) => {
  const mutualFund = isMutualFundInstrument(holding);
  const unrealized = Number(holding.unrealized_pl || 0);
  const returnPercent = investmentReturnPercent(unrealized, holding.cost_basis);
  const openOnKeyboard = (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenDetail(); }
  };
  return (
    <article data-native-enter className={`${holdingStyles.holdingCard} ${holdingStyles.holdingCardInteractive}`} role="button" tabIndex="0" onClick={onOpenDetail} onKeyDown={openOnKeyboard} aria-label={`Buka rincian ${holding.ticker || "aset"}`}>
      <div className={holdingStyles.holdingIdentity}>
        <InvestmentAssetLogo ticker={holding.ticker} className={holdingStyles.stockLogo} />
        <div>
          <div className={holdingStyles.holdingNameRow}><h4>{mutualFund ? holding.name || holding.ticker : holding.ticker || "Aset"}</h4></div>
          <p>{mutualFund ? holding.ticker || "Reksa Dana" : holding.name || "Instrumen investasi"}</p>
        </div>
      </div>
      <div className={holdingStyles.holdingValueBlock}>
        <strong><Money value={holding.market_value} /></strong>
        <small className={tone(unrealized)}>
          <Money value={unrealized} />{returnPercent != null ? ` (${percentLabel(returnPercent)})` : ""}
        </small>
      </div>
      {!portfolio.can_operate ? <span className="sr-only">Hanya dapat dilihat</span> : null}
    </article>
  );
};

const assetRowsForPortfolios = (portfolios = []) => portfolios.flatMap((portfolio) => (portfolio.holdings || []).map((holding) => ({ portfolio, holding })));

const AssetPanel = ({ portfolios, filter, onHolding }) => {
  const rows = useMemo(() => assetRowsForPortfolios(portfolios).filter(({ holding }) => {
    if (filter === "stock") return !isMutualFundInstrument(holding);
    if (filter === "fund") return isMutualFundInstrument(holding);
    return true;
  }), [filter, portfolios]);
  return <Card className={holdingStyles.assetListCard}>
    <div className={holdingStyles.assetFilters} role="group" aria-label="Filter jenis aset">
      <button type="button" aria-pressed={filter === "all"} data-filter="all">Semua</button>
      <button type="button" aria-pressed={filter === "stock"} data-filter="stock">Saham</button>
      <button type="button" aria-pressed={filter === "fund"} data-filter="fund">Reksa Dana</button>
    </div>
    <div className={holdingStyles.holdings}>
      {rows.length ? rows.map(({ portfolio, holding }) => <AssetRow key={`${portfolio.portfolio_id}:${holding.instrument_id}`} portfolio={portfolio} holding={holding} onOpenDetail={() => onHolding(portfolio, holding)} />) : <p className={sharedStyles.inlineEmpty}>Belum ada aset pada kategori ini.</p>}
    </div>
  </Card>;
};

const ActivityValue = ({ activity }) => {
  const mutualFund = isMutualFundInstrument(activity);
  const lotSize = Number(activity.lot_size || 100);
  const quantity = (shares) => mutualFund
    ? `${Number(shares || 0).toLocaleString("id-ID")} unit`
    : `${(Number(shares || 0) / lotSize).toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot`;
  if (activity.activity_type === "trade") return <><span>{activity.trade_type === "buy" ? "Nilai pembelian" : "Nilai penjualan"}</span><Money value={activity.cash_amount} /></>;
  if (activity.activity_type === "valuation") return <><span>Harga terakhir</span><Money value={activity.price_per_share} /></>;
  if (activity.activity_type === "opening_position") return <><span>Posisi awal</span><strong>{quantity(activity.share_delta)}</strong></>;
  if (Number(activity.share_delta || 0) !== 0) return <><span>Koreksi kepemilikan</span><strong>{Number(activity.share_delta || 0) > 0 ? "+" : ""}{quantity(activity.share_delta)}</strong></>;
  return <span>Koreksi tercatat</span>;
};

const activityRowsForPortfolios = (portfolios = []) => portfolios
  .flatMap((portfolio) => (portfolio.activity || []).filter((activity) => activity.instrument_id).map((activity, index) => ({ portfolio, activity, index })))
  .sort((left, right) => String(right.activity.activity_date || "").localeCompare(String(left.activity.activity_date || "")) || String(right.activity.created_at || "").localeCompare(String(left.activity.created_at || "")))
  .slice(0, 30);

const InvestmentActivityPanel = ({ portfolios }) => {
  const rows = useMemo(() => activityRowsForPortfolios(portfolios), [portfolios]);
  return <Card className={activityStyles.activityCard}>
    <div className={sharedStyles.sectionHeading}>
      <div><h3>Aktivitas terbaru</h3><p>Pembelian, penjualan, nilai manual, posisi awal, dan koreksi aset.</p></div>
      <span>{rows.length.toLocaleString("id-ID")} terbaru</span>
    </div>
    {rows.length ? <ul className={activityStyles.activityList}>{rows.map(({ portfolio, activity, index }) => <li key={`${portfolio.portfolio_id}:${activity.activity_type}:${activity.activity_id || index}`} className={activityStyles.activityItem} data-native-enter>
      <span className={activityStyles.activityIcon} aria-hidden="true"><FiActivity /></span>
      <div className={activityStyles.activityCopy}>
        <strong>{investmentActivityLabel(activity)}</strong>
        <small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small>
      </div>
      <div className={activityStyles.activityValue}><ActivityValue activity={activity} /></div>
    </li>)}</ul> : <p className={sharedStyles.inlineEmpty}>Belum ada aktivitas investasi yang tercatat.</p>}
  </Card>;
};

const InvestmentOverview = ({ data, onHolding }) => {
  const [activeTab, setActiveTab] = useState("assets");
  const [assetFilter, setAssetFilter] = useState("all");
  const assetTabRef = useRef(null);
  const activityTabRef = useRef(null);
  const assetCount = useMemo(() => assetRowsForPortfolios(data.portfolios).length, [data.portfolios]);
  const activityCount = useMemo(() => activityRowsForPortfolios(data.portfolios).length, [data.portfolios]);
  const selectTabFromKeyboard = (event) => {
    const tabs = ["assets", "activity"];
    const currentIndex = tabs.indexOf(event.currentTarget.dataset.tab);
    if (currentIndex < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    (nextTab === "assets" ? assetTabRef : activityTabRef).current?.focus();
  };
  return <div className={layoutStyles.dashboard}>
    <InvestmentHero summary={data.summary || {}} assetCount={assetCount} />
    <div className={layoutStyles.segment} role="tablist" aria-label="Tampilan investasi">
      <button ref={assetTabRef} id="investment-tab-assets" data-tab="assets" className={activeTab === "assets" ? layoutStyles.segmentActive : ""} type="button" role="tab" aria-selected={activeTab === "assets"} aria-controls="investment-panel-assets" tabIndex={activeTab === "assets" ? 0 : -1} onKeyDown={selectTabFromKeyboard} onClick={() => setActiveTab("assets")}>Aset <span>{assetCount.toLocaleString("id-ID")}</span></button>
      <button ref={activityTabRef} id="investment-tab-activity" data-tab="activity" className={activeTab === "activity" ? layoutStyles.segmentActive : ""} type="button" role="tab" aria-selected={activeTab === "activity"} aria-controls="investment-panel-activity" tabIndex={activeTab === "activity" ? 0 : -1} onKeyDown={selectTabFromKeyboard} onClick={() => setActiveTab("activity")}>Aktivitas {activityCount ? <span>{Math.min(activityCount, 99).toLocaleString("id-ID")}{activityCount > 99 ? "+" : ""}</span> : null}</button>
    </div>
    {activeTab === "assets"
      ? <div id="investment-panel-assets" role="tabpanel" aria-labelledby="investment-tab-assets" onClick={(event) => { const next = event.target.closest("button[data-filter]")?.dataset.filter; if (next) setAssetFilter(next); }}><AssetPanel portfolios={data.portfolios} filter={assetFilter} onHolding={onHolding} /></div>
      : <div id="investment-panel-activity" role="tabpanel" aria-labelledby="investment-tab-activity"><InvestmentActivityPanel portfolios={data.portfolios} /></div>}
  </div>;
};

export default InvestmentOverview;
