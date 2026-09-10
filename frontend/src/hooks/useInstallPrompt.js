import { useEffect, useMemo, useRef, useState } from "react";

const INSTALL_DISMISS_KEY = "saldo-bersama:pwa-install-dismissed-until";
const INSTALL_ENGAGEMENT_KEY = "saldo-bersama:pwa-install-engagement:v1";
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SESSION_MS = 30_000;
const MIN_INTERACTIONS = 3;

const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const iosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone();
const localStorageSafe = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
};
const dismissedUntilValue = () => {
  const raw = localStorageSafe()?.getItem(INSTALL_DISMISS_KEY);
  const value = Number(raw || 0);
  return Number.isFinite(value) ? value : 0;
};
const readEngagement = () => {
  try {
    const parsed = JSON.parse(localStorageSafe()?.getItem(INSTALL_ENGAGEMENT_KEY) || "{}");
    return { visits: Math.max(0, Number(parsed.visits || 0)), lastVisit: Number(parsed.lastVisit || 0) };
  } catch { return { visits: 0, lastVisit: 0 }; }
};
const recordVisit = () => {
  const storage = localStorageSafe();
  const current = readEngagement();
  const now = Date.now();
  const separateVisit = !current.lastVisit || now - current.lastVisit > 6 * 60 * 60 * 1000;
  const next = { visits: current.visits + (separateVisit ? 1 : 0), lastVisit: now };
  try { storage?.setItem(INSTALL_ENGAGEMENT_KEY, JSON.stringify(next)); } catch { /* presentational preference only */ }
  return next;
};

export const useInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && standalone());
  const [dismissedUntil, setDismissedUntil] = useState(() => dismissedUntilValue());
  const [engaged, setEngaged] = useState(false);
  const interactionsRef = useRef(0);
  const visitsRef = useRef(0);
  const isIos = useMemo(() => typeof navigator !== "undefined" && iosBrowser(), []);

  useEffect(() => {
    visitsRef.current = recordVisit().visits;
    if (visitsRef.current >= 2) setEngaged(true);
    const timer = window.setTimeout(() => setEngaged(true), MIN_SESSION_MS);
    const onInteraction = (event) => {
      if (!event.target?.closest?.("a[href],button,[role='button'],[data-preload-action]")) return;
      interactionsRef.current += 1;
      if (interactionsRef.current >= MIN_INTERACTIONS) setEngaged(true);
    };
    document.addEventListener("pointerup", onInteraction, { passive: true });
    document.addEventListener("keydown", onInteraction);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerup", onInteraction);
      document.removeEventListener("keydown", onInteraction);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setPromptEvent(event); };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setDismissedUntil(0);
      localStorageSafe()?.removeItem(INSTALL_DISMISS_KEY);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return { outcome: "instructions" };
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setPromptEvent(null);
      setDismissedUntil(0);
      localStorageSafe()?.removeItem(INSTALL_DISMISS_KEY);
    }
    return choice;
  };

  const dismiss = () => {
    const until = Date.now() + INSTALL_DISMISS_MS;
    setDismissedUntil(until);
    try { localStorageSafe()?.setItem(INSTALL_DISMISS_KEY, String(until)); } catch { /* presentational preference only */ }
  };

  const installable = Boolean(promptEvent);
  const showPrompt = engaged && !installed && (installable || isIos) && dismissedUntil <= Date.now();
  return { installed, installable, isIos, showPrompt, install, dismiss };
};
