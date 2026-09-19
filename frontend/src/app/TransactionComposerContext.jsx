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
  initialAllocationContext: null,
  planningIntent: null,
  continuation: null,
  lockType: false,
  title: "",
  description: "",
  submitLabel: "",
  submittingLabel: "",
  onBack: null,
});

const SUPPORTED_TRANSACTION_TYPES = new Set([
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.TRANSFER,
  TRANSACTION_TYPES.REFUND,
]);

const composerString = (value) => typeof value === "string" ? value : "";
const composerObject = (value) => value && typeof value === "object" ? { ...value } : null;
const normalizeAllocationContext = (value) => value && typeof value === "object" ? {
  budget: composerObject(value.budget),
  envelope: composerObject(value.envelope),
} : null;
const normalizeContinuation = (value) => value && typeof value === "object"
  ? { ...value, payload: { ...(value.payload || {}) } }
  : null;

const normalizeComposerOptions = (options) => {
  const source = options && typeof options === "object" ? options : {};
  const initialType = SUPPORTED_TRANSACTION_TYPES.has(source.initialType)
    ? source.initialType
    : TRANSACTION_TYPES.EXPENSE;
  const initialSourceAccountId = composerString(source.initialSourceAccountId);
  const presentation = source.presentation === "mobile-transfer" ? "mobile-transfer" : "default";
  const initialDraft = composerObject(source.initialDraft);
  const initialAllocationContext = normalizeAllocationContext(source.initialAllocationContext);
  const planningIntent = composerObject(source.planningIntent);
  const continuation = normalizeContinuation(source.continuation);
  const lockType = source.lockType === true;
  const title = composerString(source.title);
  const description = composerString(source.description);
  const submitLabel = composerString(source.submitLabel);
  const submittingLabel = composerString(source.submittingLabel);
  const onBack = typeof source.onBack === "function" ? source.onBack : null;
  return { initialType, initialSourceAccountId, presentation, initialDraft, initialAllocationContext, planningIntent, continuation, lockType, title, description, submitLabel, submittingLabel, onBack };
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
      {composer.open ? <Suspense fallback={<LazyActionFallback surface="modal" title="Catat transaksi" label="Menyiapkan form transaksi..." />}><TransactionForm
        open
        onClose={closeComposer}
        initialType={composer.initialType}
        initialSourceAccountId={composer.initialSourceAccountId}
        presentation={composer.presentation}
        initialDraft={composer.initialDraft}
        initialAllocationContext={composer.initialAllocationContext}
        planningIntent={composer.planningIntent}
        continuation={composer.continuation}
        lockType={composer.lockType}
        title={composer.title || undefined}
        description={composer.description}
        submitLabel={composer.submitLabel || undefined}
        submittingLabel={composer.submittingLabel || undefined}
        onBack={composer.onBack}
        onDirtyChange={setComposerDirty}
      /></Suspense> : null}
    </TransactionComposerContext.Provider>
  );
};

export default TransactionComposerProvider;
