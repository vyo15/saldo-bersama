import { FiChevronDown, FiEdit3, FiMoreHorizontal } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";
import InvestmentUnitPrice from "./InvestmentUnitPrice.jsx";
import InvestmentAssetLogo from "./InvestmentAssetLogo.jsx";

import formStyles from "./InvestmentForm.module.css";
import activityStyles from "./InvestmentActivity.module.css";
import styles from "./InvestmentHoldingDetail.module.css";

const performanceLabel = (value) => Number(value || 0) > 0 ? "Untung" : Number(value || 0) < 0 ? "Rugi" : "Impas";
const percentLabel = (value) => value == null ? "" : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
const performanceTone = (value) => Number(value || 0) > 0 ? styles.positive : Number(value || 0) < 0 ? styles.negative : styles.neutral;
const holdingQuantityLabel = (shares, holding) => isMutualFundInstrument(holding)
  ? `${Number(shares || 0).toLocaleString("id-ID")} unit`
  : `${(Number(shares || 0) / Number(holding?.lot_size || 100)).toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot`;

const HoldingActivityValue = ({ item, holding }) => {
  const trade = item.activity_type === "trade";
  const buy = trade && item.trade_type === "buy";
  const valuation = item.activity_type === "valuation";
  const opening = item.activity_type === "opening_position";
  if (trade && buy) return <><span>Nilai pembelian</span><Money value={item.cash_amount} /></>;
  if (trade) return <><span>Hasil penjualan</span><Money value={item.cash_amount} />{Number.isFinite(Number(item.realized_pl)) ? <span>{performanceLabel(item.realized_pl)} · <Money value={item.realized_pl} /></span> : null}</>;
  if (valuation) return <><span>Harga referensi</span><InvestmentUnitPrice value={item.price_per_share} /></>;
  if (opening) return <><span>Posisi awal</span><strong>{holdingQuantityLabel(item.share_delta, holding)}</strong></>;
  return <span>Koreksi tercatat</span>;
};

const HoldingActivity = ({ items, holding }) => {
  if (!items.length) return <p className={styles.emptyHistory}>Belum ada aktivitas investasi ini pada ringkasan histori terbaru.</p>;
  return <ul className={activityStyles.activityList}>
    {items.map((item) => <li key={`${item.activity_type}:${item.activity_id}`} className={activityStyles.activityItem}>
      <div className={activityStyles.activityCopy}>
        <strong>{investmentActivityLabel({ ...item, ticker: holding.ticker || item.ticker, asset_type: holding.asset_type })}</strong>
        <small>{formatDateLongIndonesia(item.activity_date) || item.activity_date}</small>
      </div>
      <div className={activityStyles.activityValue}><HoldingActivityValue item={item} holding={holding} /></div>
    </li>)}
  </ul>;
};

const Metric = ({ label, children }) => <div className={styles.metric}><dt>{label}</dt><dd>{children}</dd></div>;

const ActivePositionMetrics = ({ holding, mutualFund, quantityLabel }) => <>
  <Metric label={mutualFund ? "Unit dimiliki" : "Lot dimiliki"}>{quantityLabel}</Metric>
  <Metric label={mutualFund ? "Rata-rata nilai/unit" : "Rata-rata harga/lembar"}><InvestmentUnitPrice value={holding.average_cost} /></Metric>
  <Metric label="Modal tercatat"><Money value={holding.cost_basis} /></Metric>
  <Metric label={mutualFund ? "Nilai per unit terakhir" : "Harga catatan terakhir"}>
    <InvestmentUnitPrice value={holding.price_per_share} />
    {holding.valuation_date ? <small>{formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}</small> : null}
  </Metric>
  {Number(holding.realized_cost_basis || 0) > 0 ? <Metric label="Hasil yang sudah direalisasi"><Money value={holding.realized_pl} /></Metric> : null}
</>;

const ClosedPositionMetrics = ({ holding, mutualFund, quantityLabel }) => <>
  <Metric label={mutualFund ? "Sisa unit" : "Sisa lot"}>{quantityLabel}</Metric>
  <Metric label="Modal yang dilepas"><Money value={holding.realized_cost_basis} /></Metric>
  <Metric label="Total hasil penjualan"><Money value={holding.sale_proceeds} /></Metric>
  {holding.last_activity_date ? <Metric label="Aktivitas terakhir">{formatDateLongIndonesia(holding.last_activity_date) || holding.last_activity_date}</Metric> : null}
</>;

const HoldingDetailFooter = ({ portfolio, holding, closed, onClose, onAction }) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const freeShares = Number(holding.unallocated_shares ?? shares);
  const goalShares = (holding.goal_allocations || []).some((allocation) => Number(allocation.shares || 0) >= (isMutualFundInstrument(holding) ? 0.01 : lotSize));
  const canSell = portfolio.can_operate && !closed && (freeShares >= (isMutualFundInstrument(holding) ? 0.01 : lotSize) || goalShares);
  return <div className={`${styles.actions} ${formStyles.holdingActions} form-actions`}>
    {portfolio.can_operate ? <Button type="button" variant={canSell ? "secondary" : "primary"} onClick={() => onAction("buy", portfolio, { initialInstrumentId: holding.instrument_id })}>Beli</Button> : null}
    {canSell ? <Button type="button" variant="primary" onClick={() => onAction("sell", portfolio, { initialInstrumentId: holding.instrument_id })}>Jual</Button> : null}
    {portfolio.can_operate && !closed ? <details className={formStyles.holdingActionMenu}><summary aria-label="Aksi investasi lainnya" title="Aksi lainnya"><FiMoreHorizontal aria-hidden="true" /></summary><div><Button type="button" icon={FiEdit3} onClick={() => onAction("price", portfolio, { initialInstrumentId: holding.instrument_id })}>Perbarui nilai</Button><Button type="button" onClick={onClose}>Tutup detail</Button></div></details> : <Button type="button" onClick={onClose}>Tutup</Button>}
  </div>;
};

const HoldingValueSummary = ({ holding, closed, returnAmount, returnPercent }) => (
  <section className={styles.valueBlock} aria-label={closed ? "Hasil investasi selesai" : "Ringkasan nilai investasi"}>
    <span className={styles.valueLabel}>{closed ? "Hasil direalisasi" : "Nilai tercatat"}</span>
    <strong className={`${styles.value} ${closed ? performanceTone(returnAmount) : ""}`}>
      <Money value={closed ? holding.realized_pl : holding.market_value} />
    </strong>
    <span className={`${styles.returnValue} ${performanceTone(returnAmount)}`}>
      {closed ? "Hasil akhir" : "Hasil belum direalisasi"} · {performanceLabel(returnAmount)}
      {closed ? null : <> · <Money value={returnAmount} /></>}
      {returnPercent != null ? ` (${percentLabel(returnPercent)})` : ""}
    </span>
  </section>
);

const InvestmentHoldingDetail = ({ portfolio, holding, onClose, onAction }) => {
  if (!portfolio || !holding) return null;
  const shares = Number(holding.shares || 0);
  const mutualFund = isMutualFundInstrument(holding);
  const quantityLabel = holdingQuantityLabel(shares, holding);
  const closed = Boolean(holding.is_closed) || shares <= 0;
  const returnAmount = closed ? holding.realized_pl : holding.unrealized_pl;
  const returnPercent = investmentReturnPercent(returnAmount, closed ? holding.realized_cost_basis : holding.cost_basis);
  const activities = (portfolio.activity || []).filter((item) => item.instrument_id === holding.instrument_id).slice(0, 10);
  const footer = <HoldingDetailFooter portfolio={portfolio} holding={holding} closed={closed} onClose={onClose} onAction={onAction} />;
  return <Modal open size="sm" title={holding.ticker || "Detail investasi"} onClose={onClose} footer={footer}>
    <div className={styles.detail}>
      <div className={styles.identity}>
        <InvestmentAssetLogo ticker={holding.ticker} size="sm" />
        <div className={styles.identityCopy}>
          <strong>{holding.name || "Instrumen investasi"}</strong>
          <span>{mutualFund ? "Reksa Dana" : "Saham"} · Catatan manual</span>
        </div>
        <span className={styles.status}>{closed ? "Posisi selesai" : "Posisi aktif"}</span>
      </div>

      <HoldingValueSummary holding={holding} closed={closed} returnAmount={returnAmount} returnPercent={returnPercent} />

      <dl className={styles.metrics}>
        {closed ? <ClosedPositionMetrics holding={holding} mutualFund={mutualFund} quantityLabel={quantityLabel} /> : <ActivePositionMetrics holding={holding} mutualFund={mutualFund} quantityLabel={quantityLabel} />}
      </dl>

      <p className={styles.manualNote}>Nilai berdasarkan catatan manual atau transaksi terakhir, bukan harga pasar live.</p>

      <details className={styles.history}>
        <summary>
          <span>Riwayat aset <small>{activities.length ? `${activities.length.toLocaleString("id-ID")} aktivitas terbaru` : "Belum ada aktivitas terbaru"}</small></span>
          <FiChevronDown aria-hidden="true" />
        </summary>
        <div className={styles.historyContent}><HoldingActivity items={activities} holding={holding} /></div>
      </details>
    </div>
  </Modal>;
};

export default InvestmentHoldingDetail;
