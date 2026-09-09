import { useEffect } from "react";
import { useLocation } from "react-router";
import { preloadAction, preloadFrequentActions } from "../app/actionModules.js";

const connectionAllowsIdlePrefetch = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g"].includes(String(connection.effectiveType || "").toLowerCase());
};

const actionFromEvent = (event) => event.target?.closest?.("[data-preload-action]")?.getAttribute("data-preload-action") || "";

const contextualActionsForPath = (pathname) => {
  if (pathname === "/rekening") return ["accountEditor"];
  if (pathname === "/investasi") return ["investmentDialog", "investmentSetup"];
  if (pathname === "/target") return ["goalDialog"];
  if (pathname === "/perencanaan/jadwal") return ["recurringDialog"];
  if (pathname.startsWith("/perencanaan/")) return ["allocationOverlay"];
  return [];
};

const scheduleIdle = (callback) => {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 2_500 });
    return () => window.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 1_200);
  return () => window.clearTimeout(handle);
};

const useActionPrefetch = () => {
  const location = useLocation();

  useEffect(() => {
    const preloadFromIntent = (event) => {
      const action = actionFromEvent(event);
      if (action) void preloadAction(action);
    };
    document.addEventListener("pointerover", preloadFromIntent, { passive: true });
    document.addEventListener("pointerdown", preloadFromIntent, { passive: true });
    document.addEventListener("focusin", preloadFromIntent);
    return () => {
      document.removeEventListener("pointerover", preloadFromIntent);
      document.removeEventListener("pointerdown", preloadFromIntent);
      document.removeEventListener("focusin", preloadFromIntent);
    };
  }, []);

  useEffect(() => {
    if (!connectionAllowsIdlePrefetch()) return undefined;
    return scheduleIdle(() => {
      void preloadFrequentActions();
      for (const action of contextualActionsForPath(location.pathname)) void preloadAction(action);
    });
  }, [location.pathname]);
};

export default useActionPrefetch;
