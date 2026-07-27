import { formatCompactRupiah, formatRupiah } from "../../domain/money.js";

const BarChart = ({ data, label = "Diagram batang" }) => {
  const max = Math.max(1, ...data.map((item) => Number(item.value || item.amount || 0)));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {data.map((item) => {
        const value = Number(item.value || item.amount || 0);
        return (
          <div className="bar-chart__item" key={item.label || item.name}>
            <div className="bar-chart__meta"><span>{item.label || item.name}</span><strong title={formatRupiah(value)}>{formatCompactRupiah(value)}</strong></div>
            <div className="bar-chart__track"><span style={{ width: `${Math.max(2, (value / max) * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
};

export default BarChart;
