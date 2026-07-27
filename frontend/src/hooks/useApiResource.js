import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../services/api/client.js";

export const useApiResource = (action, payload = {}, { enabled = true } = {}) => {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  const payloadKey = JSON.stringify(payload);
  const load = useCallback(async () => {
    if (!enabled) return;
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const data = await apiClient.request(action, JSON.parse(payloadKey));
      setState({ status: "ready", data, error: null });
    } catch (error) {
      setState({ status: "error", data: null, error });
    }
  }, [action, enabled, payloadKey]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
};
