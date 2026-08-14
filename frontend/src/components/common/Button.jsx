import { FiLoader } from "react-icons/fi";
import styles from "./Button.module.css";

const VARIANT_STYLES = Object.freeze({
  secondary: styles.secondary,
  primary: styles.primary,
  danger: styles.danger,
});

const Button = ({ variant = "secondary", className = "", icon: Icon, children, loading = false, disabled, type = "button", ...props }) => {
  const DisplayIcon = loading ? FiLoader : Icon;
  const variantStyle = VARIANT_STYLES[variant] || styles.secondary;
  const classes = [
    styles.button,
    variantStyle,
    loading ? styles.loading : "",
    "button",
    `button--${variant}`,
    loading ? "button--loading" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      className={classes}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-ui="button"
      data-variant={variant}
      {...props}
    >
      {DisplayIcon ? <DisplayIcon aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
};

export default Button;
