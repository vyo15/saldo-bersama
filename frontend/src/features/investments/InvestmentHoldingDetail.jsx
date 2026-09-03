import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import {
  investmentActivityForInstrument,
  investmentPriceSourceLabel,
  investmentProfitLossLabel,
  investmentReturnPercent,
} from "./investments.model.js";
import styles from "./InvestmentsPage.module.css";

const signedNumber = (value) => {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("id-ID")}`;
};

const signedMoney = (value) => {
  const number = Number(value || 0);
  return <span className={number > 0 ? styles.positive : number < 0 ? styles.negative : ""}><Money value={number} /></span>;
};

const tradeActivityDetail = (activity) => {
  const buy = activity.trade_type === "buy";
  const lots = Number(activity.lots || 0).toLocaleString("id-ID");
  const shares = Number(activity.share_quantity || 0).toLocaleString("id-ID");
  return {
    title: buy ? "Pembelian dicatat" : "Penjualan dicatat",
    description: `${lots} lot · ${shares} lembar @ ${Number(activity.price_per_share || 0).toLocaleString("id-ID")}`,
    amountLabel: buy ? "RDN keluar" : "RDN masuk",
    amount: Number(activity.cash_amount || 0),
    fee: Number(activity.fee_amount || 0),
  };
};

const ActivityDetail = ({ activity }) => {
  if (activity.activity_type === "trade") {
    const detail = tradeActivityDetail(activity);
    return (
      <li className={styles.holdingHistoryItem}>
        <div><strong>{detail.title}</strong><small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small><span>{detail.description}</span></div>
        <div><span>{detail.amountLabel}</span><Money value={detail.amount} />{detail.fee ? <small>Fee <Money value={detail.fee} /></small> : null}</div>
      </li>
    );
  }
  if (activity.activity_type === "valuation") {
    return (
      <li className={styles.holdingHistoryItem}>
        <div><strong>Harga manual diperbarui</strong><small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small><span>Snapshot harga untuk perhitungan nilai tercatat.</span></div>
        <div><span>Harga per lembar</span><Money value={activity.price_per_share || 0} /></div>
      </li>
    );
  }
  return (
    <li className={styles.holdingHistoryItem}>
      <div><strong>Koreksi pencatatan</strong><small>{formatDateLongIndonesia(activity.activity_date) || activity.activity_date}</small><span>{activity.reason || "Koreksi dicatat oleh Administrator."}</span></div>
      <div className={styles.correctionDeltas}>
        {Number(activity.share_delta || 0) ? <span>Lembar {signedNumber(activity.share_delta)}</span> : null}
        {Number(activity.cost_basis_delta || 0) ? <span>Modal {signedMoney(activity.cost_basis_delta)}</span> : null}
        {Number(activity.cash_amount || 0) ? <span>Cash {signedMoney(activity.cash_amount)}</span> : null}
      </div>
    </li>
  );
};

const toneClass = (value) => {
  const number = Number(value || 0);
  if (number > 0) return styles.positive;
  if (number < 0) return styles.negative;
  return "";
};

const holdingPriceDateLabel = (holding) => {
  if (!holding.valuation_date) return "Belum ada harga";
  return formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date;
};

const holdingReturnLabel = (holding) => {
  const percent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const result = investmentProfitLossLabel(holding.unrealized_pl);
  if (percent == null) return result;
  const sign = percent >= 0 ? "+" : "";
  return `${result} · ${sign}${percent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
};

const holdingPositionLabel = (holding) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const lots = lotSize > 0 ? shares / lotSize : 0;
  return `${lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot · ${shares.toLocaleString("id-ID")} lembar`;
};

const HoldingSummary = ({ holding }) => (
  <section className={styles.holdingDetailSummary} aria-label={`Posisi ${holding.ticker || "saham"}`}>
    <div><span>Kepemilikan</span><strong>{holdingPositionLabel(holding)}</strong></div>
    <div><span>Harga rata-rata</span><strong><Money value={holding.average_cost || 0} /></strong></div>
    <div><span>Modal tersisa</span><strong><Money value={holding.cost_basis || 0} /></strong></div>
    <div><span>{investmentPriceSourceLabel(holding)}</span><strong><Money value={holding.price_per_share || 0} /></strong><small>{holdingPriceDateLabel(holding)}</small></div>
    <div><span>Nilai tercatat</span><strong><Money value={holding.market_value || 0} /></strong></div>
    <div><span>Hasil belum direalisasi</span><strong className={toneClass(holding.unrealized_pl)}><Money value={holding.unrealized_pl || 0} /></strong><small>{holdingReturnLabel(holding)}</small></div>
    <div><span>Hasil terealisasi</span><strong className={toneClass(holding.realized_pl)}><Money value={holding.realized_pl || 0} /></strong></div>
  </section>
);

const HoldingHistory = ({ history }) => (
  <section className={styles.holdingHistory} aria-labelledby="investment-holding-history-title">
    <div className={styles.sectionHeading}>
      <div><h3 id="investment-holding-history-title">Aktivitas saham terbaru</h3><p>Menampilkan hingga 20 aktivitas terbaru saham ini dari catatan Investasi.</p></div>
      <span>{history.length.toLocaleString("id-ID")} aktivitas</span>
    </div>
    {history.length
      ? <ul className={styles.holdingHistoryList}>{history.map((item) => <ActivityDetail key={item.activity_id} activity={item} />)}</ul>
      : <p className={styles.inlineEmpty}>Belum ada aktivitas rinci yang tersedia untuk saham ini.</p>}
  </section>
);

const InvestmentHoldingDetail = ({ holding, activity = [], onClose }) => {
  if (!holding) return null;
  const history = investmentActivityForInstrument(activity, holding.instrument_id);
  return (
    <Modal
      open
      title={`${holding.ticker || "Saham"} · rincian investasi`}
      description="Rincian ini berasal dari transaksi, koreksi, dan harga manual yang Anda catat di Saldo Bersama; bukan data live dari aplikasi investasi."
      onClose={onClose}
      size="lg"
    >
      <div className={styles.holdingDetail}>
        <HoldingSummary holding={holding} />
        <HoldingHistory history={history} />
      </div>
    </Modal>
  );
};

export default InvestmentHoldingDetail;
