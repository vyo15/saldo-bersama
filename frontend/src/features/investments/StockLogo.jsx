import { investmentStockLogo } from "../../shared/presentation/investmentStocks.js";
import styles from "./StockLogo.module.css";

const StockLogo = ({ ticker, className = "", size = "md" }) => {
  const normalizedTicker = String(ticker || "S").trim().toUpperCase();
  const image = investmentStockLogo(normalizedTicker);
  const classes = [styles.logo, styles[size] || styles.md, className].filter(Boolean).join(" ");
  return <span className={classes} aria-hidden="true">
    {image
      ? <img src={image} alt="" width="48" height="48" loading="lazy" decoding="async" />
      : <span className={styles.fallback}>{normalizedTicker.slice(0, 4)}</span>}
  </span>;
};

export default StockLogo;
