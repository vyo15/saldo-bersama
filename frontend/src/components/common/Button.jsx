import { FiLoader } from "react-icons/fi";
import { buttonClassName } from "./buttonClassName.js";
import styles from "./Button.module.css";

const Button = ({ variant = "secondary", className = "", icon: Icon, children, loading = false, disabled, type = "button", ...props }) => {
  const DisplayIcon = loading ? FiLoader : Icon;
  const classes = buttonClassName(styles, { variant, loading, className });

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
