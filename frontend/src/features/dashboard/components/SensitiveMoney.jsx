import Money from "../../../components/common/Money.jsx";

const SensitiveMoney = ({ visible, ...props }) => visible
  ? <Money {...props} />
  : <span className="masked-money" aria-label="Nominal disembunyikan">Rp •••••</span>;

export default SensitiveMoney;
