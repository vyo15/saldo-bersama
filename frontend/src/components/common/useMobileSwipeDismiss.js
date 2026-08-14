import { useCallback, useEffect, useRef, useState } from "react";

const MOBILE_SWIPE_QUERY = "(max-width: 820px)";
const SWIPE_DIRECTION_LOCK_PX = 8;
const SWIPE_HORIZONTAL_REJECT_PX = 10;
const SWIPE_VELOCITY_PX_MS = 0.58;
const SWIPE_MIN_FAST_DISTANCE_PX = 48;
const SWIPE_MIN_DISMISS_DISTANCE_PX = 96;
const SWIPE_MAX_DISMISS_DISTANCE_PX = 160;
const SWIPE_DISMISS_RATIO = 0.22;
const SWIPE_DISMISS_DURATION_MS = 180;
const INTERACTIVE_GESTURE_TARGET = "button,a,input,select,textarea,[role='button'],[contenteditable='true']";
const idleGesture = () => ({ tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null });

const matchesMedia = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
const isMobileSwipeViewport = () => matchesMedia(MOBILE_SWIPE_QUERY);
const prefersReducedMotion = () => matchesMedia("(prefers-reduced-motion: reduce)");

export const useMobileSwipeDismiss = ({ enabled, containerRef, onClose }) => {
  const gestureRef = useRef(idleGesture());
  const dismissTimerRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const resetGesture = useCallback(({ snapBack = true } = {}) => {
    gestureRef.current = idleGesture();
    setDragging(false);
    if (snapBack) setDragY(0);
  }, []);

  const closeModal = useCallback(() => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
    resetGesture();
    setDismissing(false);
    onClose();
  }, [onClose, resetGesture]);

  useEffect(() => () => {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
  }, []);

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

  const onPointerDown = (event) => {
    if (!enabled || !isMobileSwipeViewport() || dismissing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.(INTERACTIVE_GESTURE_TARGET)) return;
    const now = performance.now();
    gestureRef.current = { tracking: true, dragging: false, rejected: false, pointerId: event.pointerId, captureElement: event.currentTarget, startX: event.clientX, startY: event.clientY, startTime: now, lastY: event.clientY, lastTime: now, velocityY: 0 };
  };

  const onPointerMove = (event) => {
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
    gesture.velocityY = (event.clientY - gesture.lastY) / Math.max(1, now - gesture.lastTime);
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    const dialogHeight = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
    setDragY(Math.min(Math.max(0, deltaY), dialogHeight));
  };

  const onPointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(event);
    if (gesture.rejected || !gesture.dragging) { resetGesture(); return; }
    const totalDeltaY = Math.max(0, event.clientY - gesture.startY);
    const averageVelocity = totalDeltaY / Math.max(1, performance.now() - gesture.startTime);
    const dialogHeight = containerRef.current?.getBoundingClientRect().height || 0;
    const distanceThreshold = Math.min(SWIPE_MAX_DISMISS_DISTANCE_PX, Math.max(SWIPE_MIN_DISMISS_DISTANCE_PX, dialogHeight * SWIPE_DISMISS_RATIO));
    const fastSwipe = totalDeltaY >= SWIPE_MIN_FAST_DISTANCE_PX && (gesture.velocityY >= SWIPE_VELOCITY_PX_MS || averageVelocity >= SWIPE_VELOCITY_PX_MS);
    if (totalDeltaY >= distanceThreshold || fastSwipe) { beginGestureDismiss(); return; }
    resetGesture();
  };

  const onPointerCancel = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(event);
    resetGesture();
  };

  return { closeModal, dragY, dragging, dismissing, swipeHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
};
