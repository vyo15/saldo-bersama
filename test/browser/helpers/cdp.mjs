import { once } from "node:events";

const pendingTimeoutMs = 15_000;

export class CdpSession {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ready = once(this.socket, "open");
    this.closed = once(this.socket, "close");
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const deferred = this.pending.get(message.id);
        if (!deferred) return;
        this.pending.delete(message.id);
        clearTimeout(deferred.timer);
        if (message.error) deferred.reject(new Error(`${message.error.message} (${message.error.code})`));
        else deferred.resolve(message.result || {});
        return;
      }
      const callbacks = this.listeners.get(message.method);
      if (!callbacks) return;
      for (const callback of callbacks) callback(message.params || {});
    });
    this.socket.addEventListener("close", () => {
      for (const deferred of this.pending.values()) {
        clearTimeout(deferred.timer);
        deferred.reject(new Error("Sesi Chrome DevTools Protocol ditutup."));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, pendingTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || new Set();
    callbacks.add(callback);
    this.listeners.set(method, callbacks);
    return () => {
      callbacks.delete(callback);
      if (!callbacks.size) this.listeners.delete(method);
    };
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || "Evaluasi browser gagal.";
      throw new Error(description);
    }
    return result.result?.value;
  }

  async close({ timeoutMs = 1_000 } = {}) {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
    let timer;
    await Promise.race([
      this.closed.catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
}

export const waitFor = async (predicate, {
  timeoutMs = 10_000,
  intervalMs = 100,
  description = "kondisi browser",
} = {}) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout menunggu ${description}${lastError ? `: ${lastError.message}` : ""}`);
};
