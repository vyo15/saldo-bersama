import { useEffect, useRef } from "react";

const SELECTOR = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
const bodyClassLocks = new Map();

const lockBodyClass = (className) => {
  if (!className) return;
  const count = bodyClassLocks.get(className) || 0;
  bodyClassLocks.set(className, count + 1);
  if (count === 0) document.body.classList.add(className);
};

const unlockBodyClass = (className) => {
  if (!className) return;
  const next = Math.max(0, (bodyClassLocks.get(className) || 0) - 1);
  if (next > 0) {
    bodyClassLocks.set(className, next);
    return;
  }
  bodyClassLocks.delete(className);
  document.body.classList.remove(className);
};

const restorePreviousFocus = (previous) => {
  requestAnimationFrame(() => {
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if (previous?.isConnected !== false) previous?.focus?.();
  });
};

export const useFocusTrap = ({ open, containerRef, initialFocusRef, onEscape, bodyClassName = "" }) => {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    lockBodyClass(bodyClassName);
    const frame = requestAnimationFrame(() => (initialFocusRef?.current || containerRef.current)?.focus?.());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onEscapeRef.current?.(); return; }
      if (event.key !== "Tab" || !containerRef.current) return;
      const items = [...containerRef.current.querySelectorAll(SELECTOR)].filter((item) => !item.hasAttribute("hidden"));
      if (!items.length) { event.preventDefault(); containerRef.current.focus(); return; }
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      unlockBodyClass(bodyClassName);
      restorePreviousFocus(previous);
    };
  }, [bodyClassName, containerRef, initialFocusRef, open]);
};
