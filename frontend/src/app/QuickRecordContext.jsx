import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import LazyActionFallback from "../components/feedback/LazyActionFallback.jsx";
import { useTransactionComposer } from "./TransactionComposerContext.jsx";
import { QuickRecordContext } from "./quickRecordContext.js";

const loadQuickRecordMenu = () => import("../components/navigation/QuickRecordMenu.jsx");
const QuickRecordMenu = lazy(loadQuickRecordMenu);

const QuickRecordProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { openTransactionComposer } = useTransactionComposer();
  const value = useMemo(() => ({
    openQuickRecord: () => { void loadQuickRecordMenu(); setOpen(true); },
    closeQuickRecord: () => setOpen(false),
    quickRecordOpen: open,
  }), [open]);
  const openQuickRecordTransaction = (options) => {
    setOpen(false);
    openTransactionComposer({
      ...options,
      onBack: () => { void loadQuickRecordMenu(); setOpen(true); },
    });
  };

  useEffect(() => setOpen(false), [location.pathname]);

  return <QuickRecordContext.Provider value={value}>
    {children}
    {open ? <Suspense fallback={<LazyActionFallback surface="modal" title="Catat aktivitas" label="Menyiapkan pilihan aktivitas..." size="sm" />}><QuickRecordMenu open onClose={() => setOpen(false)} onOpenTransaction={openQuickRecordTransaction} /></Suspense> : null}
  </QuickRecordContext.Provider>;
};

export default QuickRecordProvider;
