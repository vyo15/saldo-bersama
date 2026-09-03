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
import {
  investmentOwnershipLabel,
  investmentPriceSourceLabel,
  investmentProfitLossLabel,
  investmentReturnPercent,
} from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const tone = (value) => Number(value || 0) > 0
  ? styles.positive
  : Number(value || 0) < 0
    ? styles.negative
    : "";

const percentLabel = (value) => value == null
  ? null
  : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const safeId = (value) => String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "-");

const profitLabel = (value, percent) => {
  const suffix = percent == null ? "" : ` · ${percentLabel(percent)}`;
  return `${investmentProfitLossLabel(value)}${suffix}`;
};

const PortfolioHero = ({ summary, investmentCount }) => {
  const unrealizedPercent = investmentReturnPercent(summary?.unrealized_pl, summary?.cost_basis);
  return (
    <section className={styles.hero} aria-labelledby="investment-total-value">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroHeader}>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Total aset investasi tercatat</span>
          <strong className={styles.heroValue} id="investment-total-value"><Money value={summary?.portfolio_value} /></strong>
          <p className={styles.heroMeta}>
            {investmentCount.toLocaleString("id-ID")} rekening investasi · {(summary?.holding_count || 0).toLocaleString("id-ID")} saham · berdasarkan catatan transaksi dan harga manual terakhir
          </p>
        </div>
        <div className={`${styles.returnBadge} ${tone(summary?.unrealized_pl)}`}>
          <span>Hasil belum direalisasi</span>
          <strong><Money value={summary?.unrealized_pl} /></strong>
          <small>{profitLabel(summary?.unrealized_pl, unrealizedPercent)}</small>
        </div>
      </div>

      <dl className={styles.heroMetrics}>
        <div><dt>Cash RDN</dt><dd><Money value={summary?.rdn_cash} /></dd></div>
        <div><dt>Nilai saham tercatat</dt><dd><Money value={summary?.market_value} /></dd></div>
        <div><dt>Modal saham tersisa</dt><dd><Money value={summary?.cost_basis} /></dd></div>
        <div><dt>Hasil terealisasi</dt><dd className={tone(summary?.realized_pl)}><Money value={summary?.realized_pl} /></dd></div>
      </dl>
    </section>
  );
};

const portfolioActionGuidance = ({ hasBuyInstrument, hasHolding, hasSellableHolding, hasPriceInstrument, owner }) => {
  if (!hasBuyInstrument) {
    if (hasPriceInstrument) return "Belum ada instrumen aktif untuk Catat beli. Saham yang masih dimiliki tetap dapat diperbarui harganya dan dicocokkan.";
    return owner ? "Belum ada instrumen saham aktif. Tambahkan instrumen agar Catat beli tersedia." : "Belum ada instrumen saham aktif. Instrumen baru dikelola Administrator.";
  }
  if (!hasHolding) return "Catat jual dan Perbarui harga tersedia setelah catatan memiliki saham.";
  if (!hasSellableHolding) return owner
    ? "Saham tercatat kurang dari 1 lot sehingga belum dapat dicatat sebagai penjualan lot. Gunakan Koreksi bila jumlah lembar memang perlu diperbaiki."
    : "Saham tercatat kurang dari 1 lot sehingga belum dapat dicatat sebagai penjualan lot. Hubungi Administrator bila jumlah lembar perlu diperbaiki.";
  if (!hasPriceInstrument) return "Belum ada saham yang dapat diberi harga manual.";
  return "";
};

const PortfolioActions = ({ portfolio, instruments, owner, onAction, onSetup }) => {
  if (!portfolio.can_operate) {
    return <p className={styles.readOnlyNote}>Catatan ini dapat dilihat untuk transparansi, tetapi hanya pemilik rekening yang dapat mengubah transaksi dan harga investasinya.</p>;
  }
  const heldIds = new Set(portfolio.holdings.map((item) => item.instrument_id));
  const hasBuyInstrument = instruments.some((item) => item.status === "active");
  const hasHolding = portfolio.holdings.length > 0;
  const hasSellableHolding = portfolio.holdings.some((item) => Number(item.shares || 0) >= Number(item.lot_size || 100));
  const hasPriceInstrument = instruments.some((item) => heldIds.has(item.instrument_id));
  const guidance = portfolioActionGuidance({ hasBuyInstrument, hasHolding, hasSellableHolding, hasPriceInstrument, owner });
  return (
    <>
      <div className={styles.quickActions} aria-label={`Aksi Investasi ${investmentOwnershipLabel(portfolio)}`}>
        <Button className={`${styles.quickAction} ${styles.quickActionPrimary}`} icon={FiPlus} variant="primary" disabled={!hasBuyInstrument} onClick={() => onAction("buy", portfolio)}>Catat beli</Button>
        <Button className={styles.quickAction} icon={FiDollarSign} disabled={!hasSellableHolding} onClick={() => onAction("sell", portfolio)}>Catat jual</Button>
        <Button className={styles.quickAction} icon={FiTrendingUp} disabled={!hasPriceInstrument} onClick={() => onAction("price", portfolio)}>Perbarui harga</Button>
        <Button className={styles.quickAction} icon={FiRefreshCw} onClick={() => onAction("reconcile", portfolio)}>Cocokkan catatan</Button>
      </div>
      {owner ? <div className={styles.advancedActions}><Button icon={FiEdit3} onClick={() => onAction("correction", portfolio)}>Koreksi pencatatan</Button></div> : null}
      {guidance ? <div className={styles.actionGuidance} role="note"><span>{guidance}</span>{!hasBuyInstrument && owner ? <Button type="button" onClick={() => onSetup("instrument")}>Tambah instrumen</Button> : null}</div> : null}
    </>
  );
};

const RdnFlow = ({ portfolio, onTransfer }) => (
  <section className={styles.rdnFlow} aria-label={`Cash RDN Investasi ${investmentOwnershipLabel(portfolio)}`}>
    <div>
      <span>Cash RDN</span>
      <strong><Money value={portfolio.rdn_cash || 0} /></strong>
      <small>Tambah atau tarik dana melalui Transfer rekening. Transfer internal tidak menjadi pemasukan atau pengeluaran.</small>
    </div>
    {portfolio.can_operate ? (
      <div className={styles.rdnActions}>
        <Button type="button" onClick={() => onTransfer("deposit", portfolio)}>Tambah dana</Button>
        <Button type="button" disabled={Number(portfolio.rdn_cash || 0) <= 0} onClick={() => onTransfer("withdraw", portfolio)}>Tarik dana</Button>
      </div>
    ) : null}
  </section>
);

const HoldingCard = ({ holding, onDetail }) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const lots = lotSize > 0 ? shares / lotSize : 0;
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const tickerMark = String(holding.ticker || "--").slice(0, 2);
  return (
    <article className={styles.holdingCard}>
      <div className={styles.holdingIdentity}>
        <span className={styles.tickerMark} aria-hidden="true">{tickerMark}</span>
        <div>
          <h4>{holding.ticker || "Saham"}</h4>
          <p>{holding.name || "Instrumen investasi"}</p>
          <button type="button" className={styles.holdingDetailAction} onClick={onDetail}>Rincian & aktivitas</button>
        </div>
      </div>
      <dl className={styles.holdingMetrics}>
        <div><dt>Kepemilikan</dt><dd>{lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot · {shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Harga rata-rata</dt><dd><Money value={holding.average_cost || 0} /></dd></div>
        <div><dt>Modal tersisa</dt><dd><Money value={holding.cost_basis || 0} /></dd></div>
        <div><dt>{investmentPriceSourceLabel(holding)}</dt><dd><Money value={holding.price_per_share} />{holding.valuation_date ? <small>{formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}</small> : null}</dd></div>
        <div><dt>Nilai tercatat</dt><dd><Money value={holding.market_value} /></dd></div>
        <div><dt>Hasil belum direalisasi</dt><dd className={tone(holding.unrealized_pl)}><Money value={holding.unrealized_pl} /><small>{profitLabel(holding.unrealized_pl, returnPercent)}</small></dd></div>
      </dl>
    </article>
  );
};

const activityMeta = (activity) => {
  if (activity.activity_type === "valuation") return { title: `Harga ${activity.ticker || "saham"} diperbarui`, label: "Harga per lembar", value: activity.price_per_share || 0 };
  if (activity.activity_type === "trade") {
    const buy = activity.trade_type === "buy";
    return { title: `${buy ? "Pembelian" : "Penjualan"} ${activity.ticker || "saham"}`, label: buy ? "RDN keluar" : "RDN masuk", value: activity.cash_amount || 0 };
  }
  return { title: `Koreksi ${activity.ticker || "investasi"}`, label: Number(activity.cash_amount || 0) ? "Delta cash" : "Status", value: activity.cash_amount || 0 };
};

const ActivityItem = ({ activity }) => {
  const meta = activityMeta(activity);
  const tradeDetail = activity.activity_type === "trade" && Number(activity.share_quantity || 0)
    ? `${Number(activity.lots || 0).toLocaleString("id-ID")} lot · ${Number(activity.share_quantity || 0).toLocaleString("id-ID")} lembar`
    : "";
  return (
    <li className={styles.activityItem}>
      <span className={styles.activityIcon} aria-hidden="true"><FiActivity /></span>
      <div className={styles.activityCopy}>
        <strong>{meta.title}</strong>
        <small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}{tradeDetail ? ` · ${tradeDetail}` : ""}</small>
      </div>
      <div className={styles.activityValue}>
        <span>{meta.label}</span>
        {meta.label === "Status" ? <strong>Koreksi tercatat</strong> : <Money value={meta.value} />}
      </div>
    </li>
  );
};

const PortfolioCard = ({ portfolio, instruments, owner, onAction, onSetup, onTransfer, onHoldingDetail }) => {
  const investmentValue = Number(portfolio.rdn_cash || 0) + Number(portfolio.market_value || 0);
  const unrealizedPercent = investmentReturnPercent(portfolio.unrealized_pl, portfolio.cost_basis);
  const ownership = investmentOwnershipLabel(portfolio);
  return (
    <Card as="article" id={`investment-rdn-${safeId(portfolio.rdn_account_id)}`} className={styles.portfolioCard}>
      <header className={styles.portfolioHeader}>
        <div className={styles.portfolioTitleBlock}>
          <span className={styles.portfolioBroker}>{portfolio.name && portfolio.name !== "Catatan investasi" ? `Sumber catatan · ${portfolio.name}` : "Catatan manual"}</span>
          <h2>Investasi · {ownership}</h2>
          <p>Cash RDN dan saham pada rekening ini dicatat sebagai satu posisi aset. Tidak ada sinkronisasi aplikasi investasi.</p>
        </div>
        <div className={styles.portfolioValue}>
          <span>Total aset investasi</span>
          <strong><Money value={investmentValue} /></strong>
          <small className={tone(portfolio.unrealized_pl)}><Money value={portfolio.unrealized_pl} /> · {profitLabel(portfolio.unrealized_pl, unrealizedPercent)}</small>
        </div>
      </header>

      <RdnFlow portfolio={portfolio} onTransfer={onTransfer} />
      <PortfolioActions portfolio={portfolio} instruments={instruments} owner={owner} onAction={onAction} onSetup={onSetup} />

      <section className={styles.composition} aria-label={`Komposisi Investasi ${ownership}`}>
        <div className={styles.sectionHeading}>
          <div><h3>Komposisi aset investasi</h3><p>Cash RDN dibanding nilai saham berdasarkan harga terakhir yang Anda catat.</p></div>
          <span><Money value={portfolio.rdn_cash} /> cash</span>
        </div>
        <ProgressBar value={portfolio.market_value} max={investmentValue} label="Porsi nilai saham" />
        <dl className={styles.compositionMetrics}>
          <div><dt>Cash RDN</dt><dd><Money value={portfolio.rdn_cash} /></dd></div>
          <div><dt>Nilai saham tercatat</dt><dd><Money value={portfolio.market_value} /></dd></div>
          <div><dt>Hasil terealisasi</dt><dd className={tone(portfolio.realized_pl)}><Money value={portfolio.realized_pl} /></dd></div>
          <div><dt>Hasil belum direalisasi</dt><dd className={tone(portfolio.unrealized_pl)}><Money value={portfolio.unrealized_pl} /></dd></div>
        </dl>
      </section>

      <section className={styles.holdingsSection} aria-labelledby={`holdings-${portfolio.portfolio_id}`}>
        <div className={styles.sectionHeading}>
          <div><h3 id={`holdings-${portfolio.portfolio_id}`}>Saham yang dimiliki</h3><p>Inilah posisi saham aktual berdasarkan transaksi yang Anda catat. Harga tetap manual atau fallback dari transaksi terakhir, bukan harga pasar live.</p></div>
          <span>{portfolio.holdings.length.toLocaleString("id-ID")} saham</span>
        </div>
        {portfolio.holdings.length
          ? <div className={styles.holdings}>{portfolio.holdings.map((holding) => <HoldingCard key={holding.instrument_id} holding={holding} onDetail={() => onHoldingDetail(portfolio, holding)} />)}</div>
          : <p className={styles.inlineEmpty}>Belum ada saham tercatat. Tambahkan dana melalui Transfer bila perlu, lakukan transaksi di aplikasi investasi Anda, lalu gunakan Catat beli di sini.</p>}
      </section>

      {portfolio.activity?.length ? (
        <section className={styles.activitySection} aria-labelledby={`activity-${portfolio.portfolio_id}`}>
          <div className={styles.sectionHeading}>
            <div><h3 id={`activity-${portfolio.portfolio_id}`}>Aktivitas terbaru</h3><p>Pembelian, penjualan, harga manual, dan koreksi yang benar-benar tersimpan pada catatan Investasi.</p></div>
          </div>
          <ul className={styles.activityList}>{portfolio.activity.slice(0, 6).map((activity) => <ActivityItem key={activity.activity_id} activity={activity} />)}</ul>
        </section>
      ) : null}
    </Card>
  );
};

const InvestmentOverview = ({ data, owner, onAction, onSetup, onTransfer, onHoldingDetail }) => (
  <div className={styles.dashboard}>
    <PortfolioHero summary={data.summary || {}} investmentCount={data.portfolios.length} />
    <div className={styles.portfolioList}>
      {data.portfolios.map((portfolio) => <PortfolioCard key={portfolio.portfolio_id} portfolio={portfolio} instruments={data.instruments || []} owner={owner} onAction={onAction} onSetup={onSetup} onTransfer={onTransfer} onHoldingDetail={onHoldingDetail} />)}
    </div>
  </div>
);

export default InvestmentOverview;
