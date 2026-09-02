import {
  FiActivity,
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
import { investmentReturnPercent } from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const tone = (value) => Number(value || 0) > 0
  ? styles.positive
  : Number(value || 0) < 0
    ? styles.negative
    : "";

const percentLabel = (value) => value == null
  ? null
  : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const PortfolioHero = ({ summary, portfolioCount }) => {
  const unrealizedPercent = investmentReturnPercent(summary?.unrealized_pl, summary?.cost_basis);
  return (
    <section className={styles.hero} aria-labelledby="investment-total-value">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroHeader}>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Total nilai investasi</span>
          <strong className={styles.heroValue} id="investment-total-value"><Money value={summary?.portfolio_value} /></strong>
          <p className={styles.heroMeta}>
            {portfolioCount.toLocaleString("id-ID")} portfolio · {(summary?.holding_count || 0).toLocaleString("id-ID")} holding aktif
          </p>
        </div>
        <div className={`${styles.returnBadge} ${tone(summary?.unrealized_pl)}`}>
          <span>P/L belum direalisasi</span>
          <strong><Money value={summary?.unrealized_pl} /></strong>
          {unrealizedPercent != null ? <small>{percentLabel(unrealizedPercent)}</small> : null}
        </div>
      </div>

      <dl className={styles.heroMetrics}>
        <div><dt>Cash RDN</dt><dd><Money value={summary?.rdn_cash} /></dd></div>
        <div><dt>Nilai saham</dt><dd><Money value={summary?.market_value} /></dd></div>
        <div><dt>Modal saham</dt><dd><Money value={summary?.cost_basis} /></dd></div>
        <div><dt>Realized P/L</dt><dd className={tone(summary?.realized_pl)}><Money value={summary?.realized_pl} /></dd></div>
      </dl>
    </section>
  );
};

const PortfolioActions = ({ portfolio, instruments, owner, onAction, onSetup }) => {
  if (!portfolio.can_operate) {
    return <p className={styles.readOnlyNote}>Portfolio ini dapat dilihat, tetapi tidak dapat diubah oleh akun Anda.</p>;
  }
  const heldIds = new Set(portfolio.holdings.map((item) => item.instrument_id));
  const hasBuyInstrument = instruments.some((item) => item.status === "active");
  const hasHolding = portfolio.holdings.length > 0;
  const hasPriceInstrument = instruments.some((item) => item.status === "active" || heldIds.has(item.instrument_id));
  const guidance = !hasBuyInstrument
    ? "Belum ada instrumen saham aktif. Tambahkan instrumen agar Beli dan Harga tersedia."
    : !hasHolding
      ? "Jual tersedia setelah portfolio memiliki holding saham."
      : !hasPriceInstrument
        ? "Belum ada instrumen yang dapat diberi harga manual."
        : "";
  return (
    <>
      <div className={styles.quickActions} aria-label={`Aksi ${portfolio.name}`}>
        <Button className={`${styles.quickAction} ${styles.quickActionPrimary}`} icon={FiPlus} variant="primary" disabled={!hasBuyInstrument} onClick={() => onAction("buy", portfolio)}>Beli</Button>
        <Button className={styles.quickAction} icon={FiDollarSign} disabled={!hasHolding} onClick={() => onAction("sell", portfolio)}>Jual</Button>
        <Button className={styles.quickAction} icon={FiTrendingUp} disabled={!hasPriceInstrument} onClick={() => onAction("price", portfolio)}>Harga</Button>
        <Button className={styles.quickAction} icon={FiRefreshCw} onClick={() => onAction("reconcile", portfolio)}>Cocokkan</Button>
        {owner ? <Button className={`${styles.quickAction} ${styles.quickActionSecondary}`} icon={FiEdit3} onClick={() => onAction("correction", portfolio)}>Koreksi</Button> : null}
      </div>
      {guidance ? <div className={styles.actionGuidance} role="note"><span>{guidance}</span>{!hasBuyInstrument ? <Button type="button" onClick={onSetup}>Siapkan instrumen</Button> : null}</div> : null}
    </>
  );
};

const HoldingCard = ({ holding }) => {
  const lotSize = Number(holding.lot_size || 100);
  const lots = Math.floor(Number(holding.shares || 0) / lotSize);
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const tickerMark = String(holding.ticker || "--").slice(0, 2);
  return (
    <article className={styles.holdingCard}>
      <div className={styles.holdingIdentity}>
        <span className={styles.tickerMark} aria-hidden="true">{tickerMark}</span>
        <div>
          <h4>{holding.ticker || "Saham"}</h4>
          <p>{holding.name || "Instrumen investasi"}</p>
        </div>
      </div>
      <dl className={styles.holdingMetrics}>
        <div><dt>Kepemilikan</dt><dd>{lots.toLocaleString("id-ID")} lot · {Number(holding.shares || 0).toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Harga terakhir</dt><dd><Money value={holding.price_per_share} /></dd></div>
        <div><dt>Nilai sekarang</dt><dd><Money value={holding.market_value} /></dd></div>
        <div><dt>P/L</dt><dd className={tone(holding.unrealized_pl)}><Money value={holding.unrealized_pl} />{returnPercent != null ? <small>{percentLabel(returnPercent)}</small> : null}</dd></div>
      </dl>
    </article>
  );
};

const ActivityItem = ({ activity }) => {
  const isTrade = activity.activity_type === "trade";
  const isBuy = isTrade && activity.trade_type === "buy";
  const title = isTrade
    ? `${isBuy ? "Beli" : "Jual"} ${activity.ticker || "saham"}`
    : `Koreksi ${activity.ticker || "investasi"}`;
  const cashAmount = Number(activity.cash_amount || 0);
  return (
    <li className={styles.activityItem}>
      <span className={styles.activityIcon} aria-hidden="true"><FiActivity /></span>
      <div className={styles.activityCopy}>
        <strong>{title}</strong>
        <small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small>
      </div>
      <div className={styles.activityValue}>
        {isTrade ? <><span>{isBuy ? "RDN keluar" : "RDN masuk"}</span><Money value={cashAmount} /></> : cashAmount !== 0 ? <><span>Delta cash</span><Money value={cashAmount} /></> : <span>Koreksi tercatat</span>}
      </div>
    </li>
  );
};

const PortfolioCard = ({ portfolio, instruments, owner, onAction, onSetup }) => {
  const portfolioValue = Number(portfolio.rdn_cash || 0) + Number(portfolio.market_value || 0);
  const unrealizedPercent = investmentReturnPercent(portfolio.unrealized_pl, portfolio.cost_basis);
  return (
    <Card as="article" className={styles.portfolioCard}>
      <header className={styles.portfolioHeader}>
        <div className={styles.portfolioTitleBlock}>
          <span className={styles.portfolioBroker}>{portfolio.broker === "ajaib" ? "Ajaib" : "Broker lain"}</span>
          <h2>{portfolio.name}</h2>
          <p>RDN {portfolio.rdn_account_name}</p>
        </div>
        <div className={styles.portfolioValue}>
          <span>Nilai portfolio</span>
          <strong><Money value={portfolioValue} /></strong>
          <small className={tone(portfolio.unrealized_pl)}>
            <Money value={portfolio.unrealized_pl} />{unrealizedPercent != null ? ` · ${percentLabel(unrealizedPercent)}` : ""}
          </small>
        </div>
      </header>

      <PortfolioActions portfolio={portfolio} instruments={instruments} owner={owner} onAction={onAction} onSetup={onSetup} />

      <section className={styles.composition} aria-label={`Komposisi ${portfolio.name}`}>
        <div className={styles.sectionHeading}>
          <div><h3>Komposisi nilai</h3><p>Cash RDN dibanding nilai saham saat ini.</p></div>
          <span><Money value={portfolio.rdn_cash} /> cash</span>
        </div>
        <ProgressBar value={portfolio.market_value} max={portfolioValue} label="Porsi nilai saham" />
        <dl className={styles.compositionMetrics}>
          <div><dt>Cash RDN</dt><dd><Money value={portfolio.rdn_cash} /></dd></div>
          <div><dt>Nilai saham</dt><dd><Money value={portfolio.market_value} /></dd></div>
          <div><dt>Realized P/L</dt><dd className={tone(portfolio.realized_pl)}><Money value={portfolio.realized_pl} /></dd></div>
          <div><dt>Unrealized P/L</dt><dd className={tone(portfolio.unrealized_pl)}><Money value={portfolio.unrealized_pl} /></dd></div>
        </dl>
      </section>

      <section className={styles.holdingsSection} aria-labelledby={`holdings-${portfolio.portfolio_id}`}>
        <div className={styles.sectionHeading}>
          <div><h3 id={`holdings-${portfolio.portfolio_id}`}>Holding saham</h3><p>Nilai memakai harga manual terakhir atau harga trade terakhir sebagai fallback.</p></div>
          <span>{portfolio.holdings.length.toLocaleString("id-ID")} saham</span>
        </div>
        {portfolio.holdings.length
          ? <div className={styles.holdings}>{portfolio.holdings.map((holding) => <HoldingCard key={holding.instrument_id} holding={holding} />)}</div>
          : <p className={styles.inlineEmpty}>Belum ada saham. Deposit RDN melalui Transfer rekening, lalu catat pembelian.</p>}
      </section>

      {portfolio.activity?.length ? (
        <section className={styles.activitySection} aria-labelledby={`activity-${portfolio.portfolio_id}`}>
          <div className={styles.sectionHeading}>
            <div><h3 id={`activity-${portfolio.portfolio_id}`}>Aktivitas terbaru</h3><p>Trade dan koreksi yang tersimpan pada histori investasi.</p></div>
          </div>
          <ul className={styles.activityList}>{portfolio.activity.slice(0, 5).map((activity) => <ActivityItem key={activity.activity_id} activity={activity} />)}</ul>
        </section>
      ) : null}
    </Card>
  );
};

const InvestmentOverview = ({ data, owner, onAction, onSetup }) => (
  <div className={styles.dashboard}>
    <PortfolioHero summary={data.summary || {}} portfolioCount={data.portfolios.length} />
    <div className={styles.portfolioList}>
      {data.portfolios.map((portfolio) => <PortfolioCard key={portfolio.portfolio_id} portfolio={portfolio} instruments={data.instruments || []} owner={owner} onAction={onAction} onSetup={onSetup} />)}
    </div>
  </div>
);

export default InvestmentOverview;
