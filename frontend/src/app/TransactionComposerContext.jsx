import { createContext, useContext, useMemo, useState } from "react";
import TransactionForm from "../features/transactions/TransactionForm.jsx";

const TransactionComposerContext = createContext(null);

export const useTransactionComposer = () => {
  const value = useContext(TransactionComposerContext);
  if (!value) throw new Error("useTransactionComposer harus digunakan di dalam TransactionComposerProvider.");
  return value;
};

export const TransactionComposerProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({
    openTransactionComposer: () => setOpen(true),
    closeTransactionComposer: () => setOpen(false),
  }), []);

  return (
    <TransactionComposerContext.Provider value={value}>
      {children}
      <TransactionForm open={open} onClose={() => setOpen(false)} />
    </TransactionComposerContext.Provider>
  );
};

export default TransactionComposerProvider;
