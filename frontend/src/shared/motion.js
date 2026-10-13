import { APP_MEDIA } from "../config/layout.js";

export const prefersReducedMotion = () => (
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia(APP_MEDIA.reducedMotion).matches
);

export const preferredScrollBehavior = () => (prefersReducedMotion() ? "auto" : "smooth");

export const scrollIntoViewWithMotionPreference = (target, options = {}) => {
  target?.scrollIntoView?.({ ...options, behavior: preferredScrollBehavior() });
};

export const scrollWindowToWithMotionPreference = (options = {}) => {
  if (typeof window === "undefined" || typeof window.scrollTo !== "function") return;
  window.scrollTo({ ...options, behavior: preferredScrollBehavior() });
};

const MOTION_DURATION_FALLBACK_MS = Object.freeze({
  instant: 90,
  fast: 140,
  standard: 220,
  emphasized: 320,
  celebration: 1000,
  decorative: 4200,
  "dialog-exit": 140,
  "sheet-exit": 220,
  "swipe-exit": 220,
  "swipe-collapse": 220,
});

const parseMotionDurationMs = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.endsWith("ms")) {
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : null;
  }
  if (normalized.endsWith("s")) {
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number * 1000 : null;
  }
  return null;
};

export const semanticMotionDurationMs = (semantic = "standard") => {
  if (prefersReducedMotion()) return 0;
  const fallback = MOTION_DURATION_FALLBACK_MS[semantic] ?? MOTION_DURATION_FALLBACK_MS.standard;
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const token = `--motion-${semantic}`;
  return parseMotionDurationMs(getComputedStyle(document.documentElement).getPropertyValue(token)) ?? fallback;
};

export const semanticMotionEasing = (semantic = "enter") => {
  const fallback = semantic === "exit" ? "cubic-bezier(0.4, 0, 1, 1)" : semantic === "standard" ? "cubic-bezier(0.2, 0, 0, 1)" : "cubic-bezier(0.16, 1, 0.3, 1)";
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const token = semantic === "exit" ? "--ease-exit" : semantic === "standard" ? "--ease-standard" : "--ease-enter";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
};

/** Wait for a specific CSS motion phase. The timeout is only a fallback: browsers
 * may skip transitionend when interrupted, an element is detached, or motion is reduced.
 * Cancel the returned function on unmount or when a newer phase replaces this one.
 */
export const finishMotionPhase = (element, { kind = "transition", property = "transform", durationMs = 0, onFinish }) => {
  if (typeof onFinish !== "function") return () => {};
  if (typeof window === "undefined" || !element || prefersReducedMotion() || durationMs <= 0) {
    onFinish();
    return () => {};
  }
  let finished = false;
  const eventName = kind === "animation" ? "animationend" : "transitionend";
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallback);
    element.removeEventListener(eventName, handleEnd);
    onFinish();
  };
  const handleEnd = (event) => {
    if (event.target === element && (kind === "animation" || event.propertyName === property)) finish();
  };
  element.addEventListener(eventName, handleEnd);
  const fallback = window.setTimeout(finish, durationMs + 80);
  return () => {
    finished = true;
    window.clearTimeout(fallback);
    element.removeEventListener(eventName, handleEnd);
  };
};
