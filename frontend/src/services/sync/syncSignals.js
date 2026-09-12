const CHANNEL_NAME = "saldo-bersama-sync-v1";
const listeners = new Set();
let channel = null;
let channelBound = false;

const emit = (detail) => {
  for (const listener of [...listeners]) {
    try { listener(detail); } catch { /* sync hints must never break mutations */ }
  }
};

const ensureChannel = () => {
  if (channelBound || typeof window === "undefined" || typeof window.BroadcastChannel === "undefined") return channel;
  channelBound = true;
  try {
    channel = new window.BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event) => {
      if (event.data?.type === "SERVER_STATE_CHANGED") emit({ source: "broadcast", action: event.data.action || "" });
    });
  } catch { channel = null; }
  return channel;
};

export const publishServerStateChanged = (action = "") => {
  const detail = { source: "local", action: String(action || "") };
  emit(detail);
  const activeChannel = ensureChannel();
  try { activeChannel?.postMessage({ type: "SERVER_STATE_CHANGED", action: detail.action, at: Date.now() }); } catch { /* optional accelerator */ }
};

export const subscribeToServerStateChanged = (listener) => {
  if (typeof listener !== "function") return () => {};
  ensureChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
