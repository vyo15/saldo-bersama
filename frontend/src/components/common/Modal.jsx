import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import styles from "./Modal.module.css";

const SIZE_STYLES = Object.freeze({
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
});

const Modal = ({ open, title, description, onClose, children, footer, size = "md", initialFocusRef }) => {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap({ open, containerRef, initialFocusRef: initialFocusRef || closeRef, onEscape: onClose, bodyClassName: "modal-open" });
  if (!open) return null;

  const sizeStyle = SIZE_STYLES[size] || styles.medium;
  return createPortal(
    <div
      className={`${styles.backdrop} modal-backdrop`}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className={`${styles.dialog} ${sizeStyle} modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={containerRef}
        tabIndex={-1}
        data-ui="dialog"
        data-size={size}
      >
        <header className={`${styles.header} modal__header`}>
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            className={`${styles.closeButton} icon-button`}
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            <FiX aria-hidden="true" />
          </button>
        </header>
        <div className={`${styles.body} modal__body`}>{children}</div>
        {footer ? <footer className={`${styles.footer} modal__footer`}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
};

export default Modal;
