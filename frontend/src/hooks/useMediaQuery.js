import { useEffect, useState } from "react";

const mediaMatches = (query, fallback) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return fallback;
  return window.matchMedia(query).matches;
};

const subscribeMedia = (media, listener) => {
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener?.(listener);
  return () => media.removeListener?.(listener);
};

export const useMediaQuery = (query, { fallback = false } = {}) => {
  const [matches, setMatches] = useState(() => mediaMatches(query, fallback));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMatches(fallback);
      return undefined;
    }
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    return subscribeMedia(media, update);
  }, [fallback, query]);

  return matches;
};

export default useMediaQuery;
