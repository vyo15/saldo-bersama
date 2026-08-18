import { createContext, useContext, useMemo, useState } from "react";
import { TRANSACTION_TYPES } from "../domain/constants.js";
import TransactionForm from "../features/transactions/TransactionForm.jsx";

const TransactionComposerContext = createContext(null);

const DEFAULT_COMPOSER_STATE = Object.freeze({
  open: false,
  initialType: TRANSACTION_TYPES.EXPENSE,
  initialSourceAccountId: "",
  presentation: "default",
});

const SUPPORTED_TRANSACTION_TYPES = new Set([
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.TRANSFER,
  TRANSACTION_TYPES.REFUND,
]);

const normalizeComposerOptions = (options) => {
  const source = options && typeof options === "object" ? options : {};
  const initialType = SUPPORTED_TRANSACTION_TYPES.has(source.initialType)
    ? source.initialType
    : TRANSACTION_TYPES.EXPENSE;
  const initialSourceAccountId = typeof source.initialSourceAccountId === "string"
    ? source.initialSourceAccountId
    : "";
  const presentation = source.presentation === "mobile-transfer" ? "mobile-transfer" : "default";
  return { initialType, initialSourceAccountId, presentation };
};

export const useTransactionComposer = () => {
  const value = useContext(TransactionComposerContext);
  if (!value) throw new Error("useTransactionComposer harus digunakan di dalam TransactionComposerProvider.");
  return value;
};

export const TransactionComposerProvider = ({ children }) => {
  const [composer, setComposer] = useState(DEFAULT_COMPOSER_STATE);
  const value = useMemo(() => ({
    openTransactionComposer: (options) => {
      const next = normalizeComposerOptions(options);
      setComposer({ open: true, ...next });
    },
    closeTransactionComposer: () => setComposer((current) => ({ ...current, open: false })),
  }), []);

  const closeComposer = () => setComposer((current) => ({ ...current, open: false }));

  return (
    <TransactionComposerContext.Provider value={value}>
      {children}
      <TransactionForm
        open={composer.open}
        onClose={closeComposer}
        initialType={composer.initialType}
        initialSourceAccountId={composer.initialSourceAccountId}
        presentation={composer.presentation}
      />
    </TransactionComposerContext.Provider>
  );
};

export default TransactionComposerProvider;
