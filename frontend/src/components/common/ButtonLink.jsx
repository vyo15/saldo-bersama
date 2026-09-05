import { Link } from "react-router";
import { buttonClassName } from "./buttonClassName.js";
import styles from "./Button.module.css";

const ButtonLink = ({ variant = "secondary", className = "", icon: Icon, children, ...props }) => (
  <Link
    className={buttonClassName(styles, { variant, className })}
    data-ui="button-link"
    data-variant={variant}
    {...props}
  >
    {Icon ? <Icon aria-hidden="true" /> : null}
    <span>{children}</span>
  </Link>
);

export default ButtonLink;
