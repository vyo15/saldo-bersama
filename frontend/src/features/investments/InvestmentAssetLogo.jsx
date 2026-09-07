import { investmentAssetLogo } from "../../shared/presentation/investmentAssets.js";
import styles from "./InvestmentAssetLogo.module.css";

const InvestmentAssetLogo = ({ ticker, className = "", size = "md" }) => {
  const normalizedTicker = String(ticker || "A").trim().toUpperCase();
  const image = investmentAssetLogo(normalizedTicker);
  const classes = [styles.logo, styles[size] || styles.md, className].filter(Boolean).join(" ");
  return <span className={classes} aria-hidden="true">
    {image
      ? <img src={image} alt="" width="48" height="48" loading="lazy" decoding="async" />
      : <span className={styles.fallback}>{normalizedTicker.slice(0, 6)}</span>}
  </span>;
};

export default InvestmentAssetLogo;
