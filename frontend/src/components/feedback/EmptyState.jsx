import { FiInbox } from "react-icons/fi";

const HEADING_TAGS = Object.freeze({ 2: "h2", 3: "h3", 4: "h4" });

const EmptyState = ({
  title = "Belum ada data",
  description = "Data akan muncul setelah Anda menambah pencatatan.",
  action,
  icon: Icon = FiInbox,
  variant = "panel",
  headingLevel = 2,
  className = "",
  announce = false,
}) => {
  const Heading = HEADING_TAGS[headingLevel] || "h2";
  const classes = ["empty-state", `empty-state--${variant}`, className].filter(Boolean).join(" ");
  return (
    <div className={classes} role={announce ? "status" : undefined}>
      <Icon aria-hidden="true" />
      <Heading>{title}</Heading>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
};

export default EmptyState;
