import { useState } from "react";
import { FiInfo } from "react-icons/fi";
import Modal from "./Modal.jsx";
import styles from "./PageInfoButton.module.css";

const PageInfoButton = ({ title, label, children, tone = "default", className = "" }) => {
  const [open, setOpen] = useState(false);
  const accessibleLabel = label || title;
  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${tone === "hero" ? styles.hero : ""} ${className}`.trim()}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FiInfo aria-hidden="true" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm" mobileSwipeToClose>
        <div className={styles.content}>{children}</div>
      </Modal>
    </>
  );
};

export default PageInfoButton;
