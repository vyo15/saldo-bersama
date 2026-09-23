import { APP_MEDIA } from "../config/layout.js";
import { mobilePrimaryScrollKey } from "../config/navigation.js";
import { useEffect, useLayoutEffect, useRef } from "react";

const primaryTabScrollPositions = new Map();
const historyEntryScrollPositions = new Map();
const MAX_HISTORY_POSITIONS = 50;

const isMobileViewport = () => typeof window !== "undefined" && window.matchMedia?.(APP_MEDIA.mobile)?.matches === true;

const rememberHistoryPosition = (key, top) => {
  if (!key) return;
  historyEntryScrollPositions.delete(key);
  historyEntryScrollPositions.set(key, top);
  if (historyEntryScrollPositions.size <= MAX_HISTORY_POSITIONS) return;
  const oldestKey = historyEntryScrollPositions.keys().next().value;
  historyEntryScrollPositions.delete(oldestKey);
};

const restoreScrollPosition = (top) => {
  let secondFrame = 0;
  const firstFrame = window.requestAnimationFrame(() => {
    window.scrollTo({ top, left: 0, behavior: "auto" });
    secondFrame = window.requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: "auto" }));
  });
  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (secondFrame) window.cancelAnimationFrame(secondFrame);
  };
};

const resolveDestinationTop = (location, navigationType) => {
  if (navigationType === "POP" && location.key && historyEntryScrollPositions.has(location.key)) {
    return historyEntryScrollPositions.get(location.key);
  }
  const primaryKey = mobilePrimaryScrollKey(location.pathname);
  return primaryKey ? primaryTabScrollPositions.get(primaryKey) ?? 0 : 0;
};

const useMobileTabScrollRestoration = (location, navigationType) => {
  const previousLocationRef = useRef(location);

  useEffect(() => {
    if (!isMobileViewport() || !("scrollRestoration" in window.history)) return undefined;
    const previousMode = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previousMode; };
  }, []);

  useLayoutEffect(() => {
    if (!isMobileViewport()) {
      previousLocationRef.current = location;
      return undefined;
    }

    const previousLocation = previousLocationRef.current;
    if (previousLocation.key === location.key && previousLocation.pathname === location.pathname && previousLocation.search === location.search) return undefined;

    const previousTop = window.scrollY;
    rememberHistoryPosition(previousLocation.key, previousTop);
    const previousPrimaryKey = mobilePrimaryScrollKey(previousLocation.pathname);
    if (previousPrimaryKey) primaryTabScrollPositions.set(previousPrimaryKey, previousTop);

    previousLocationRef.current = location;
    return restoreScrollPosition(resolveDestinationTop(location, navigationType));
  }, [location, navigationType]);
};

export default useMobileTabScrollRestoration;
