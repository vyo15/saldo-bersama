import Money from "../../../components/common/Money.jsx";
import { formatCompactRupiah } from "../../../domain/money.js";
import { dashboardClass } from "../dashboardStyles.js";

const SensitiveMoney = ({ visible, compact = false, value, ...props }) => {
  if (!visible) return <span className={dashboardClass("masked-money")} aria-label="Nominal disembunyikan">Rp •••••</span>;
  if (compact) return <span className="money money--default">{formatCompactRupiah(value)}</span>;
  return <Money value={value} {...props} />;
};

export default SensitiveMoney;
