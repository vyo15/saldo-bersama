import { formatRupiah } from "../../domain/money.js";

const LineChart = ({ data, label = "Tren keuangan" }) => {
  const width = 640;
  const height = 220;
  const values = data.map((item) => Number(item.value || 0));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const points = data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - ((Number(item.value || 0) - min) / range) * (height - 24) - 12;
    return `${x},${y}`;
  }).join(" ");
  return (
    <figure className="line-chart" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <figcaption>{data.map((item) => `${item.label}: ${formatRupiah(item.value)}`).join(" · ")}</figcaption>
    </figure>
  );
};

export default LineChart;
