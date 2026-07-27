import { formatRupiah } from "../../domain/money.js";

const Money = ({ value, tone = "default", className = "" }) => (
  <span className={`money money--${tone}${className ? ` ${className}` : ""}`}>{formatRupiah(value)}</span>
);

export default Money;
