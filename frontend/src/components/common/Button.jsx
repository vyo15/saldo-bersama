const Button = ({ variant = "secondary", className = "", icon: Icon, children, ...props }) => (
  <button className={`button button--${variant}${className ? ` ${className}` : ""}`} {...props}>
    {Icon ? <Icon aria-hidden="true" /> : null}
    <span>{children}</span>
  </button>
);

export default Button;
