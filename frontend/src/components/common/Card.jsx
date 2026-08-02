import styles from "./Card.module.css";

const Card = ({ as: Element = "section", className = "", children, interactive = false, ...props }) => {
  const classes = [styles.card, "card", className].filter(Boolean).join(" ");
  return (
    <Element className={classes} data-ui="card" data-interactive={interactive || undefined} {...props}>
      {children}
    </Element>
  );
};

export default Card;
