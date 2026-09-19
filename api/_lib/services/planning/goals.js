import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { goalProgress } from "../readModels.js";
import { appError, assertOwner, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { accountWithAccess, assertPlanningManageScope, ruleScopeFromAccount } from "./shared.js";
import { assertGoalLifecycleUpdateShape, goalLifecycleImpact } from "./goalLifecycle.js";
import { goalProjection } from "./goalMovements.js";

// Stable goal facade. Read/update orchestration stays here while destructive lifecycle
// and ledger-linked movements are isolated behind compatible exports.
export const goalListStatements = (context) => {
  const access = visibleScopeSql(context.actor, "g");
  const sourceAccess = context.actor.role === "owner"
    ? { sql: "1=1", args: [] }
    : { sql: "(src.owner_scope='shared' OR (src.owner_scope='personal' AND src.owner_user_id=?))", args: [context.actor.user_id] };
  const withdrawalDestinationAccess = context.actor.role === "owner"
    ? { sql: "1=1", args: [] }
    : { sql: "dest.owner_scope='shared'", args: [] };
  const today = todayJakarta();
  return [
    {
      sql: `SELECT g.*,a.name AS account_name,a.status AS account_status,EXISTS(
        SELECT 1 FROM accounts src WHERE src.status='active' AND src.account_id<>g.account_id
          AND ${sourceAccess.sql}
          AND (g.scope='shared' OR src.owner_scope='shared' OR (src.owner_scope='personal' AND src.owner_user_id=g.owner_user_id))
      ) AS has_deposit_source,EXISTS(
        SELECT 1 FROM accounts dest WHERE dest.status='active' AND dest.account_id<>g.account_id
          AND ${withdrawalDestinationAccess.sql}
      ) AS has_withdraw_destination FROM savings_goals g JOIN accounts a ON a.account_id=g.account_id WHERE ${access.sql} AND g.status<>'archived' ORDER BY CASE g.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,g.status,g.target_date`,
      args: [...sourceAccess.args, ...withdrawalDestinationAccess.args, ...access.args],
    },
    {
      sql: `WITH cash_progress AS (
          SELECT m.goal_id,COALESCE(SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END),0) AS cash_amount
          FROM goal_movements m JOIN savings_goals g ON g.goal_id=m.goal_id
          LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
          WHERE m.status='active' AND g.status<>'archived' AND ${access.sql}
            AND COALESCE(t.transaction_date,substr(m.created_at,1,10))<=?
          GROUP BY m.goal_id
        ), price_events AS (
          SELECT portfolio_id,instrument_id,valuation_date AS price_date,created_at,price_per_share,3 AS priority,rowid AS source_order FROM investment_valuations WHERE valuation_date<=?
          UNION ALL
          SELECT portfolio_id,instrument_id,trade_date,created_at,price_per_share,2,rowid FROM investment_trades WHERE trade_date<=?
          UNION ALL
          SELECT portfolio_id,instrument_id,correction_date,created_at,reference_price,1,rowid FROM investment_corrections WHERE correction_type='opening_position' AND reference_price>0 AND correction_date<=?
        ), latest_prices AS (
          SELECT portfolio_id,instrument_id,price_per_share FROM (
            SELECT price_events.*,ROW_NUMBER() OVER (PARTITION BY portfolio_id,instrument_id ORDER BY price_date DESC,created_at DESC,priority DESC,source_order DESC) AS rn
            FROM price_events
          ) WHERE rn=1
        ), allocated AS (
          SELECT e.goal_id,e.portfolio_id,e.instrument_id,
            COALESCE(SUM(e.share_delta),0) AS shares,
            COALESCE(SUM(e.cost_basis_delta),0) AS cost_basis,
            COALESCE(SUM(e.cash_delta),0) AS retained_cash,
            COALESCE(SUM(e.realized_pl_delta),0) AS realized_pl
          FROM goal_investment_events e JOIN savings_goals g ON g.goal_id=e.goal_id
          WHERE e.status='active' AND e.event_date<=? AND g.status<>'archived' AND ${access.sql}
          GROUP BY e.goal_id,e.portfolio_id,e.instrument_id
        ), funded_goals AS (
          SELECT goal_id FROM cash_progress
          UNION
          SELECT goal_id FROM allocated
        )
        SELECT f.goal_id,COALESCE(c.cash_amount,0) AS cash_amount,
          a.portfolio_id,a.instrument_id,a.shares,a.cost_basis,a.retained_cash,a.realized_pl,
          COALESCE(lp.price_per_share,0) AS price_per_share,i.ticker,i.name AS instrument_name,i.lot_size
        FROM funded_goals f
        LEFT JOIN cash_progress c ON c.goal_id=f.goal_id
        LEFT JOIN allocated a ON a.goal_id=f.goal_id
        LEFT JOIN latest_prices lp ON lp.portfolio_id=a.portfolio_id AND lp.instrument_id=a.instrument_id
        LEFT JOIN investment_instruments i ON i.instrument_id=a.instrument_id`,
      args: [...access.args, today, today, today, today, today, ...access.args],
    },
    {
      sql: `SELECT m.goal_id,m.goal_movement_id,m.transaction_id,m.row_version,m.created_at,t.transaction_date,
          CASE WHEN t.transaction_date IS NOT NULL AND EXISTS(
            SELECT 1 FROM period_closures pc WHERE pc.status='closed' AND pc.period_key>=substr(t.transaction_date,1,7)
          ) THEN 1 ELSE 0 END AS movement_locked
        FROM goal_movements m JOIN savings_goals g ON g.goal_id=m.goal_id
        LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
        WHERE m.status='active' AND g.status<>'archived' AND ${access.sql}
          AND m.goal_movement_id=(
            SELECT m2.goal_movement_id FROM goal_movements m2
            WHERE m2.goal_id=m.goal_id AND m2.status='active'
            ORDER BY m2.created_at DESC LIMIT 1
          )`,
      args: access.args,
    },
  ];
};

const goalMovementState = (row, cashCurrent, totalCurrent, last) => {
  const lastRow = last || {};
  const reached = totalCurrent >= Number(row.target_amount || 0);
  const cashFundingEnabled = ["cash", "mixed"].includes(String(row.funding_mode || "cash"));
  const investmentFundingEnabled = ["investment", "mixed"].includes(String(row.funding_mode || "cash"));
  const activeMovement = [row.status === "active", row.account_status === "active", cashFundingEnabled].every(Boolean);
  const hasDepositSource = Boolean(Number(row.has_deposit_source || 0));
  const canDeposit = [activeMovement, !reached, hasDepositSource].every(Boolean);
  const hasWithdrawDestination = Boolean(Number(row.has_withdraw_destination || 0));
  const canWithdraw = [activeMovement, cashCurrent > 0, hasWithdrawDestination].every(Boolean);
  return {
    reached,
    last_movement_id: lastRow.goal_movement_id || "",
    last_movement_row_version: lastRow.row_version || null,
    can_move: canDeposit || canWithdraw,
    can_deposit: canDeposit,
    can_invest: row.status === "active" && investmentFundingEnabled && !reached,
    deposit_blocked_reason: [activeMovement, !reached, !hasDepositSource].every(Boolean)
      ? "Setoran tunai membutuhkan rekening sumber lain yang dapat Anda operasikan."
      : "",
    can_withdraw: canWithdraw,
    withdraw_blocked_reason: [activeMovement, cashCurrent > 0, !hasWithdrawDestination].every(Boolean)
      ? "Penarikan tunai membutuhkan rekening tujuan lain."
      : "",
    can_reverse: [row.status === "active", Boolean(last), !Boolean(lastRow.movement_locked)].every(Boolean),
  };
};

const goalManagementCapabilities = (row, reached, context) => {
  const ownerMode = context.actor.role === "owner";
  return {
    can_complete: [ownerMode, row.status === "active", reached].every(Boolean),
    can_reopen: [ownerMode, row.status === "completed"].every(Boolean),
    can_update: [row.status === "active", ownerMode || row.scope === "shared"].every(Boolean),
    can_archive: [ownerMode, row.status !== "archived"].every(Boolean),
  };
};

const goalMovementCapabilities = (row, cashCurrent, totalCurrent, last, context) => {
  const movement = goalMovementState(row, cashCurrent, totalCurrent, last);
  const { reached, ...movementCapabilities } = movement;
  return {
    ...movementCapabilities,
    ...goalManagementCapabilities(row, reached, context),
  };
};

const goalFundingBreakdownByGoal = (rows = []) => {
  const lookup = new Map();
  for (const row of rows) {
    if (!lookup.has(row.goal_id)) lookup.set(row.goal_id, { cashAmount: Number(row.cash_amount || 0), marketValue: 0, costBasis: 0, retainedCash: 0, realizedPl: 0, holdings: [] });
    const state = lookup.get(row.goal_id);
    const shares = Number(row.shares || 0);
    const price = Number(row.price_per_share || 0);
    const marketValue = shares > 0 ? shares * price : 0;
    state.marketValue += marketValue;
    state.costBasis += Number(row.cost_basis || 0);
    state.retainedCash += Number(row.retained_cash || 0);
    state.realizedPl += Number(row.realized_pl || 0);
    if (row.instrument_id && shares > 0) state.holdings.push({
      portfolio_id: row.portfolio_id,
      instrument_id: row.instrument_id,
      ticker: row.ticker || "",
      name: row.instrument_name || "",
      lot_size: Number(row.lot_size || 100),
      shares,
      price_per_share: price,
      market_value: marketValue,
      cost_basis: Number(row.cost_basis || 0),
    });
  }
  return lookup;
};

export const mapGoalListRows = (resultRows, context) => {
  const [rows = [], fundingRows = [], movementRows = []] = resultRows;
  const movementLookup = new Map(movementRows.map((row) => [row.goal_id, row]));
  const fundingLookup = goalFundingBreakdownByGoal(fundingRows);
  const items = rows.map((row) => {
    const funding = fundingLookup.get(row.goal_id) || { cashAmount: 0, marketValue: 0, costBasis: 0, retainedCash: 0, realizedPl: 0, holdings: [] };
    const current = funding.cashAmount + funding.marketValue + funding.retainedCash;
    const last = movementLookup.get(row.goal_id) || null;
    return {
      ...publicRow(row),
      current_amount: current,
      cash_amount: funding.cashAmount,
      investment_market_value: funding.marketValue,
      investment_cost_basis: funding.costBasis,
      investment_cash: funding.retainedCash,
      investment_realized_pl: funding.realizedPl,
      investment_result: funding.marketValue - funding.costBasis + funding.realizedPl,
      investment_holdings: funding.holdings,
      ...goalProjection(row, current),
      ...goalMovementCapabilities(row, funding.cashAmount, current, last, context),
    };
  });
  return { items };
};

export const listGoals = async (db, context) => {
  const statements = goalListStatements(context);
  const resultRows = await readBatchRows(db, statements);
  return mapGoalListRows(resultRows, context);
};

const goalPayloadValue = (payload, current, key) => payload[key] === undefined ? current[key] : payload[key];

const assertGoalEnums = ({ status, goalType, priority, fundingMode }) => {
  if (!["active", "completed"].includes(status)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (!["savings", "emergency_fund", "sinking_fund"].includes(goalType)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (!["low", "normal", "high"].includes(priority)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (!["cash", "investment", "mixed"].includes(fundingMode)) throw appError("INVALID_GOAL_FUNDING", "Cara menabung Target tidak valid.", 400);
};

const assertGoalCompletionAllowed = async (db, current, status, targetAmount) => {
  if (status !== "completed") return;
  if ((await goalProgress(db, current.goal_id)) < Number(targetAmount)) {
    throw appError("GOAL_NOT_REACHED", "Target belum mencapai nominal tujuan.", 409);
  }
};

const assertGoalTargetAmountAllowed = async (db, current, payload, targetAmount) => {
  if (payload.target_amount === undefined) return;
  const currentAmount = await goalProgress(db, current.goal_id);
  if (Number(targetAmount) < currentAmount) {
    throw appError("GOAL_TARGET_BELOW_PROGRESS", "Target nominal tidak boleh lebih kecil dari progress yang sudah terkumpul.", 409, { currentAmount, targetAmount: Number(targetAmount) });
  }
};

const goalFundingHistoryCount = async (db, goalId) => {
  const [movements, investments] = await Promise.all([
    db.one("SELECT COUNT(*) AS count FROM goal_movements WHERE goal_id=?", [goalId]),
    db.one("SELECT COUNT(*) AS count FROM goal_investment_events WHERE goal_id=?", [goalId]),
  ]);
  return Number(movements?.count || 0) + Number(investments?.count || 0);
};

const assertGoalFundingModeChangeAllowed = async (db, current, payload) => {
  if (payload.funding_mode === undefined || String(payload.funding_mode) === String(current.funding_mode || "cash")) return;
  if (await goalFundingHistoryCount(db, current.goal_id)) {
    throw appError("GOAL_FUNDING_MODE_LOCKED", "Cara menabung Target tidak dapat diubah setelah memiliki riwayat dana atau investasi.", 409);
  }
};

const assertGoalAccountChangeAllowed = async (db, current, account, owned) => {
  if (!(await goalFundingHistoryCount(db, current.goal_id))) return;
  const sameOwner = owned.scope === current.scope && String(owned.owner_user_id || "") === String(current.owner_user_id || "");
  if (account.account_id === current.account_id && sameOwner) return;
  throw appError("GOAL_ACCOUNT_LOCKED", "Rekening dan kepemilikan target tidak dapat diubah setelah memiliki riwayat dana atau investasi.", 409);
};

// Funding mode changes share one resolver so cash, investment, and mixed Target ownership stay atomic.
// eslint-disable-next-line complexity
const resolveGoalFundingAccount = async (db, context, payload, current = null) => {
  const fundingMode = String(payload.funding_mode ?? current?.funding_mode ?? "cash");
  if (!["cash", "investment", "mixed"].includes(fundingMode)) throw appError("INVALID_GOAL_FUNDING", "Cara menabung Target tidak valid.", 400);
  const fundingModeChanged = current && fundingMode !== String(current.funding_mode || "cash");
  if (fundingMode === "investment" && !payload.account_id && (!current || fundingModeChanged || payload.portfolio_id)) {
    const portfolioId = String(payload.portfolio_id || "");
    const row = await db.one(`SELECT p.portfolio_id,a.* FROM investment_portfolios p JOIN accounts a ON a.account_id=p.rdn_account_id
      WHERE p.portfolio_id=? AND p.status='active' AND a.status='active' AND a.account_type='investment' AND a.owner_scope='shared'`, [portfolioId]);
    if (!row) throw appError("GOAL_INVESTMENT_PORTFOLIO_REQUIRED", "Pilih investasi Bersama yang akan menjadi sumber awal Target.", 409);
    return { account: row, owned: ruleScopeFromAccount(row), fundingMode };
  }
  const accountId = payload.account_id ?? current?.account_id;
  const account = await accountWithAccess(db, context.actor, accountId);
  if (["cash", "mixed"].includes(fundingMode) && account.account_type === "investment") {
    throw appError("GOAL_CASH_ACCOUNT_REQUIRED", "Target tunai atau campuran harus memakai rekening non-investasi sebagai rekening tabungan.", 409);
  }
  if (fundingMode === "investment" && account.account_type !== "investment") {
    throw appError("GOAL_INVESTMENT_ACCOUNT_REQUIRED", "Target investasi harus memakai portfolio investasi sebagai sumber dananya.", 409);
  }
  const owned = ruleScopeFromAccount(account);
  return { account, owned, fundingMode };
};

const buildUpdatedGoal = (current, payload, account, owned, actorId) => {
  const status = String(goalPayloadValue(payload, current, "status"));
  const goalType = String(goalPayloadValue(payload, current, "goal_type"));
  const priority = String(goalPayloadValue(payload, current, "priority"));
  const targetAmount = payload.target_amount === undefined ? current.target_amount : positiveInteger(payload.target_amount, "Target nominal");
  let targetDate = current.target_date;
  if (payload.target_date !== undefined) targetDate = payload.target_date ? dateValue(payload.target_date) : null;
  return {
    ...current,
    name: sanitizeText(goalPayloadValue(payload, current, "name"), 100),
    goal_type: goalType,
    target_amount: targetAmount,
    target_date: targetDate,
    account_id: account.account_id,
    funding_mode: String(goalPayloadValue(payload, current, "funding_mode") || "cash"),
    priority,
    status,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    ...nextVersionStamp(current, actorId),
  };
};

export const createGoal = async (db, context) => {
  const p = context.payload || {};
  const { account, owned, fundingMode } = await resolveGoalFundingAccount(db, context, p);
  if (owned.scope !== "shared") throw appError("GOAL_SHARED_ACCOUNT_REQUIRED", "Target baru adalah rencana Bersama dan harus memakai sumber dana Bersama.", 409);
  assertPlanningManageScope(context.actor, owned);
  const now = nowIso();
  const priority = String(p.priority || "normal");
  const goalType = String(p.goal_type || "savings");
  const record = {
    goal_id: uuid(),
    name: sanitizeText(p.name, 100),
    goal_type: goalType,
    target_amount: positiveInteger(p.target_amount, "Target nominal"),
    target_date: p.target_date ? dateValue(p.target_date, "Tanggal target") : null,
    account_id: account.account_id,
    funding_mode: fundingMode,
    priority,
    status: "active",
    ...newVersionStamp(context.actor.user_id, now),
    scope: owned.scope,
    owner_user_id: owned.owner_user_id
  };
  assertGoalEnums({ status: record.status, goalType, priority, fundingMode });
  if (!record.name) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  await db.execute("INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,funding_mode,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, {
    entityType: "goal",
    entityId: record.goal_id,
    next: publicRow(record)
  });
  await context.enqueueMirror?.(db, "goal", record.goal_id);
  return publicRow(record);
};
export const updateGoal = async (db, context) => {
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target tidak ditemukan.", 404);
  assertPlanningManageScope(context.actor, current);
  assertVersion(current, context.rowVersion ?? p.row_version);
  assertGoalLifecycleUpdateShape(current, p);
  await assertGoalFundingModeChangeAllowed(db, current, p);
  const { account, owned } = await resolveGoalFundingAccount(db, context, p, current);
  assertPlanningManageScope(context.actor, owned);
  if (current.scope === "shared" && owned.scope !== "shared") {
    throw appError("GOAL_SHARED_ACCOUNT_REQUIRED", "Target Bersama tidak dapat dipindahkan ke rekening personal.", 409);
  }
  const next = buildUpdatedGoal(current, p, account, owned, context.actor.user_id);
  assertGoalEnums({ status: next.status, goalType: next.goal_type, priority: next.priority, fundingMode: next.funding_mode });
  await assertGoalTargetAmountAllowed(db, current, p, next.target_amount);
  await assertGoalCompletionAllowed(db, current, next.status, next.target_amount);
  await assertGoalAccountChangeAllowed(db, current, account, owned);
  if (!next.name) throw appError("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  const r = await db.execute("UPDATE savings_goals SET name=?,goal_type=?,target_amount=?,target_date=?,account_id=?,funding_mode=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=?", [next.name, next.goal_type, next.target_amount, next.target_date, next.account_id, next.funding_mode, next.priority, next.status, next.scope, next.owner_user_id, next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (r.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  if (current.status !== "completed" && next.status === "completed") {
    await cancelScheduledManualRemindersForEntity(db, context, "goal", current.goal_id, "ENTITY_COMPLETED");
  }
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: publicRow(next) });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};
export const deleteUnusedGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status='active'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan target wajib diisi.", 400);
  if (!strictBoolean(p.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan target wajib dicentang.", 400);
  const impact = await goalLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("GOAL_DELETE_BLOCKED", "Target tidak memenuhi syarat sebagai target belum pernah digunakan.", 409, impact);
  await cancelScheduledManualRemindersForEntity(db, context, "goal", current.goal_id, "ENTITY_DELETED");
  await appendAudit(db, context, {
    entityType: "goal",
    entityId: current.goal_id,
    previous: publicRow(current),
    next: { deleted: true, deletion_type: "unused_goal_only", reason, current_amount: impact.currentAmount, dependencies: impact.dependencies, audit_preserved: true },
  });
  const result = await db.execute("DELETE FROM savings_goals WHERE goal_id=? AND row_version=? AND status='active'", [current.goal_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah atau baru saja digunakan di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return { goal_id: current.goal_id, deleted: true, audit_preserved: true };
};

export { archiveGoal, previewGoalLifecycle, restoreGoal } from "./goalLifecycle.js";
export { goalProjection, moveGoal, reverseGoalMovement } from "./goalMovements.js";

export { allocateGoalInvestment, releaseGoalInvestment } from "./goalInvestments.js";
