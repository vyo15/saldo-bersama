import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import styles from "./Modal.module.css";

const SIZE_STYLES = Object.freeze({
  sm: styles.small,
  md: styles.medium,
  lg: styles.large,
});

const MOBILE_SWIPE_QUERY = "(max-width: 47.99rem)";
const SWIPE_DIRECTION_LOCK_PX = 8;
const SWIPE_HORIZONTAL_REJECT_PX = 10;
const SWIPE_VELOCITY_PX_MS = 0.58;
const SWIPE_MIN_FAST_DISTANCE_PX = 48;
const SWIPE_MIN_DISMISS_DISTANCE_PX = 96;
const SWIPE_MAX_DISMISS_DISTANCE_PX = 160;
const SWIPE_DISMISS_RATIO = 0.22;
const SWIPE_DISMISS_DURATION_MS = 180;
const INTERACTIVE_GESTURE_TARGET = "button,a,input,select,textarea,[role='button'],[contenteditable='true']";

const isMobileSwipeViewport = () => typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia(MOBILE_SWIPE_QUERY).matches;

const prefersReducedMotion = () => typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
}) => {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  const gestureRef = useRef({ tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null });
  const dismissTimerRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const closeModal = () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
    gestureRef.current = { tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null };
    setDragY(0);
    setDragging(false);
    setDismissing(false);
    onClose();
  };

  useFocusTrap({ open, containerRef, initialFocusRef: initialFocusRef || closeRef, onEscape: closeModal, bodyClassName: "modal-open" });

  useEffect(() => () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
  }, []);

  if (!open) return null;

  const resetGesture = ({ snapBack = true } = {}) => {
    gestureRef.current = { tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null };
    setDragging(false);
    if (snapBack) setDragY(0);
  };

  const releasePointerCapture = (event) => {
    const captureElement = gestureRef.current.captureElement;
    if (!captureElement?.hasPointerCapture?.(event.pointerId)) return;
    try { captureElement.releasePointerCapture(event.pointerId); }
    catch { /* Synthetic browser tests may not own native pointer capture. */ }
  };

  const beginGestureDismiss = () => {
    const dialogHeight = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
    resetGesture({ snapBack: false });
    setDismissing(true);
    setDragY(Math.max(dialogHeight, window.innerHeight * 0.6));
    if (prefersReducedMotion()) { closeModal(); return; }
    dismissTimerRef.current = window.setTimeout(closeModal, SWIPE_DISMISS_DURATION_MS);
  };

  const handleSwipePointerDown = (event) => {
    if (!mobileSwipeToClose || !isMobileSwipeViewport() || dismissing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.(INTERACTIVE_GESTURE_TARGET)) return;
    const now = performance.now();
    gestureRef.current = {
      tracking: true,
      dragging: false,
      rejected: false,
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      lastY: event.clientY,
      lastTime: now,
      velocityY: 0,
    };
  };

  const handleSwipePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId || gesture.rejected) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (deltaY < -SWIPE_DIRECTION_LOCK_PX) { gesture.rejected = true; return; }
      if (Math.abs(deltaX) > SWIPE_HORIZONTAL_REJECT_PX && Math.abs(deltaX) > Math.abs(deltaY)) { gesture.rejected = true; return; }
      if (deltaY < SWIPE_DIRECTION_LOCK_PX || deltaY <= Math.abs(deltaX) * 1.15) return;
      gesture.dragging = true;
      setDragging(true);
      try { gesture.captureElement?.setPointerCapture?.(event.pointerId); }
      catch { /* Synthetic browser tests may not create a native active pointer. */ }
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    const dialogHeight = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
    setDragY(Math.min(Math.max(0, deltaY), dialogHeight));
  };

  const finishSwipePointer = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(event);
    if (gesture.rejected || !gesture.dragging) { resetGesture(); return; }
    const totalDeltaY = Math.max(0, event.clientY - gesture.startY);
    const averageVelocity = totalDeltaY / Math.max(1, performance.now() - gesture.startTime);
    const dialogHeight = containerRef.current?.getBoundingClientRect().height || 0;
    const distanceThreshold = Math.min(
      SWIPE_MAX_DISMISS_DISTANCE_PX,
      Math.max(SWIPE_MIN_DISMISS_DISTANCE_PX, dialogHeight * SWIPE_DISMISS_RATIO),
    );
    const fastSwipe = totalDeltaY >= SWIPE_MIN_FAST_DISTANCE_PX
      && (gesture.velocityY >= SWIPE_VELOCITY_PX_MS || averageVelocity >= SWIPE_VELOCITY_PX_MS);
    if (totalDeltaY >= distanceThreshold || fastSwipe) { beginGestureDismiss(); return; }
    resetGesture();
  };

  const cancelSwipePointer = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(event);
    resetGesture();
  };

  const sizeStyle = SIZE_STYLES[size] || styles.medium;
  const gestureClass = mobileSwipeToClose ? styles.swipeEnabled : "";
  const dragClass = dragging ? styles.dragging : "";
  const dismissClass = dismissing ? styles.dismissing : "";
  return createPortal(
    <div
      className={`${styles.backdrop} modal-backdrop`}
      role="presentation"
      onPointerDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
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
        data-mobile-swipe-to-close={mobileSwipeToClose ? "true" : undefined}
        style={mobileSwipeToClose ? { "--modal-drag-y": `${dragY}px` } : undefined}
      >
        <header
          className={`${styles.header} ${mobileSwipeToClose ? styles.swipeHeader : ""} modal__header`.trim()}
          onPointerDown={handleSwipePointerDown}
          onPointerMove={handleSwipePointerMove}
          onPointerUp={finishSwipePointer}
          onPointerCancel={cancelSwipePointer}
        >
          {mobileSwipeToClose ? <span className={styles.mobileDragHandle} aria-hidden="true" /> : null}
          <div className={styles.heading}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            className={`${styles.closeButton} icon-button`}
            type="button"
            onClick={closeModal}
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
