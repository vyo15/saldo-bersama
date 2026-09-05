const VARIANT_KEYS = Object.freeze({
  secondary: "secondary",
  primary: "primary",
  danger: "danger",
});

export const buttonClassName = (styles, { variant = "secondary", loading = false, className = "" } = {}) => {
  const variantKey = VARIANT_KEYS[variant] || "secondary";
  return [
    styles.button,
    styles[variantKey],
    loading ? styles.loading : "",
    "button",
    `button--${variant}`,
    loading ? "button--loading" : "",
    className,
  ].filter(Boolean).join(" ");
};
