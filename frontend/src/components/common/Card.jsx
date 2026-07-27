const Card = ({ as: Element = "section", className = "", children, ...props }) => (
  <Element className={`card${className ? ` ${className}` : ""}`} {...props}>{children}</Element>
);

export default Card;
