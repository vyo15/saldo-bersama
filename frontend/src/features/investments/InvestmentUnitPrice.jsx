import { formatInvestmentUnitPrice } from "./investmentPresentation.js";

const InvestmentUnitPrice = ({ value, className = "" }) => (
  <span className={`money${className ? ` ${className}` : ""}`}>{formatInvestmentUnitPrice(value)}</span>
);

export default InvestmentUnitPrice;
