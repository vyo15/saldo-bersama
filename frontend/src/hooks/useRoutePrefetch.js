import { useEffect } from "react";
import { preloadOfflineWarmRoutes, preloadRoute } from "../app/routeModules.js";

const connectionAllowsWarmup = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g"].includes(String(connection.effectiveType || "").toLowerCase());
};

const scheduleWarmup = (callback) => {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 4_000 });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 2_000);
  return () => window.clearTimeout(handle);
};

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

  useEffect(() => {
    if (!connectionAllowsWarmup() || navigator.onLine === false) return undefined;
    return scheduleWarmup(() => { void preloadOfflineWarmRoutes(window.location.pathname); });
  }, []);
};

export default useRoutePrefetch;
