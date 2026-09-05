import { FiDollarSign, FiTrendingUp } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";

import formStyles from "./InvestmentForm.module.css";
import activityStyles from "./InvestmentActivity.module.css";
import sharedStyles from "./InvestmentShared.module.css";

const performanceLabel = (value) => Number(value || 0) > 0 ? "Untung" : Number(value || 0) < 0 ? "Rugi" : "Impas";
const percentLabel = (value) => value == null ? "" : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const HoldingActivity = ({ portfolio, holding }) => {
  const items = (portfolio.activity || []).filter((item) => item.instrument_id === holding.instrument_id).slice(0, 10);
  if (!items.length) return <p className={sharedStyles.inlineEmpty}>Belum ada aktivitas saham ini pada ringkasan histori terbaru.</p>;
  return <ul className={activityStyles.activityList}>
    {items.map((item) => {
      const trade = item.activity_type === "trade";
      const buy = trade && item.trade_type === "buy";
      const valuation = item.activity_type === "valuation";
      const opening = item.activity_type === "opening_position";
      return <li key={`${item.activity_type}:${item.activity_id}`} className={activityStyles.activityItem}>
        <div className={activityStyles.activityCopy}>
          <strong>{investmentActivityLabel({ ...item, ticker: holding.ticker || item.ticker })}</strong>
          <small>{formatDateLongIndonesia(item.activity_date) || item.activity_date}</small>
        </div>
        <div className={activityStyles.activityValue}>
          {trade ? <><span>{buy ? "Cash RDN keluar" : "Cash RDN masuk"}</span><Money value={item.cash_amount} /></> : null}
          {valuation ? <><span>Harga referensi</span><Money value={item.price_per_share} /></> : null}
          {opening ? <><span>Posisi awal</span><strong>{Number(item.share_delta || 0).toLocaleString("id-ID")} lembar</strong></> : null}
          {!trade && !valuation && !opening ? <span>Koreksi tercatat</span> : null}
        </div>
      </li>;
    })}
  </ul>;
};

const InvestmentHoldingDetail = ({ portfolio, holding, onClose, onAction }) => {
  if (!portfolio || !holding) return null;
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const lots = lotSize > 0 ? shares / lotSize : 0;
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  const canSell = portfolio.can_operate && shares >= lotSize;
  const footer = <div className="form-actions">
    <Button type="button" onClick={onClose}>Tutup</Button>
    {portfolio.can_operate ? <Button type="button" icon={FiTrendingUp} onClick={() => onAction("price", portfolio, { initialInstrumentId: holding.instrument_id })}>Perbarui harga</Button> : null}
    {canSell ? <Button type="button" variant="primary" icon={FiDollarSign} onClick={() => onAction("sell", portfolio, { initialInstrumentId: holding.instrument_id })}>Catat penjualan</Button> : null}
  </div>;
  return <Modal open title={`Detail ${holding.ticker || "saham"}`} description="Detail holding aktual dari catatan investasi. Harga berasal dari catatan manual atau transaksi terakhir, bukan harga live." onClose={onClose} footer={footer}>
    <div className={formStyles.review}>
      <div>
        <h3>{holding.name || "Instrumen investasi"}</h3>
        <p className={formStyles.formHint}>Cash RDN portfolio ini berasal dari rekening RDN yang terikat pada portfolio.</p>
      </div>
      <dl className={formStyles.reviewGrid}>
        <div><dt>Kepemilikan</dt><dd>{lots.toLocaleString("id-ID", { maximumFractionDigits: 2 })} lot · {shares.toLocaleString("id-ID")} lembar</dd></div>
        <div><dt>Modal tercatat</dt><dd><Money value={holding.cost_basis} /></dd></div>
        <div><dt>Harga catatan terakhir</dt><dd><Money value={holding.price_per_share} />{holding.valuation_date ? ` · ${formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}` : ""}</dd></div>
        <div><dt>Nilai tercatat</dt><dd><Money value={holding.market_value} /></dd></div>
        <div><dt>Hasil belum direalisasi</dt><dd><Money value={holding.unrealized_pl} /> · {performanceLabel(holding.unrealized_pl)}{returnPercent != null ? ` · ${percentLabel(returnPercent)}` : ""}</dd></div>
      </dl>
      <section className={activityStyles.activitySection} aria-label={`Aktivitas ${holding.ticker || "saham"}`}>
        <div className={sharedStyles.sectionHeading}><div><h3>Aktivitas saham terbaru</h3><p>Riwayat terbaru yang memang terkait saham ini.</p></div></div>
        <HoldingActivity portfolio={portfolio} holding={holding} />
      </section>
    </div>
  </Modal>;
};

export default InvestmentHoldingDetail;
