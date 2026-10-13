import { useEffect, useRef, useState } from "react";
import { APP_MEDIA } from "../../config/layout.js";
import { finishMotionPhase, prefersReducedMotion, semanticMotionDurationMs } from "../../shared/motion.js";

/** Keep the dialog in the portal while a parent-controlled close finishes visually.
 * Only confirmed `open=false` exits: dirty-form guards and Browser Back still own
 * whether the parent is allowed to close. The history/focus lock lasts through exit.
 */
export const useModalPresence = (open, swipeExitFinishedRef) => {
  const dialogRef = useRef(null);
  const [present, setPresent] = useState(Boolean(open));
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setExiting(false);
      return;
    }
    if (!present) return;
    // A swipe already finished its sheet-out animation; never play it twice.
    const lastSwipeFinish = swipeExitFinishedRef?.current || 0;
    if (swipeExitFinishedRef) swipeExitFinishedRef.current = 0;
    if (lastSwipeFinish && Date.now() - lastSwipeFinish < 400) {
      setPresent(false);
      setExiting(false);
      return;
    }
    if (prefersReducedMotion()) { setPresent(false); setExiting(false); return; }
    setExiting(true);
  }, [open, present, swipeExitFinishedRef]);

  useEffect(() => {
    if (!exiting) return undefined;
    const mobile = typeof window !== "undefined" && window.matchMedia?.(APP_MEDIA.mobile).matches;
    return finishMotionPhase(dialogRef.current, {
      kind: "animation",
      durationMs: semanticMotionDurationMs(mobile ? "sheet-exit" : "dialog-exit"),
      onFinish: () => { setPresent(false); setExiting(false); },
    });
  }, [exiting]);

  return { dialogRef, present, exiting };
};
