import { FiChevronLeft } from "react-icons/fi";
import { Link } from "react-router";
import styles from "./ContextBack.module.css";

const ContextBack = ({ to, label, onClick, state, replace = false, className = "", ariaLabel = "" }) => {
  const content = <><FiChevronLeft aria-hidden="true" /><span>{label}</span></>;
  const classes = [styles.back, className].filter(Boolean).join(" ");
  const accessibleLabel = ariaLabel || `Kembali ke ${label}`;

  if (typeof onClick === "function") {
    return <button type="button" className={classes} onClick={onClick} aria-label={accessibleLabel}>{content}</button>;
  }

  return <Link className={classes} to={to || "/"} state={state} replace={replace} aria-label={accessibleLabel}>{content}</Link>;
};

export default ContextBack;
