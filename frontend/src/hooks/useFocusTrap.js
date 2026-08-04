import { useEffect, useRef } from "react";

const SELECTOR = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

export const useFocusTrap = ({ open, containerRef, initialFocusRef, onEscape, bodyClassName = "" }) => {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    if (bodyClassName) document.body.classList.add(bodyClassName);
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
      if (bodyClassName) document.body.classList.remove(bodyClassName);
      previous?.focus?.();
    };
  }, [bodyClassName, containerRef, initialFocusRef, open]);
};
