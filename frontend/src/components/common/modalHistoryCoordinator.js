const MODAL_STATE_KEY = "__saldoModalId";

const stateObject = (win) => (win.history.state && typeof win.history.state === "object" ? win.history.state : {});
const stateToken = (win) => stateObject(win)[MODAL_STATE_KEY] || "";

export const createModalHistoryCoordinator = (win) => {
  let ownerToken = "";
  let markerActive = false;
  let activationTimer = null;
  let releaseTimer = null;

  const clearActivation = () => {
    if (activationTimer === null) return;
    win.clearTimeout(activationTimer);
    activationTimer = null;
  };
  const clearRelease = () => {
    if (releaseTimer === null) return;
    win.clearTimeout(releaseTimer);
    releaseTimer = null;
  };
  const replaceMarker = (token) => {
    const current = stateObject(win);
    win.history.replaceState({ ...current, [MODAL_STATE_KEY]: token }, "", win.location.href);
    ownerToken = token;
    markerActive = true;
  };
  const pushMarker = (token) => {
    if (ownerToken !== token) return;
    const current = stateObject(win);
    win.history.pushState({ ...current, [MODAL_STATE_KEY]: token }, "", win.location.href);
    markerActive = true;
    activationTimer = null;
  };

  return {
    reserve(token) {
      clearRelease();
      clearActivation();

      // A modal opened while the previous modal is closing is a handoff, not a
      // second navigation. Reusing the current marker avoids a late history.back
      // from the old modal racing the new overlay.
      if (markerActive && ownerToken && stateToken(win) === ownerToken) {
        replaceMarker(token);
        return;
      }

      ownerToken = token;
      markerActive = false;
      activationTimer = win.setTimeout(() => pushMarker(token), 0);
    },

    release(token) {
      if (ownerToken !== token) return;
      clearActivation();
      clearRelease();

      if (!markerActive || stateToken(win) !== token) {
        ownerToken = "";
        markerActive = false;
        return;
      }

      // Delay one task so a replacement modal mounted in the same React commit
      // can claim this marker before navigation is changed.
      releaseTimer = win.setTimeout(() => {
        releaseTimer = null;
        if (ownerToken !== token || stateToken(win) !== token) return;
        ownerToken = "";
        markerActive = false;
        win.history.back();
      }, 0);
    },

    consume(token) {
      if (ownerToken !== token) return;
      clearActivation();
      clearRelease();
      ownerToken = "";
      markerActive = false;
    },

    restore(token) {
      if (ownerToken !== token) ownerToken = token;
      clearActivation();
      clearRelease();
      const current = stateObject(win);
      win.history.pushState({ ...current, [MODAL_STATE_KEY]: token }, "", win.location.href);
      markerActive = true;
    },

    owns(token) {
      return ownerToken === token && stateToken(win) === token;
    },
  };
};

let browserCoordinator = null;

export const getModalHistoryCoordinator = () => {
  if (typeof window === "undefined") return null;
  if (!browserCoordinator) browserCoordinator = createModalHistoryCoordinator(window);
  return browserCoordinator;
};

export { MODAL_STATE_KEY };
