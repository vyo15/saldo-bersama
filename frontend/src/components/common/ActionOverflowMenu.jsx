import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMoreHorizontal } from "react-icons/fi";
import { positionActionMenu } from "./actionMenuPosition.js";
import styles from "./ActionOverflowMenu.module.css";

// A shared popover for card actions. Portaling avoids clipped cards, stacked siblings,
// and the bottom navigation covering actions close to the end of a scrollable list.
const ActionOverflowMenu = ({ label, className = "", panelClassName = "", children }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const close = () => { setOpen(false); setPosition(null); };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return undefined;
    const update = () => {
      const navigation = document.querySelector(".mobile-navigation");
      const navRect = navigation?.getBoundingClientRect();
      const navigationTop = navRect && navRect.height > 0 ? navRect.top : window.innerHeight;
      setPosition(positionActionMenu({
        anchor: trigger.getBoundingClientRect(),
        panelWidth: panel.offsetWidth,
        panelHeight: panel.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        navigationTop,
      }));
    };
    update();
    panel.querySelector("button:not(:disabled), a[href]")?.focus();
    const onScroll = (event) => { if (!panel.contains(event.target)) close(); };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); triggerRef.current?.focus(); }
    };
    const onFocus = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  return <div className={className}>
    <button type="button" ref={triggerRef} aria-label={label} aria-expanded={open} aria-controls={open ? panelId : undefined}
      title="Aksi lainnya" onClick={() => setOpen((previous) => !previous)}>
      <FiMoreHorizontal aria-hidden="true" />
    </button>
    {open ? createPortal(<div ref={panelRef} id={panelId} role="group" aria-label={label}
      className={[styles.panel, panelClassName].filter(Boolean).join(" ")}
      data-placement={position?.placement || "below"}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, width: position?.width, maxHeight: position?.maxHeight, visibility: position ? "visible" : "hidden" }}>
      {children(close)}
    </div>, document.body) : null}
  </div>;
};

export default ActionOverflowMenu;
