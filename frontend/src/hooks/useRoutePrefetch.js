import { useEffect } from "react";
import { preloadRoute } from "../app/routeModules.js";

const internalAnchorForEvent = (event) => {
  const anchor = event.target?.closest?.("a[href]");
  if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return null;
  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
};

const useRoutePrefetch = () => {
  useEffect(() => {
    const prefetchFromIntent = (event) => {
      const pathname = internalAnchorForEvent(event);
      if (pathname) void preloadRoute(pathname);
    };

    document.addEventListener("pointerover", prefetchFromIntent, { passive: true });
    document.addEventListener("pointerdown", prefetchFromIntent, { passive: true });
    document.addEventListener("focusin", prefetchFromIntent);
    return () => {
      document.removeEventListener("pointerover", prefetchFromIntent);
      document.removeEventListener("pointerdown", prefetchFromIntent);
      document.removeEventListener("focusin", prefetchFromIntent);
    };
  }, []);
};

export default useRoutePrefetch;
