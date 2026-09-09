import { useEffect } from "react";

const setKeyboardInset = () => {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.setProperty("--keyboard-inset", "0px");
    return;
  }
  const inset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
  document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
};

const useVisualViewportInsets = () => {
  useEffect(() => {
    const viewport = window.visualViewport;
    setKeyboardInset();
    if (!viewport) return () => document.documentElement.style.removeProperty("--keyboard-inset");
    viewport.addEventListener("resize", setKeyboardInset, { passive: true });
    viewport.addEventListener("scroll", setKeyboardInset, { passive: true });
    return () => {
      viewport.removeEventListener("resize", setKeyboardInset);
      viewport.removeEventListener("scroll", setKeyboardInset);
      document.documentElement.style.removeProperty("--keyboard-inset");
    };
  }, []);
};

export default useVisualViewportInsets;
