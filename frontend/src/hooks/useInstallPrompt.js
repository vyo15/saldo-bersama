import { useEffect, useMemo, useState } from "react";

const INSTALL_DISMISS_KEY = "saldo-bersama:pwa-install-dismissed-until";
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

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

export const useInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && standalone());
  const [dismissedUntil, setDismissedUntil] = useState(() => dismissedUntilValue());
  const isIos = useMemo(() => typeof navigator !== "undefined" && iosBrowser(), []);

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
  const showPrompt = !installed && (installable || isIos) && dismissedUntil <= Date.now();
  return { installed, installable, isIos, showPrompt, install, dismiss };
};
