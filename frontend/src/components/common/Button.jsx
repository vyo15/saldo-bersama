import { FiLoader } from "react-icons/fi";

const Button = ({ variant = "secondary", className = "", icon: Icon, children, loading = false, disabled, ...props }) => {
  const DisplayIcon = loading ? FiLoader : Icon;
  return (
    <button
      className={`button button--${variant}${loading ? " button--loading" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {DisplayIcon ? <DisplayIcon aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
};

export default Button;
