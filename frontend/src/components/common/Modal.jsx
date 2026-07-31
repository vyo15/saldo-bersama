import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

const Modal = ({ open, title, description, onClose, children, footer, size = "md", initialFocusRef }) => {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap({ open, containerRef, initialFocusRef: initialFocusRef || closeRef, onEscape: onClose, bodyClassName: "modal-open" });
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={containerRef}
        tabIndex={-1}
      >
        <header className="modal__header">
          <div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Tutup dialog"><FiX /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
};

export default Modal;
