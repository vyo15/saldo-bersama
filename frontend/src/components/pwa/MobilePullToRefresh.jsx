import { useEffect, useRef, useState } from "react";
import { FiCheck, FiRefreshCw, FiWifiOff } from "react-icons/fi";

const TRIGGER_DISTANCE = 72;
const MAX_VISUAL_DISTANCE = 40;
const resetDelay = 720;

const nestedScrollable = (target) => {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return true;
    node = node.parentElement;
  }
  return false;
};

const ignoredTarget = (target) => target instanceof Element && Boolean(target.closest(
  "input,textarea,select,[contenteditable='true'],[data-pull-refresh-ignore]",
));

const visualDistance = (raw) => Math.min(MAX_VISUAL_DISTANCE, Math.max(0, raw) * 0.48);

const labelFor = (phase) => {
  if (phase === "ready") return "Lepas untuk memperbarui";
  if (phase === "refreshing") return "Memperbarui…";
  if (phase === "success") return "Terbaru";
  if (phase === "offline") return "Offline";
  if (phase === "error") return "Belum berhasil";
  return "Tarik untuk memperbarui";
};

const MobilePullToRefresh = ({ onRefresh, blocked = false, offline = false }) => {
  const [state, setState] = useState({ phase: "idle", distance: 0 });
  const gesture = useRef({ active: false, startX: 0, startY: 0, raw: 0 });
  const resetTimer = useRef(null);
  const refreshingRef = useRef(false);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  useEffect(() => {
    if (!blocked) return;
    gesture.current = { active: false, startX: 0, startY: 0, raw: 0 };
    refreshingRef.current = false;
    window.clearTimeout(resetTimer.current);
    setState({ phase: "idle", distance: 0 });
  }, [blocked]);

  useEffect(() => {
    const mobile = () => window.matchMedia?.("(max-width: 820px)").matches !== false;
    const resetGesture = () => { gesture.current = { active: false, startX: 0, startY: 0, raw: 0 }; };
    const settle = (phase) => {
      refreshingRef.current = false;
      setState({ phase, distance: phase === "idle" ? 0 : 24 });
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setState({ phase: "idle", distance: 0 }), resetDelay);
    };

    const onTouchStart = (event) => {
      if (blocked || refreshingRef.current || !mobile() || event.touches.length !== 1) return;
      if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return;
      if (ignoredTarget(event.target) || nestedScrollable(event.target)) return;
      const touch = event.touches[0];
      gesture.current = { active: true, startX: touch.clientX, startY: touch.clientY, raw: 0 };
    };

    const onTouchMove = (event) => {
      if (!gesture.current.active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaY = touch.clientY - gesture.current.startY;
      const deltaX = Math.abs(touch.clientX - gesture.current.startX);
      if (deltaY <= 0 || deltaX > deltaY * 0.72 || window.scrollY > 0) {
        resetGesture();
        setState({ phase: "idle", distance: 0 });
        return;
      }
      gesture.current.raw = deltaY;
      event.preventDefault();
      setState({ phase: deltaY >= TRIGGER_DISTANCE ? "ready" : "pulling", distance: visualDistance(deltaY) });
    };

    const onTouchEnd = () => {
      if (!gesture.current.active || blocked || refreshingRef.current) {
        resetGesture();
        return;
      }
      const shouldRefresh = gesture.current.raw >= TRIGGER_DISTANCE;
      resetGesture();
      if (!shouldRefresh) {
        setState({ phase: "idle", distance: 0 });
        return;
      }
      if (offline) {
        settle("offline");
        return;
      }
      refreshingRef.current = true;
      setState({ phase: "refreshing", distance: 28 });
      Promise.resolve(onRefresh?.())
        .then(() => settle("success"))
        .catch(() => settle("error"));
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    const onTouchCancel = () => {
      resetGesture();
      setState({ phase: "idle", distance: 0 });
    };

    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      resetGesture();
    };
  }, [blocked, offline, onRefresh]);

  const visible = state.phase !== "idle";
  const Icon = state.phase === "success" ? FiCheck : state.phase === "offline" ? FiWifiOff : FiRefreshCw;
  return (
    <div
      className={`mobile-pull-refresh${visible ? " is-visible" : ""} is-${state.phase}`}
      style={{ "--pull-refresh-distance": `${state.distance}px` }}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <span className="mobile-pull-refresh__pill">
        <Icon aria-hidden="true" />
        <span>{labelFor(state.phase)}</span>
      </span>
    </div>
  );
};

export default MobilePullToRefresh;
