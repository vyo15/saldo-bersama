import { useState } from "react";
import { createBudgetsBatch } from "./budgets.api.js";
import {
  BUDGET_BATCH_LIMIT,
  buildBudgetBatchPayload,
  budgetBatchTotal,
  createBudgetBatchRow,
  createInitialBudgetBatchRows,
  validateBudgetBatchRow,
} from "./budgetBatchModel.js";

export const useBudgetBatchDraft = ({ items, period, form, resetSaveState, setSaveState }) => {
  const [rows, setRows] = useState(createInitialBudgetBatchRows);
  const [activeRowId, setActiveRowId] = useState("");

  const reset = (activate = false) => {
    const nextRows = createInitialBudgetBatchRows();
    setRows(nextRows);
    setActiveRowId(activate ? nextRows[0].id : "");
  };
  const updateRow = (rowId, updates) => {
    resetSaveState();
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...updates } : row));
  };
  const addRow = () => {
    if (rows.length >= BUDGET_BATCH_LIMIT) {
      setSaveState({ status: "error", error: new Error(`Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan dapat ditambahkan sekaligus.`) });
      return;
    }
    const active = rows.find((row) => row.id === activeRowId) || rows.at(-1);
    try {
      if (active) validateBudgetBatchRow(active, Math.max(0, rows.indexOf(active)));
      const next = createBudgetBatchRow();
      setRows((current) => [...current, next]);
      setActiveRowId(next.id);
      resetSaveState();
    } catch (error) {
      setActiveRowId(error.rowId || active?.id || "");
      setSaveState({ status: "error", error });
    }
  };
  const removeRow = (rowId) => {
    resetSaveState();
    if (rows.length <= 1) {
      const next = createBudgetBatchRow();
      setRows([next]);
      setActiveRowId(next.id);
      return;
    }
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows);
    if (rowId === activeRowId) setActiveRowId(nextRows.at(-1)?.id || "");
  };
  const selectRow = (rowId) => {
    resetSaveState();
    setActiveRowId(rowId);
  };
  const save = () => createBudgetsBatch(buildBudgetBatchPayload({ rows, form, period, items }));
  const focusError = (error) => {
    if (error?.rowId) setActiveRowId(error.rowId);
  };

  return {
    rows,
    activeRowId,
    total: budgetBatchTotal(rows),
    limit: BUDGET_BATCH_LIMIT,
    reset,
    updateRow,
    addRow,
    removeRow,
    selectRow,
    save,
    focusError,
  };
};
