import { createContext, useContext } from "react";

export const QuickRecordContext = createContext(null);

export const useQuickRecord = () => {
  const value = useContext(QuickRecordContext);
  if (!value) throw new Error("useQuickRecord harus digunakan di dalam QuickRecordProvider.");
  return value;
};
