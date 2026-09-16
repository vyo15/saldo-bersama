import { BUDGET_BATCH_LIMIT, createBudgetBatchRow } from "../budgets/budgetBatchModel.js";

export const ALLOCATION_CREATE_NEED_LIMIT = BUDGET_BATCH_LIMIT;
export const createAllocationNeedDraft = (overrides = {}) => createBudgetBatchRow(overrides);
