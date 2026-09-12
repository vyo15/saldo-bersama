import { FiAlertCircle } from "react-icons/fi";
import { Link } from "react-router";
import { formatPeriod } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

export const StatisticsPanel = ({ overview, model, balanceVisible }) => (
  <>
    <section className={dashboardClass("shared-panel shared-statistics")} aria-labelledby="dashboard-statistics-title">
      <div className={dashboardClass("shared-section-heading")}>
        <h2 id="dashboard-statistics-title">Pengeluaran</h2>
        <Link to="/laporan">Laporan</Link>
      </div>
      <div className={dashboardClass("shared-statistics__summary")}>
        <span>Total pengeluaran bulan ini</span>
        <SensitiveMoney visible={balanceVisible} value={overview?.cashFlow?.expense || 0} tone="negative" />
        <small>{model.expenseByCategory.length} kategori tercatat</small>
      </div>
      <div className={dashboardClass("shared-statistics__content")}>
        <div
          className={dashboardClass("shared-donut")}
          style={model.donutStyle}
          role="img"
          aria-label={`Distribusi pengeluaran ${formatPeriod(overview.periodKey)}`}
        >
          <span><small>{formatPeriod(overview.periodKey)}</small><strong>{model.categoryTotal ? "100%" : "0%"}</strong></span>
        </div>
        <ul className={dashboardClass("shared-stat-legend")}>
          {model.categories.length ? model.categories.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <i data-index={index} />
              <span>
                <strong>{item.name}</strong>
                <small><SensitiveMoney visible={balanceVisible} value={item.amount} /> · {item.percentage}%</small>
              </span>
            </li>
          )) : <li><span>Belum ada pengeluaran kategori.</span></li>}
        </ul>
      </div>
      <div className={dashboardClass("shared-largest-expense")}>
        <span>Pengeluaran terbesar</span>
        <strong>{model.biggestExpense?.name || "Belum tersedia"}</strong>
        <SensitiveMoney visible={balanceVisible} value={model.biggestExpense?.amount || 0} tone="negative" />
      </div>
    </section>
  </>
);

export const InvestmentWidget = ({ summary, balanceVisible }) => {
  if (!summary) return null;
  const hasAssets = Number(summary.market_value || 0) !== 0
    || Number(summary.cost_basis || 0) > 0
    || Number(summary.holding_count || 0) > 0;
  return (
    <article className={dashboardClass("shared-panel shared-investment-widget")}>
      <div className={dashboardClass("shared-widget__heading")}>
        <div>
          <h2>Investasi</h2>
          <span>{summary.holding_count || 0} aset tercatat</span>
        </div>
        <Link to="/investasi">Buka catatan</Link>
      </div>
      <div className={dashboardClass("shared-investment-widget__total")}>
        <span>Total investasi tercatat</span>
        <SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} />
      </div>
      <dl>
        <div><dt>Modal tercatat</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.cost_basis || 0} /></dd></div>
        <div><dt>Nilai saat ini</dt><dd><SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} /></dd></div>
      </dl>
      {hasAssets ? (
        <div className={dashboardClass("shared-investment-widget__pl")}>
          <span>P/L belum direalisasi</span>
          <SensitiveMoney
            visible={balanceVisible}
            value={summary.unrealized_pl || 0}
            tone={Number(summary.unrealized_pl || 0) < 0 ? "negative" : "positive"}
          />
        </div>
      ) : (
        <div className={dashboardClass("shared-investment-widget__notice")}>
          <FiAlertCircle aria-hidden="true" />
          <span><strong>Belum ada aset tercatat</strong><small>Tambahkan saham atau reksa dana dari halaman Investasi.</small></span>
        </div>
      )}
    </article>
  );
};

