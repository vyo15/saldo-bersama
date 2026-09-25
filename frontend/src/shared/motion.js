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
