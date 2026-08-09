import { createContext, useContext } from "react";

export const FeedbackContext = createContext(null);

export const useFeedback = () => {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback harus digunakan di dalam FeedbackProvider.");
  return value;
};
