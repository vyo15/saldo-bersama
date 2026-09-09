import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiArrowLeft, FiX } from "react-icons/fi";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { useMobileSwipeDismiss } from "./useMobileSwipeDismiss.js";
import { ModalSubviewContext } from "./ModalSubviewContext.js";
import styles from "./Modal.module.css";

const SIZE_STYLES = Object.freeze({
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
});



const useModalHistoryDismiss = ({ open, onClose, dismissible }) => {
  const tokenRef = useRef("");
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open || typeof window === "undefined" || typeof onCloseRef.current !== "function") return undefined;
    const token = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let activated = false;
    tokenRef.current = token;
    const pushModalHistory = () => {
      if (tokenRef.current !== token) return;
      const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...currentState, __saldoModalId: token }, "", window.location.href);
      activated = true;
    };
    // StrictMode runs effect setup/cleanup twice in development. Deferring the
    // history entry by one task prevents the disposable setup from polluting Back.
    const activationTimer = window.setTimeout(pushModalHistory, 0);
    const restoreModalHistory = () => {
      if (tokenRef.current !== token) return;
      const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...state, __saldoModalId: token }, "", window.location.href);
      activated = true;
    };
    const onPopState = () => {
      if (window.history.state?.__saldoModalId === token) return;
      if (!dismissibleRef.current) {
        restoreModalHistory();
        return;
      }
      const accepted = onCloseRef.current?.();
      if (accepted === false) {
        restoreModalHistory();
        return;
      }
      tokenRef.current = "";
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.clearTimeout(activationTimer);
      window.removeEventListener("popstate", onPopState);
      if (tokenRef.current !== token) return;
      tokenRef.current = "";
      if (activated && window.history.state?.__saldoModalId === token) window.history.back();
    };
  }, [open]);

  return () => {
    const token = tokenRef.current;
    if (token && window.history.state?.__saldoModalId === token) {
      window.history.back();
      return;
    }
    onCloseRef.current?.();
  };
};

const modalCanDismiss = (dismissible, onClose) => Boolean(dismissible && typeof onClose === "function");
const modalSizeStyle = (size) => SIZE_STYLES[size] || styles.medium;
const modalPresentation = ({ subview, title, description, CloseIcon, closeLabel, canDismiss, closeModal, closeSubview }) => ({
  title: subview?.title || title,
  description: subview?.description || description,
  closeModal: subview ? closeSubview : closeModal,
  canDismiss: subview ? true : canDismiss,
  CloseIcon: subview ? FiArrowLeft : CloseIcon,
  closeLabel: subview ? "Kembali" : closeLabel,
  footerVisible: !subview,
});

const modalRuntimeState = ({ subview, initialFocusRef, canDismiss, closeRef, closeModal, closeSubview, swipeEnabled, dragY }) => ({
  initialFocusRef: initialFocusRef || (canDismiss ? closeRef : undefined),
  onEscape: subview ? closeSubview : (canDismiss ? closeModal : undefined),
  dismissibleAttr: canDismiss ? "true" : "false",
  swipeAttr: swipeEnabled ? "true" : undefined,
  style: swipeEnabled ? { "--modal-drag-y": `${dragY}px` } : undefined,
});

const modalClassName = ({ sizeStyle, swipeEnabled, dragging, dismissing, size, className }) => [
  styles.dialog, sizeStyle, swipeEnabled ? styles.swipeEnabled : "", dragging ? styles.dragging : "",
  dismissing ? styles.dismissing : "", "modal", `modal--${size}`, className,
].filter(Boolean).join(" ");

const ModalHeader = ({ swipeEnabled, swipeHandlers, titleId, title, descriptionId, description, closeRef, closeModal, canDismiss, CloseIcon, closeLabel }) => (
  <header className={`${styles.header} ${swipeEnabled ? styles.swipeHeader : ""} modal__header`.trim()} {...(swipeEnabled ? swipeHandlers : {})}>
    {swipeEnabled ? <span className={styles.mobileDragHandle} aria-hidden="true" /> : null}
    <div className={styles.heading}>
      <h2 id={titleId}>{title}</h2>
      {description ? <p id={descriptionId}>{description}</p> : null}
    </div>
    <button ref={closeRef} className={`${styles.closeButton} icon-button`} type="button" onClick={closeModal} disabled={!canDismiss} aria-label={canDismiss ? closeLabel : "Dialog sedang diproses dan belum dapat ditutup"}>
      <CloseIcon aria-hidden="true" />
    </button>
  </header>
);

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
  mobileSwipeToClose = true,
  dismissible = true,
  closeIcon: CloseIcon = FiX,
  closeLabel = "Tutup dialog",
}) => {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const [subview, setSubview] = useState(null);
  const titleId = useId();
  const descriptionId = useId();
  const canDismiss = modalCanDismiss(dismissible, onClose);
  const historyClose = subview ? () => { setSubview(null); return false; } : onClose;
  const requestHistoryClose = useModalHistoryDismiss({ open, onClose: historyClose, dismissible: Boolean(subview || canDismiss) });
  const requestClose = () => requestHistoryClose();
  const closeSubview = () => setSubview(null);
  const subviewApi = useMemo(() => ({ openSubview: setSubview, closeSubview }), []);
  useEffect(() => { if (!open) setSubview(null); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    window.dispatchEvent(new CustomEvent("saldo-bersama:modal-activity", { detail: { delta: 1 } }));
    return () => window.dispatchEvent(new CustomEvent("saldo-bersama:modal-activity", { detail: { delta: -1 } }));
  }, [open]);
  const swipeEnabled = Boolean(mobileSwipeToClose && canDismiss && !subview);
  const { closeModal, dragY, dragging, dismissing, swipeHandlers } = useMobileSwipeDismiss({ enabled: swipeEnabled, containerRef, onClose: requestClose });

  const runtime = modalRuntimeState({ subview, initialFocusRef, canDismiss, closeRef, closeModal, closeSubview, swipeEnabled, dragY });
  useFocusTrap({
    open,
    containerRef,
    initialFocusRef: runtime.initialFocusRef,
    onEscape: runtime.onEscape,
    bodyClassName: "modal-open",
  });

  if (!open) return null;

  const sizeStyle = modalSizeStyle(size);
  const dialogClassName = modalClassName({ sizeStyle, swipeEnabled, dragging, dismissing, size, className });
  const presentation = modalPresentation({ subview, title, description, CloseIcon, closeLabel, canDismiss, closeModal, closeSubview });
  const handleBackdropPointerDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (subview) closeSubview();
    else if (canDismiss) closeModal();
  };
  return createPortal(
    <div
      className={`${styles.backdrop} ${dismissing ? styles.backdropDismissing : ""} modal-backdrop`.trim()}
      role="presentation"
      onPointerDown={handleBackdropPointerDown}
    >
      <section
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={presentation.description ? descriptionId : undefined}
        ref={containerRef}
        tabIndex={-1}
        data-ui="dialog"
        data-size={size}
        data-dismissible={runtime.dismissibleAttr}
        data-mobile-swipe-to-close={runtime.swipeAttr}
        style={runtime.style}
      >
        <ModalHeader
          swipeEnabled={swipeEnabled}
          swipeHandlers={swipeHandlers}
          titleId={titleId}
          title={presentation.title}
          descriptionId={descriptionId}
          description={presentation.description}
          closeRef={closeRef}
          closeModal={presentation.closeModal}
          canDismiss={presentation.canDismiss}
          CloseIcon={presentation.CloseIcon}
          closeLabel={presentation.closeLabel}
        />
        <ModalSubviewContext.Provider value={subviewApi}>
          <div className={`${styles.body} modal__body`}>{subview?.content ?? children}</div>
        </ModalSubviewContext.Provider>
        {presentation.footerVisible && footer ? <footer className={`${styles.footer} modal__footer`}>{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
};

export default Modal;
