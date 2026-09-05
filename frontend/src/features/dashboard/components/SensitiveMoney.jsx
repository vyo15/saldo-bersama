import Money from "../../../components/common/Money.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const SensitiveMoney = ({ visible, ...props }) => visible
  ? <Money {...props} />
  : <span className={dashboardClass("masked-money")} aria-label="Nominal disembunyikan">Rp •••••</span>;

export default SensitiveMoney;
