import { FiAlertCircle } from "react-icons/fi";
import { Link } from "react-router";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

export const InvestmentWidget = ({ summary, balanceVisible }) => {
  if (!summary) return null;
  const hasAssets = Number(summary.market_value || 0) !== 0
    || Number(summary.cost_basis || 0) > 0
    || Number(summary.holding_count || 0) > 0;
  return (
    <article className={dashboardClass("shared-panel shared-investment-widget desktop-summary-widget")}>
      <div className={dashboardClass("shared-widget__heading")}>
        <div>
          <span>Aset</span>
          <h2>Investasi</h2>
        </div>
        <Link to="/investasi">Lihat</Link>
      </div>
      <dl className={dashboardClass("desktop-summary-list desktop-investment-summary")}>
        <div><dt>Total nilai tercatat</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} /></dd></div>
        <div><dt>Perubahan belum terealisasi</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.unrealized_pl || 0} tone={Number(summary.unrealized_pl || 0) < 0 ? "negative" : "positive"} /></dd></div>
      </dl>
      {!hasAssets ? (
        <div className={dashboardClass("shared-investment-widget__notice")}>
          <FiAlertCircle aria-hidden="true" />
          <span><strong>Belum ada aset tercatat</strong><small>Tambahkan saham atau reksa dana dari halaman Investasi.</small></span>
        </div>
      ) : null}
    </article>
  );
};
