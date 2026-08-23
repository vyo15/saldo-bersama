/** Lazy UI composer only; transaction validation and persistence remain in canonical form/API paths. */
import { createContext, lazy, Suspense, useContext, useMemo, useState } from "react";
import { TRANSACTION_TYPES } from "../domain/constants.js";
const TransactionForm = lazy(() => import("../features/transactions/TransactionForm.jsx"));

const TransactionComposerContext = createContext(null);

const DEFAULT_COMPOSER_STATE = Object.freeze({
  open: false,
  initialType: TRANSACTION_TYPES.EXPENSE,
  initialSourceAccountId: "",
  presentation: "default",
  initialDraft: null,
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
  const initialDraft = source.initialDraft && typeof source.initialDraft === "object" ? { ...source.initialDraft } : null;
  return { initialType, initialSourceAccountId, presentation, initialDraft };
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
      {composer.open ? <Suspense fallback={null}><TransactionForm
        open
        onClose={closeComposer}
        initialType={composer.initialType}
        initialSourceAccountId={composer.initialSourceAccountId}
        presentation={composer.presentation}
        initialDraft={composer.initialDraft}
      /></Suspense> : null}
    </TransactionComposerContext.Provider>
  );
};

export default TransactionComposerProvider;
