import { useCallback, useRef, useState } from "react";
import { isOutcomeUnknownError } from "../services/api/client.js";

export const useGuardedMutation = () => {
  const inFlightRef = useRef(false);
  const promiseRef = useRef(null);
  const [state, setState] = useState({ status: "idle", error: null });

  const run = useCallback(async (task) => {
    if (inFlightRef.current && promiseRef.current) return promiseRef.current;
    inFlightRef.current = true;
    setState({ status: "submitting", error: null });
    const promise = Promise.resolve()
      .then(task)
      .then((result) => {
        setState({ status: "success", error: null });
        return result;
      })
      .catch((error) => {
        setState({ status: isOutcomeUnknownError(error) ? "unknown" : "error", error });
        throw error;
      })
      .finally(() => {
        inFlightRef.current = false;
        promiseRef.current = null;
      });
    promiseRef.current = promise;
    return promise;
  }, []);

  const reset = useCallback(() => {
    if (!inFlightRef.current) setState({ status: "idle", error: null });
  }, []);

  return {
    run,
    reset,
    status: state.status,
    error: state.error,
    busy: state.status === "submitting",
    outcomeUnknown: state.status === "unknown",
  };
};

export default useGuardedMutation;
