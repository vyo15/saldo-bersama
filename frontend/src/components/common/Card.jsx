import styles from "./Card.module.css";

const SURFACE_CLASS = {
  outlined: styles.surfaceOutlined,
  flat: styles.surfaceFlat,
  tonal: styles.surfaceTonal,
  object: styles.surfaceObject,
  elevated: styles.surfaceElevated,
};

const Card = ({ as: Element = "section", className = "", children, interactive = false, surface = "outlined", ...props }) => {
  const resolvedSurface = SURFACE_CLASS[surface] ? surface : "outlined";
  const surfaceClass = SURFACE_CLASS[resolvedSurface];
  const classes = [styles.card, surfaceClass, "card", className].filter(Boolean).join(" ");
  return (
    <Element className={classes} data-ui="card" data-surface={resolvedSurface} data-interactive={interactive || undefined} {...props}>
      {children}
    </Element>
  );
};

export default Card;
