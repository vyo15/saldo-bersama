import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, isAbortError } from "../services/api/client.js";

export const useApiResource = (action, payload = {}, { enabled = true } = {}) => {
  const [state, setState] = useState({ status: "idle", data: null, error: null, refreshError: null });
  const payloadKey = JSON.stringify(payload);
  const requestSequence = useRef(0);
  const activeController = useRef(null);

  const load = useCallback(async ({ force = true } = {}) => {
    if (!enabled) return null;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setState((current) => ({
      ...current,
      status: current.data ? "refreshing" : "loading",
      error: null,
      refreshError: null,
    }));
    try {
      const data = await apiClient.request(action, JSON.parse(payloadKey), { signal: controller.signal, force });
      if (requestSequence.current !== sequence || controller.signal.aborted) return data;
      setState({ status: "ready", data, error: null, refreshError: null });
      return data;
    } catch (error) {
      if (requestSequence.current !== sequence || isAbortError(error)) return null;
      setState((current) => current.data
        ? { ...current, status: "ready", error: null, refreshError: error }
        : { status: "error", data: null, error, refreshError: null });
      throw error;
    }
  }, [action, enabled, payloadKey]);

  useEffect(() => {
    if (!enabled) {
      requestSequence.current += 1;
      activeController.current?.abort();
      setState({ status: "idle", data: null, error: null, refreshError: null });
      return undefined;
    }
    load({ force: false }).catch(() => {});
    return () => activeController.current?.abort();
  }, [enabled, load]);

  return {
    ...state,
    isRefreshing: state.status === "refreshing",
    reload: () => load({ force: true }),
  };
};
