import { useEffect, useMemo, useState } from "react";

const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const iosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone();

export const useInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && standalone());
  const isIos = useMemo(() => typeof navigator !== "undefined" && iosBrowser(), []);
  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setPromptEvent(event); };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const install = async () => {
    if (!promptEvent) return { outcome: "instructions" };
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setPromptEvent(null);
    return choice;
  };
  return { installed, installable: Boolean(promptEvent), isIos, install };
};
