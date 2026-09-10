import { useEffect, useRef, useState } from "react";
import { stableValue } from "../services/api/serialization.js";

const fingerprint = (value) => JSON.stringify(stableValue(value ?? null));

export const resolveUnsavedDraftClose = ({ dirty, blocked = false, intent = "dismiss" }) => {
  if (blocked) return "blocked";
  if (intent === "cancel") return "close";
  return dirty ? "confirm" : "close";
};

const useUnsavedChangesGuard = ({ open, value, onClose, blocked = false }) => {
  const baselineRef = useRef("");
  const wasOpenRef = useRef(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const currentFingerprint = fingerprint(value);

  useEffect(() => {
    if (open && !wasOpenRef.current) baselineRef.current = currentFingerprint;
    if (!open) {
      baselineRef.current = "";
      setPromptOpen(false);
    }
    wasOpenRef.current = open;
  }, [currentFingerprint, open]);

  const dirty = Boolean(open && baselineRef.current && baselineRef.current !== currentFingerprint);

  useEffect(() => {
    if (!dirty || blocked) return undefined;
    const protectDraft = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [blocked, dirty]);

  const requestClose = () => {
    const decision = resolveUnsavedDraftClose({ dirty, blocked, intent: "dismiss" });
    if (decision === "blocked") return false;
    if (decision === "confirm") {
      setPromptOpen(true);
      return false;
    }
    onClose?.();
    return true;
  };

  const discardAndClose = () => {
    if (resolveUnsavedDraftClose({ dirty, blocked, intent: "cancel" }) === "blocked") return false;
    setPromptOpen(false);
    baselineRef.current = currentFingerprint;
    onClose?.();
    return true;
  };

  const confirmDiscard = () => {
    setPromptOpen(false);
    baselineRef.current = currentFingerprint;
    onClose?.();
  };

  return {
    dirty,
    promptOpen,
    requestClose,
    discardAndClose,
    cancelDiscard: () => setPromptOpen(false),
    confirmDiscard,
  };
};

export default useUnsavedChangesGuard;
