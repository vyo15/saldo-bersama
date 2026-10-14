import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiChevronRight,
  FiInfo,
  FiPieChart,
  FiRefreshCw,
  FiTarget,
  FiX,
} from "react-icons/fi";
import { APP_MEDIA } from "../../config/layout.js";
import { formatDateTimeJakarta } from "../../domain/dates.js";
import { finishMotionPhase, semanticMotionDurationMs } from "../../shared/motion.js";
import { financialAlertGuidance } from "../../shared/workflows/financialAlerts.js";
import {
  financialNotificationEntity,
  financialNotificationFact,
  financialNotificationTitle,
  notificationRequiresAction,
} from "../../shared/workflows/financialNotifications.js";
import styles from "./NotificationsPage.module.css";

const DIRECTION_LOCK_PX = 8;
const FAST_SWIPE_DISTANCE_PX = 48;
const FAST_SWIPE_VELOCITY_PX_MS = 0.55;
const MIN_DISMISS_DISTANCE_PX = 82;
const MAX_DISMISS_DISTANCE_PX = 118;
const DISMISS_RATIO = 0.26;

const idleGesture = () => ({ tracking: false, dragging: false, rejected: false, pointerId: null });
const matchesMedia = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
const isMobileSwipeViewport = () => matchesMedia(APP_MEDIA.mobile);
const prefersReducedMotion = () => matchesMedia(APP_MEDIA.reducedMotion);

const notificationIcon = (type) => {
  if (["reconciliation_stale", "reconciliation_difference", "investment_reconciliation_stale", "investment_reconciliation_difference"].includes(type)) return FiRefreshCw;
  if (["recurring_due", "recurring_overdue", "recurring_funding_shortage", "recurring_completed"].includes(type)) return FiCalendar;
  if (type === "goal_behind") return FiTarget;
  if (type === "manual_reminder") return FiBell;
  if (["budget_threshold", "envelope_threshold", "unallocated_expense", "unallocated_funds"].includes(type)) return FiPieChart;
  return FiInfo;
};

const notificationTone = (alert) => {
  if (alert.severity === "danger") return "danger";
  if (alert.severity === "warning" || alert.type === "recurring_funding_shortage") return "warning";
  return "info";
};

const useDismissMotion = ({ alert, onDismiss }) => {
  const itemRef = useRef(null);
  const rowRef = useRef(null);
  const cancelMotionRef = useRef(() => {});
  const swipeFrameRef = useRef(null);
  const clearingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [collapsing, setCollapsing] = useState(false);

  useEffect(() => () => {
    cancelMotionRef.current();
    if (swipeFrameRef.current !== null) window.cancelAnimationFrame(swipeFrameRef.current);
  }, []);

  const setOffset = useCallback((value) => {
    rowRef.current?.style.setProperty("--notification-swipe-x", `${Math.max(0, value)}px`);
  }, []);

  const finishDismiss = useCallback(() => {
    // Keyboard focus must never be stranded in a removed notification row.
    if (itemRef.current && (document.activeElement === rowRef.current || itemRef.current.contains(document.activeElement))) {
      const wrapper = itemRef.current?.parentElement;
      const nextRow = wrapper?.nextElementSibling?.querySelector("button[data-native-enter]")
        || wrapper?.previousElementSibling?.querySelector("button[data-native-enter]")
        || document.querySelector('[data-notification-filter="true"]');
      nextRow?.focus();
    }
    Promise.resolve().then(() => onDismiss(alert)).catch(() => {
      // A failed server write must restore the locally animated row for retry.
      clearingRef.current = false;
      setClearing(false);
      setCollapsing(false);
      setOffset(0);
    });
  }, [alert, onDismiss, setOffset]);

  const commitDismiss = useCallback(() => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    if (prefersReducedMotion()) { finishDismiss(); return; }
    const width = itemRef.current?.getBoundingClientRect().width || window.innerWidth;
    setDragging(false);
    setClearing(true);
    // Wait for the drag class (which disables transition) to leave the DOM,
    // then start the exit. No premature collapse and no permanent GPU layer.
    swipeFrameRef.current = window.requestAnimationFrame(() => {
      swipeFrameRef.current = null;
      rowRef.current?.getBoundingClientRect();
      setOffset(width + 32);
      cancelMotionRef.current = finishMotionPhase(rowRef.current, {
        property: "transform", durationMs: semanticMotionDurationMs("swipe-exit"),
        onFinish: () => {
          setCollapsing(true);
          cancelMotionRef.current = finishMotionPhase(itemRef.current?.parentElement, {
            property: "grid-template-rows", durationMs: semanticMotionDurationMs("swipe-collapse"),
            onFinish: finishDismiss,
          });
        },
      });
    });
  }, [finishDismiss, setOffset]);

  return { itemRef, rowRef, suppressClickRef, dragging, clearing, collapsing, setDragging, setOffset, commitDismiss };
};

const releasePointerCapture = (row, event) => {
  if (!row?.hasPointerCapture?.(event.pointerId)) return;
  try { row.releasePointerCapture(event.pointerId); }
  catch { /* Synthetic pointer events may not own native capture. */ }
};

const useSwipeGesture = ({ itemRef, rowRef, suppressClickRef, clearing, setDragging, setOffset, commitDismiss }) => {
  const gestureRef = useRef(idleGesture());
  const resetGesture = useCallback(() => {
    gestureRef.current = idleGesture();
    setDragging(false);
    setOffset(0);
  }, [setDragging, setOffset]);

  const onPointerDown = (event) => {
    if (clearing || !isMobileSwipeViewport() || (event.pointerType === "mouse" && event.button !== 0)) return;
    const now = performance.now();
    gestureRef.current = { tracking: true, dragging: false, rejected: false, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: now, lastX: event.clientX, lastTime: now, velocityX: 0 };
  };

  const onPointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId || gesture.rejected || clearing) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (deltaX < -DIRECTION_LOCK_PX) { gesture.rejected = true; return; }
      if (Math.abs(deltaY) > DIRECTION_LOCK_PX && Math.abs(deltaY) > Math.abs(deltaX)) { gesture.rejected = true; return; }
      if (deltaX < DIRECTION_LOCK_PX || deltaX <= Math.abs(deltaY) * 1.12) return;
      gesture.dragging = true;
      suppressClickRef.current = true;
      setDragging(true);
      try { rowRef.current?.setPointerCapture?.(event.pointerId); }
      catch { /* Synthetic pointer events may not create native pointer capture. */ }
    }
    const now = performance.now();
    gesture.velocityX = (event.clientX - gesture.lastX) / Math.max(1, now - gesture.lastTime);
    gesture.lastX = event.clientX;
    gesture.lastTime = now;
    const width = itemRef.current?.getBoundingClientRect().width || window.innerWidth;
    setOffset(Math.min(Math.max(0, deltaX), width * 0.86));
  };

  const onPointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(rowRef.current, event);
    if (gesture.rejected || !gesture.dragging) { resetGesture(); return; }
    const deltaX = Math.max(0, event.clientX - gesture.startX);
    const elapsed = Math.max(1, performance.now() - gesture.startTime);
    const width = itemRef.current?.getBoundingClientRect().width || 0;
    const threshold = Math.min(MAX_DISMISS_DISTANCE_PX, Math.max(MIN_DISMISS_DISTANCE_PX, width * DISMISS_RATIO));
    const velocity = Math.max(gesture.velocityX, deltaX / elapsed);
    gestureRef.current = idleGesture();
    if (deltaX >= threshold || (deltaX >= FAST_SWIPE_DISTANCE_PX && velocity >= FAST_SWIPE_VELOCITY_PX_MS)) commitDismiss();
    else resetGesture();
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const onPointerCancel = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    releasePointerCapture(rowRef.current, event);
    resetGesture();
    suppressClickRef.current = false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
};

const eventDisplay = (alert) => {
  const at = alert.source === "event" ? alert.occurredAt || alert.createdAt || alert.updatedAt : null;
  const date = at ? new Date(at) : null;
  return date && Number.isFinite(date.getTime())
    ? { at, short: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(date) }
    : null;
};

const NotificationRow = ({ alert, read, onOpen, onDismiss }) => {
  const motion = useDismissMotion({ alert, onDismiss });
  const gesture = useSwipeGesture(motion);
  const Icon = notificationIcon(alert.type);
  const tone = notificationTone(alert);
  const event = eventDisplay(alert);
  const entity = financialNotificationEntity(alert);
  const fact = financialNotificationFact(alert);
  const title = financialNotificationTitle(alert);
  const showEntity = Boolean(entity && !title.includes(entity) && !(fact || "").includes(entity));
  const guidanceAlert = alert.guidanceId ? { ...alert, id: alert.guidanceId } : alert;
  const actionLabel = notificationRequiresAction(alert) ? financialAlertGuidance(guidanceAlert, { source: "notification-center" }).actionLabel : "";

  const onClick = (event) => {
    if (motion.suppressClickRef.current || motion.clearing) { event.preventDefault(); return; }
    onOpen(alert);
  };
  const onKeyDown = (event) => {
    if (event.key !== "Delete") return;
    event.preventDefault();
    motion.commitDismiss();
  };

  return (
    <div className={styles.swipeCollapse} data-collapsing={motion.collapsing ? "true" : "false"}>
      <div ref={motion.itemRef} className={styles.swipeItem} data-clearing={motion.clearing ? "true" : "false"}>
        <span className={styles.swipeAction} aria-hidden="true"><FiCheckCircle /><span>Bersihkan</span></span>
        <button
          ref={motion.rowRef}
          type="button"
          data-native-enter
          className={styles.row}
          data-read={read ? "true" : "false"}
          data-tone={tone}
          data-dragging={motion.dragging ? "true" : "false"}
          data-clearing={motion.clearing ? "true" : "false"}
          onClick={onClick}
          onKeyDown={onKeyDown}
          {...gesture}
          aria-keyshortcuts="Delete"
          aria-label={`${read ? "Sudah dibaca" : "Belum dibaca"}. ${financialNotificationTitle(alert)}${fact ? `. ${fact}` : ""}. Tekan Delete untuk membersihkan. Pada layar sentuh, geser ke kanan.`}
        >
          <span className={styles.icon}><Icon aria-hidden="true" /></span>
          <span className={styles.copy}>
            <span className={styles.primaryLine}><strong>{financialNotificationTitle(alert)}</strong>{event ? <time className={styles.eventTime} dateTime={event.at} title={formatDateTimeJakarta(event.at)}>{event.short}</time> : null}</span>
            {showEntity ? <span className={styles.entity}>{entity}</span> : null}
            {fact ? <small>{fact}</small> : null}
            {actionLabel ? <span className={styles.actionLabel}>{actionLabel}</span> : null}
          </span>
          <span className={styles.trailing}>{read ? null : <i className={styles.unreadDot} aria-hidden="true" />}<FiChevronRight aria-hidden="true" /></span>
        </button>
        <button type="button" className={styles.clearButton} aria-label={`Bersihkan: ${financialNotificationTitle(alert)}`} title="Bersihkan notifikasi" disabled={motion.clearing} onClick={motion.commitDismiss}><FiX aria-hidden="true" /></button>
      </div>
    </div>
  );
};

export default NotificationRow;
