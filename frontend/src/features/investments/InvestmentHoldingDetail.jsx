import { FiEdit3, FiMoreHorizontal } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { isMutualFundInstrument } from "../../shared/presentation/investmentAssets.js";
import { investmentActivityLabel, investmentReturnPercent } from "./investments.model.js";
import InvestmentUnitPrice from "./InvestmentUnitPrice.jsx";

import formStyles from "./InvestmentForm.module.css";
import activityStyles from "./InvestmentActivity.module.css";
import sharedStyles from "./InvestmentShared.module.css";

const performanceLabel = (value) => Number(value || 0) > 0 ? "Untung" : Number(value || 0) < 0 ? "Rugi" : "Impas";
const percentLabel = (value) => value == null ? "" : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
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

const HoldingActivity = ({ portfolio, holding }) => {
  const items = (portfolio.activity || []).filter((item) => item.instrument_id === holding.instrument_id).slice(0, 10);
  if (!items.length) return <p className={sharedStyles.inlineEmpty}>Belum ada aktivitas investasi ini pada ringkasan histori terbaru.</p>;
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

const ActivePositionMetrics = ({ holding, mutualFund, quantityLabel }) => {
  const returnPercent = investmentReturnPercent(holding.unrealized_pl, holding.cost_basis);
  return <>
    <div><dt>Status</dt><dd>Posisi aktif</dd></div>
    <div><dt>Kepemilikan</dt><dd>{quantityLabel}</dd></div>
    <div><dt>{mutualFund ? "Rata-rata nilai/unit" : "Rata-rata harga/lembar"}</dt><dd><InvestmentUnitPrice value={holding.average_cost} /></dd></div>
    <div><dt>Modal tercatat</dt><dd><Money value={holding.cost_basis} /></dd></div>
    <div><dt>{mutualFund ? "Nilai per unit terakhir" : "Harga catatan terakhir"}</dt><dd><InvestmentUnitPrice value={holding.price_per_share} />{holding.valuation_date ? ` · ${formatDateLongIndonesia(holding.valuation_date) || holding.valuation_date}` : ""}</dd></div>
    <div><dt>Nilai tercatat</dt><dd><Money value={holding.market_value} /></dd></div>
    <div><dt>Hasil belum direalisasi</dt><dd><Money value={holding.unrealized_pl} /> · {performanceLabel(holding.unrealized_pl)}{returnPercent != null ? ` · ${percentLabel(returnPercent)}` : ""}</dd></div>
    {Number(holding.realized_cost_basis || 0) > 0 ? <div><dt>Hasil yang sudah direalisasi</dt><dd><Money value={holding.realized_pl} /></dd></div> : null}
  </>;
};

const ClosedPositionMetrics = ({ holding, quantityLabel }) => {
  const realizedPercent = investmentReturnPercent(holding.realized_pl, holding.realized_cost_basis);
  return <>
    <div><dt>Status</dt><dd>Posisi selesai</dd></div>
    <div><dt>Kepemilikan</dt><dd>{quantityLabel}</dd></div>
    <div><dt>Modal yang dilepas</dt><dd><Money value={holding.realized_cost_basis} /></dd></div>
    <div><dt>Total hasil penjualan</dt><dd><Money value={holding.sale_proceeds} /></dd></div>
    <div><dt>Hasil direalisasi</dt><dd><Money value={holding.realized_pl} /> · {performanceLabel(holding.realized_pl)}{realizedPercent != null ? ` · ${percentLabel(realizedPercent)}` : ""}</dd></div>
    {holding.last_activity_date ? <div><dt>Aktivitas terakhir</dt><dd>{formatDateLongIndonesia(holding.last_activity_date) || holding.last_activity_date}</dd></div> : null}
  </>;
};

const HoldingDetailFooter = ({ portfolio, holding, closed, onClose, onAction }) => {
  const lotSize = Number(holding.lot_size || 100);
  const shares = Number(holding.shares || 0);
  const canSell = portfolio.can_operate && !closed && shares >= (isMutualFundInstrument(holding) ? 0.01 : lotSize);
  return <div className={`${formStyles.holdingActions} form-actions`}>
    {portfolio.can_operate ? <Button type="button" variant={canSell ? "secondary" : "primary"} onClick={() => onAction("buy", portfolio, { initialInstrumentId: holding.instrument_id })}>Beli</Button> : null}
    {canSell ? <Button type="button" variant="primary" onClick={() => onAction("sell", portfolio, { initialInstrumentId: holding.instrument_id })}>Jual</Button> : null}
    {portfolio.can_operate && !closed ? <details className={formStyles.holdingActionMenu}><summary aria-label="Aksi investasi lainnya" title="Aksi lainnya"><FiMoreHorizontal aria-hidden="true" /></summary><div><Button type="button" icon={FiEdit3} onClick={() => onAction("price", portfolio, { initialInstrumentId: holding.instrument_id })}>Perbarui nilai</Button><Button type="button" onClick={onClose}>Tutup detail</Button></div></details> : <Button type="button" onClick={onClose}>Tutup</Button>}
  </div>;
};

const InvestmentHoldingDetail = ({ portfolio, holding, onClose, onAction }) => {
  if (!portfolio || !holding) return null;
  const shares = Number(holding.shares || 0);
  const mutualFund = isMutualFundInstrument(holding);
  const quantityLabel = holdingQuantityLabel(shares, holding);
  const closed = Boolean(holding.is_closed) || shares <= 0;
  const footer = <HoldingDetailFooter portfolio={portfolio} holding={holding} closed={closed} onClose={onClose} onAction={onAction} />;
  return <Modal open title={`Detail ${holding.ticker || "investasi"}`} description={closed ? "Posisi ini sudah selesai dijual. Riwayat aset dan hasil realisasi tetap disimpan." : "Detail holding aktual dari catatan investasi. Nilai berasal dari catatan manual atau transaksi terakhir, bukan harga pasar live."} onClose={onClose} footer={footer}>
    <div className={formStyles.review}>
      <div>
        <h3>{holding.name || "Instrumen investasi"}</h3>
        <p className={formStyles.formHint}>{mutualFund ? "Reksa Dana" : "Saham"} · pencatatan manual tanpa koneksi broker.</p>
      </div>
      <dl className={formStyles.reviewGrid}>
        {closed ? <ClosedPositionMetrics holding={holding} quantityLabel={quantityLabel} /> : <ActivePositionMetrics holding={holding} mutualFund={mutualFund} quantityLabel={quantityLabel} />}
      </dl>
      <section className={activityStyles.activitySection} aria-label={`Aktivitas ${holding.ticker || "investasi"}`}>
        <div className={sharedStyles.sectionHeading}><div><h3>Riwayat aset</h3><p>Pembelian, penjualan, perubahan nilai, dan koreksi yang hanya terkait aset ini.</p></div></div>
        <HoldingActivity portfolio={portfolio} holding={holding} />
      </section>
    </div>
  </Modal>;
};

export default InvestmentHoldingDetail;
