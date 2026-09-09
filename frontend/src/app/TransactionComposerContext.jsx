/** Lazy UI composer only; transaction validation and persistence remain in canonical form/API paths. */
import LazyActionFallback from "../components/feedback/LazyActionFallback.jsx";
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { loadActionModule, preloadAction } from "./actionModules.js";
import { TRANSACTION_TYPES } from "../domain/constants.js";
const TransactionForm = lazy(() => loadActionModule("transaction"));

const TransactionComposerContext = createContext(null);

const DEFAULT_COMPOSER_STATE = Object.freeze({
  open: false,
  initialType: TRANSACTION_TYPES.EXPENSE,
  initialSourceAccountId: "",
  presentation: "default",
  initialDraft: null,
  continuation: null,
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
  const continuation = source.continuation && typeof source.continuation === "object" ? { ...source.continuation, payload: { ...(source.continuation.payload || {}) } } : null;
  return { initialType, initialSourceAccountId, presentation, initialDraft, continuation };
};

export const useTransactionComposer = () => {
  const value = useContext(TransactionComposerContext);
  if (!value) throw new Error("useTransactionComposer harus digunakan di dalam TransactionComposerProvider.");
  return value;
};

export const TransactionComposerProvider = ({ children }) => {
  const [composer, setComposer] = useState(DEFAULT_COMPOSER_STATE);
  const [composerDirty, setComposerDirty] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const value = useMemo(() => ({
    openTransactionComposer: (options) => {
      void preloadAction("transaction");
      const next = normalizeComposerOptions(options);
      setComposerDirty(false);
      setComposer({ open: true, ...next });
    },
    closeTransactionComposer: () => { setComposerDirty(false); setComposer((current) => ({ ...current, open: false })); },
    composerOpen: composer.open,
    composerDirty,
    preloadTransactionComposer: () => preloadAction("transaction"),
  }), [composer.open, composerDirty]);

  useEffect(() => {
    if (location.pathname !== "/transaksi") return;
    const params = new URLSearchParams(location.search);
    if (params.get("compose") !== "1") return;
    void preloadAction("transaction");
    setComposerDirty(false);
    setComposer((current) => current.open ? current : { ...DEFAULT_COMPOSER_STATE, open: true });
    params.delete("compose");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true, state: location.state });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!composer.open || !composerDirty) return undefined;
    const protectDraft = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [composer.open, composerDirty]);

  const closeComposer = () => { setComposerDirty(false); setComposer((current) => ({ ...current, open: false })); };

  return (
    <TransactionComposerContext.Provider value={value}>
      {children}
      {composer.open ? <Suspense fallback={<LazyActionFallback surface="modal" title="Tambah transaksi" label="Menyiapkan form transaksi..." />}><TransactionForm
        open
        onClose={closeComposer}
        initialType={composer.initialType}
        initialSourceAccountId={composer.initialSourceAccountId}
        presentation={composer.presentation}
        initialDraft={composer.initialDraft}
        continuation={composer.continuation}
        onDirtyChange={setComposerDirty}
      /></Suspense> : null}
    </TransactionComposerContext.Provider>
  );
};

export default TransactionComposerProvider;
