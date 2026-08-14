import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { useMobileSwipeDismiss } from "./useMobileSwipeDismiss.js";
import styles from "./Modal.module.css";

const SIZE_STYLES = Object.freeze({
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
});

const Modal = ({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  initialFocusRef,
  className = "",
  mobileSwipeToClose = false,
  dismissible = true,
}) => {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const canDismiss = dismissible && typeof onClose === "function";
  const requestClose = () => { if (canDismiss) onClose(); };
  const swipeEnabled = mobileSwipeToClose && canDismiss;
  const { closeModal, dragY, dragging, dismissing, swipeHandlers } = useMobileSwipeDismiss({ enabled: swipeEnabled, containerRef, onClose: requestClose });

  useFocusTrap({
    open,
    containerRef,
    initialFocusRef: initialFocusRef || (canDismiss ? closeRef : undefined),
    onEscape: canDismiss ? closeModal : undefined,
    bodyClassName: "modal-open",
  });

  if (!open) return null;

  const sizeStyle = SIZE_STYLES[size] || styles.medium;
  const gestureClass = swipeEnabled ? styles.swipeEnabled : "";
  const dragClass = dragging ? styles.dragging : "";
  const dismissClass = dismissing ? styles.dismissing : "";
  return createPortal(
    <div
      className={`${styles.backdrop} modal-backdrop`}
      role="presentation"
      onPointerDown={(event) => { if (canDismiss && event.target === event.currentTarget) closeModal(); }}
    >
      <section
        className={`${styles.dialog} ${sizeStyle} ${gestureClass} ${dragClass} ${dismissClass} modal modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={containerRef}
        tabIndex={-1}
        data-ui="dialog"
        data-size={size}
        data-dismissible={canDismiss ? "true" : "false"}
        data-mobile-swipe-to-close={swipeEnabled ? "true" : undefined}
        style={swipeEnabled ? { "--modal-drag-y": `${dragY}px` } : undefined}
      >
        <header
          className={`${styles.header} ${swipeEnabled ? styles.swipeHeader : ""} modal__header`.trim()}
          {...(swipeEnabled ? swipeHandlers : {})}
        >
          {swipeEnabled ? <span className={styles.mobileDragHandle} aria-hidden="true" /> : null}
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            className={`${styles.closeButton} icon-button`}
            type="button"
            onClick={closeModal}
            disabled={!canDismiss}
            aria-label={canDismiss ? "Tutup dialog" : "Dialog sedang diproses dan belum dapat ditutup"}
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
