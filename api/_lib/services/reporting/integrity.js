import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { firstNegativeBalanceFromRows } from "../readModels.js";
import { canonicalJson, nowIso, todayJakarta, uuid } from "../core.js";
import { investmentHoldingStateFromEvents } from "../investments.js";

const INTEGRITY_STATIC_STATEMENTS = [
  { sql: "PRAGMA foreign_key_check", args: [] },
  { sql: "SELECT idempotency_key,created_by,COUNT(*) AS count FROM transactions GROUP BY idempotency_key,created_by HAVING COUNT(*)>1", args: [] },
  { sql: "SELECT transaction_id FROM transactions WHERE transaction_type='transfer' AND (source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id=destination_account_id)", args: [] },
  { sql: "SELECT account_id FROM accounts WHERE (owner_scope='shared' AND owner_user_id IS NOT NULL) OR (owner_scope='personal' AND owner_user_id IS NULL)", args: [] },
  { sql: `SELECT r.envelope_rule_id FROM envelope_rules r
    LEFT JOIN users u ON u.user_id=r.assignee_user_id
    WHERE r.assignee_user_id IS NOT NULL AND (u.user_id IS NULL OR (r.status='active' AND u.status<>'active'))`, args: [] },
  { sql: "SELECT occurrence_id FROM recurring_occurrences WHERE actual_amount<>(SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status='active' AND recurring_occurrence_id=recurring_occurrences.occurrence_id)", args: [] },
  { sql: `SELECT COUNT(*) AS count
    FROM notification_deliveries d
    JOIN notification_queue n ON n.notification_id=d.notification_id
    JOIN push_subscriptions s ON s.subscription_id=d.subscription_id
    WHERE n.user_id<>s.user_id`, args: [] },
  { sql: `SELECT COUNT(*) AS count
    FROM push_subscriptions s JOIN users u ON u.user_id=s.user_id
    WHERE s.status='active' AND u.status<>'active'`, args: [] },
  { sql: `SELECT COUNT(DISTINCT n.notification_id) AS count
    FROM notification_queue n JOIN notification_deliveries d ON d.notification_id=n.notification_id
    WHERE n.status IN ('sent','dead_letter') AND d.status IN ('pending','processing','failed')`, args: [] },
  { sql: `SELECT
      a.account_id AS protected_account_id,
      a.initial_balance AS protected_initial_balance,
      a.initial_balance_date AS protected_initial_balance_date,
      ev.transaction_id,ev.transaction_date,ev.transaction_type,ev.source_account_id,ev.destination_account_id,ev.amount,ev.created_at,ev.status,
      ev.investment_account_id,ev.investment_cash_effect
    FROM accounts a
    LEFT JOIN (
      SELECT transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,amount,created_at,status,NULL AS investment_account_id,0 AS investment_cash_effect
      FROM transactions WHERE status='active'
      UNION ALL
      SELECT event_id,event_date,'investment',NULL,NULL,0,created_at,'active',account_id,cash_effect
      FROM investment_account_events
    ) ev ON ev.transaction_date>=a.initial_balance_date
      AND (ev.source_account_id=a.account_id OR ev.destination_account_id=a.account_id OR ev.investment_account_id=a.account_id)
    WHERE a.allow_negative=0
    ORDER BY a.account_id,ev.transaction_date,ev.created_at,ev.transaction_id`, args: [] },
  { sql: "SELECT key,value FROM system_config WHERE key IN ('timezone','currency') ORDER BY key", args: [] },
  { sql: `WITH reminder_state AS (
      SELECT m.reminder_id,m.user_id,m.entity_type,m.entity_id,m.status AS reminder_status,
        u.status AS user_status,
        b.budget_id,b.status AS budget_status,b.scope AS budget_scope,b.owner_user_id AS budget_owner_user_id,
        g.goal_id,g.status AS goal_status,g.scope AS goal_scope,g.owner_user_id AS goal_owner_user_id,
        ep.envelope_period_id,ep.status AS envelope_period_status,er.envelope_rule_id,er.status AS envelope_rule_status,
        er.scope AS envelope_scope,er.owner_user_id AS envelope_owner_user_id,er.assignee_user_id AS envelope_assignee_user_id,
        ro.occurrence_id,ro.status AS occurrence_status,rr.recurring_rule_id,rr.status AS recurring_rule_status,
        rr.scope AS recurring_scope,rr.owner_user_id AS recurring_owner_user_id,
        nq.notification_id,nq.user_id AS queue_user_id,nq.notification_type AS queue_type,nq.status AS queue_status
      FROM manual_reminders m
      LEFT JOIN users u ON u.user_id=m.user_id
      LEFT JOIN budgets b ON m.entity_type='budget' AND b.budget_id=m.entity_id
      LEFT JOIN savings_goals g ON m.entity_type='goal' AND g.goal_id=m.entity_id
      LEFT JOIN envelope_periods ep ON m.entity_type='envelope_period' AND ep.envelope_period_id=m.entity_id
      LEFT JOIN envelope_rules er ON er.envelope_rule_id=ep.envelope_rule_id
      LEFT JOIN recurring_occurrences ro ON m.entity_type='recurring_occurrence' AND ro.occurrence_id=m.entity_id
      LEFT JOIN recurring_rules rr ON rr.recurring_rule_id=ro.recurring_rule_id
      LEFT JOIN notification_queue nq ON nq.dedupe_key=('manual-reminder:' || m.reminder_id)
      WHERE m.status IN ('scheduled','queued')
    ), reminder_issues AS (
      SELECT 'REMINDER_USER_INACTIVE' AS code FROM reminder_state WHERE reminder_status='scheduled' AND COALESCE(user_status,'inactive')<>'active'
      UNION ALL
      SELECT 'REMINDER_ENTITY_MISSING' FROM reminder_state WHERE reminder_status='scheduled' AND (
        (entity_type='budget' AND budget_id IS NULL) OR
        (entity_type='goal' AND goal_id IS NULL) OR
        (entity_type='envelope_period' AND (envelope_period_id IS NULL OR envelope_rule_id IS NULL)) OR
        (entity_type='recurring_occurrence' AND (occurrence_id IS NULL OR recurring_rule_id IS NULL))
      )
      UNION ALL
      SELECT 'REMINDER_ENTITY_INACTIVE' FROM reminder_state WHERE reminder_status='scheduled' AND (
        (entity_type='budget' AND budget_id IS NOT NULL AND budget_status<>'active') OR
        (entity_type='goal' AND goal_id IS NOT NULL AND goal_status<>'active') OR
        (entity_type='envelope_period' AND envelope_period_id IS NOT NULL AND envelope_rule_id IS NOT NULL AND (envelope_period_status<>'active' OR envelope_rule_status<>'active')) OR
        (entity_type='recurring_occurrence' AND occurrence_id IS NOT NULL AND recurring_rule_id IS NOT NULL AND (recurring_rule_status<>'active' OR occurrence_status IN ('paid','cancelled')))
      )
      UNION ALL
      SELECT 'REMINDER_ENTITY_ACCESS_MISMATCH' FROM reminder_state WHERE reminder_status='scheduled' AND (
        (entity_type='budget' AND budget_id IS NOT NULL AND budget_scope='personal' AND budget_owner_user_id<>user_id) OR
        (entity_type='goal' AND goal_id IS NOT NULL AND goal_scope='personal' AND goal_owner_user_id<>user_id) OR
        (entity_type='envelope_period' AND envelope_period_id IS NOT NULL AND envelope_rule_id IS NOT NULL AND ((envelope_scope='personal' AND envelope_owner_user_id<>user_id) OR (envelope_assignee_user_id IS NOT NULL AND envelope_assignee_user_id<>user_id))) OR
        (entity_type='recurring_occurrence' AND occurrence_id IS NOT NULL AND recurring_rule_id IS NOT NULL AND recurring_scope='personal' AND recurring_owner_user_id<>user_id)
      )
      UNION ALL
      SELECT 'REMINDER_QUEUE_MISSING' FROM reminder_state WHERE reminder_status='queued' AND notification_id IS NULL
      UNION ALL
      SELECT 'REMINDER_QUEUE_MISMATCH' FROM reminder_state WHERE reminder_status='queued' AND notification_id IS NOT NULL AND (queue_user_id<>user_id OR queue_type<>'manual_reminder')
      UNION ALL
      SELECT 'REMINDER_MULTIPLE_NONTERMINAL_DISPATCH' FROM (
        SELECT user_id,entity_type,entity_id,COUNT(*) AS pending_count
        FROM reminder_state
        WHERE reminder_status='queued' AND (notification_id IS NULL OR queue_status NOT IN ('sent','dead_letter'))
        GROUP BY user_id,entity_type,entity_id HAVING COUNT(*)>1
      )
    )
    SELECT code,COUNT(*) AS count FROM reminder_issues GROUP BY code ORDER BY code`, args: [] },
  { sql: `SELECT r.envelope_rule_id
    FROM envelope_rules r LEFT JOIN accounts a ON a.account_id=r.source_account_id
    WHERE r.status='active' AND (TRIM(COALESCE(r.source_account_id,''))='' OR a.account_id IS NULL OR a.status<>'active')`, args: [] },
  { sql: `SELECT t.transaction_id
    FROM transactions t
    JOIN envelope_periods p ON p.envelope_period_id=t.envelope_period_id
    JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE t.status='active' AND t.transaction_type='expense' AND p.status='active' AND r.status='active'
      AND (TRIM(COALESCE(r.source_account_id,''))='' OR TRIM(COALESCE(t.source_account_id,''))='' OR t.source_account_id<>r.source_account_id)`, args: [] },
  { sql: `SELECT m.movement_id
    FROM envelope_movements m
    JOIN envelope_periods fp ON fp.envelope_period_id=m.from_envelope_period_id
    JOIN envelope_rules fr ON fr.envelope_rule_id=fp.envelope_rule_id
    JOIN envelope_periods tp ON tp.envelope_period_id=m.to_envelope_period_id
    JOIN envelope_rules tr ON tr.envelope_rule_id=tp.envelope_rule_id
    WHERE m.status='active' AND m.movement_type='reallocation'
      AND (TRIM(COALESCE(fr.source_account_id,''))='' OR TRIM(COALESCE(tr.source_account_id,''))='' OR fr.source_account_id<>tr.source_account_id)`, args: [] },
];

const accountAllocationIntegrityStatement = () => ({
  sql: `SELECT a.account_id,
      CASE WHEN a.initial_balance_date<=? THEN a.initial_balance + COALESCE((
        SELECT SUM(CASE
          WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
          WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
          WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
          WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
          WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
          ELSE 0 END)
        FROM transactions t WHERE t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND ?
          AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
      ),0) + COALESCE((SELECT SUM(e.cash_effect) FROM investment_account_events e
        WHERE e.account_id=a.account_id AND e.event_date BETWEEN a.initial_balance_date AND ?),0) ELSE 0 END AS balance,
      COALESCE((SELECT SUM(CASE WHEN p.allocated_amount - COALESCE((
        SELECT SUM(et.amount) FROM transactions et
        WHERE et.status='active' AND et.transaction_type='expense' AND et.envelope_period_id=p.envelope_period_id AND et.transaction_date<=?
      ),0)>0 THEN p.allocated_amount - COALESCE((
        SELECT SUM(et.amount) FROM transactions et
        WHERE et.status='active' AND et.transaction_type='expense' AND et.envelope_period_id=p.envelope_period_id AND et.transaction_date<=?
      ),0) ELSE 0 END)
      FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      WHERE p.status='active' AND r.status='active' AND r.source_account_id=a.account_id),0) AS allocated_remaining
    FROM accounts a WHERE a.status='active' AND a.allow_negative=0`,
  args: [todayJakarta(), todayJakarta(), todayJakarta(), todayJakarta(), todayJakarta()],
});

const costShareIntegrityStatement = () => ({
  sql: "SELECT transaction_id,transaction_type,scope,amount,cost_share_mode,cost_share_json FROM transactions ORDER BY transaction_id",
  args: [],
});

const investmentIntegrityStatement = () => ({
  sql: `SELECT p.portfolio_id,p.rdn_account_id,a.account_type,a.allow_negative,a.status AS rdn_status,a.initial_balance_date,
      e.event_date,e.created_at,e.event_kind,e.event_id,e.instrument_id,e.trade_type,e.share_quantity,e.cash_amount,e.share_delta,e.cost_basis_delta,e.arithmetic_invalid
    FROM investment_portfolios p
    JOIN accounts a ON a.account_id=p.rdn_account_id
    LEFT JOIN (
      SELECT t.trade_date AS event_date,t.created_at,'trade' AS event_kind,t.trade_id AS event_id,t.instrument_id,t.trade_type,t.share_quantity,t.cash_amount,0 AS share_delta,0 AS cost_basis_delta,
        CASE WHEN t.share_quantity<>(t.lots*i.lot_size)
          OR t.gross_amount<>(t.share_quantity*t.price_per_share)
          OR (t.trade_type='buy' AND t.cash_amount<>(t.gross_amount+t.fee_amount))
          OR (t.trade_type='sell' AND t.cash_amount<>(t.gross_amount-t.fee_amount)) THEN 1 ELSE 0 END AS arithmetic_invalid
      FROM investment_trades t JOIN investment_instruments i ON i.instrument_id=t.instrument_id
      UNION ALL
      SELECT correction_date,created_at,'correction',correction_id,instrument_id,'',0,0,share_delta,cost_basis_delta,0
      FROM investment_corrections
    ) e ON e.event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM investment_trades t WHERE e.event_kind='trade' AND t.trade_id=e.event_id AND t.portfolio_id=p.portfolio_id
      UNION ALL
      SELECT 1 FROM investment_corrections c WHERE e.event_kind='correction' AND c.correction_id=e.event_id AND c.portfolio_id=p.portfolio_id
    )
    ORDER BY p.portfolio_id,e.event_date,e.created_at,e.event_id`,
  args: [],
});

export const integrityBaseStatements = () => [...INTEGRITY_STATIC_STATEMENTS, accountAllocationIntegrityStatement(), costShareIntegrityStatement(), investmentIntegrityStatement()];

const appendSimpleIntegrityIssues = (issues, rows) => {
  const [fk = [], duplicates = [], invalidTransfer = [], brokenOwnership = [], invalidEnvelopeAssignee = [], linkedCancelled = []] = rows;
  for (const row of fk) issues.push({ code: "FOREIGN_KEY", table: row.table, rowid: row.rowid, parent: row.parent });
  const counts = [
    [duplicates, "DUPLICATE_TRANSACTION_IDEMPOTENCY"],
    [invalidTransfer, "INVALID_TRANSFER"],
    [brokenOwnership, "BROKEN_ACCOUNT_OWNERSHIP"],
    [invalidEnvelopeAssignee, "INVALID_ENVELOPE_ASSIGNEE"],
    [linkedCancelled, "RECURRING_ACTUAL_MISMATCH"],
  ];
  for (const [items, code] of counts) if (items.length) issues.push({ code, count: items.length });
};

const appendPushIntegrityIssues = (issues, rows) => {
  const [ownership = [], inactive = [], terminal = []] = rows;
  const counts = [
    [ownership, "PUSH_DELIVERY_OWNERSHIP_MISMATCH"],
    [inactive, "PUSH_SUBSCRIPTION_INACTIVE_USER"],
    [terminal, "PUSH_QUEUE_TERMINAL_WITH_RETRYABLE_DELIVERY"],
  ];
  for (const [items, code] of counts) {
    const count = Number(items[0]?.count || 0);
    if (count > 0) issues.push({ code, count });
  }
};


const appendConfigIntegrityIssues = (issues, rows) => {
  const config = new Map((rows || []).map((row) => [row.key, row.value]));
  const expected = [
    ["timezone", "Asia/Jakarta", "SYSTEM_TIMEZONE_MISMATCH"],
    ["currency", "IDR", "SYSTEM_CURRENCY_MISMATCH"],
  ];
  for (const [key, expectedValue, code] of expected) {
    const actualValue = config.get(key) ?? null;
    if (actualValue !== expectedValue) issues.push({ code, key, expected: expectedValue, actual: actualValue });
  }
};

const appendReminderIntegrityIssues = (issues, rows) => {
  for (const row of rows || []) {
    const count = Number(row.count || 0);
    if (count > 0) issues.push({ code: row.code, count });
  }
};

const protectedAccountsFromRows = (rows) => {
  const protectedAccounts = new Map();
  for (const row of rows) {
    const accountId = row.protected_account_id;
    if (!accountId) continue;
    if (!protectedAccounts.has(accountId)) protectedAccounts.set(accountId, {
      account: { account_id: accountId, initial_balance: Number(row.protected_initial_balance || 0), initial_balance_date: row.protected_initial_balance_date },
      transactions: [],
    });
    if (row.transaction_id) protectedAccounts.get(accountId).transactions.push({
      transaction_id: row.transaction_id, transaction_date: row.transaction_date, transaction_type: row.transaction_type,
      source_account_id: row.source_account_id, destination_account_id: row.destination_account_id, amount: row.amount,
      investment_account_id: row.investment_account_id, investment_cash_effect: row.investment_cash_effect,
      created_at: row.created_at, status: row.status,
    });
  }
  return protectedAccounts;
};

const appendBalanceIntegrityIssues = (issues, rows) => {
  for (const { account, transactions } of protectedAccountsFromRows(rows).values()) {
    const negative = firstNegativeBalanceFromRows(account, transactions, { fromDate: account.initial_balance_date });
    if (negative) issues.push({ code: "NEGATIVE_BALANCE", accountId: account.account_id, date: negative.date, balance: negative.balance });
  }
};

const appendAllocationIntegrityIssues = (issues, rows) => {
  const [invalidSources = [], mismatchedTransactions = [], mismatchedMovements = [], accountAvailability = []] = rows;
  if (invalidSources.length) issues.push({ code: "INVALID_ENVELOPE_SOURCE_ACCOUNT", count: invalidSources.length });
  if (mismatchedTransactions.length) issues.push({ code: "ENVELOPE_TRANSACTION_SOURCE_MISMATCH", count: mismatchedTransactions.length });
  if (mismatchedMovements.length) issues.push({ code: "ENVELOPE_REALLOCATION_SOURCE_MISMATCH", count: mismatchedMovements.length });
  for (const row of accountAvailability) {
    const balance = Number(row.balance || 0);
    const allocatedRemaining = Math.max(0, Number(row.allocated_remaining || 0));
    if (balance < allocatedRemaining) issues.push({
      code: "ALLOCATED_FUNDS_EXCEED_BALANCE",
      accountId: row.account_id,
      balance,
      allocatedRemaining,
      availableBalance: balance - allocatedRemaining,
    });
  }
};


const parsedCostShareSplits = (row) => {
  try {
    const value = JSON.parse(String(row.cost_share_json || "[]"));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const validCostShareTotals = (splits, amount) => {
  const userIds = new Set();
  let basisTotal = 0;
  let amountTotal = 0;
  for (const split of splits) {
    const userId = String(split?.user_id || "");
    const basisPoints = Number(split?.basis_points);
    const shareAmount = Number(split?.share_amount);
    const valid = userId
      && !userIds.has(userId)
      && Number.isInteger(basisPoints)
      && basisPoints >= 0
      && Number.isInteger(shareAmount)
      && shareAmount >= 0;
    if (!valid) return false;
    userIds.add(userId);
    basisTotal += basisPoints;
    amountTotal += shareAmount;
  }
  return splits.length >= 2 && basisTotal === 10_000 && amountTotal === Number(amount || 0);
};

const costShareIssueForRow = (row) => {
  const mode = String(row.cost_share_mode || "unspecified");
  const splits = parsedCostShareSplits(row);
  if (!splits) return "COST_SHARE_JSON_INVALID";
  const eligible = row.transaction_type === "expense" && row.scope === "shared";
  if (!eligible && (mode !== "unspecified" || splits.length)) return "COST_SHARE_SCOPE_INVALID";
  if (mode === "unspecified") return splits.length ? "COST_SHARE_UNSPECIFIED_WITH_SPLITS" : "";
  return validCostShareTotals(splits, row.amount) ? "" : "COST_SHARE_TOTAL_INVALID";
};

const appendCostShareIntegrityIssues = (issues, rows) => {
  for (const row of rows || []) {
    const code = costShareIssueForRow(row);
    if (code) issues.push({ code, transactionId: row.transaction_id });
  }
};

const appendInvestmentIntegrityIssues = (issues, rows) => {
  const portfolios = new Map();
  let arithmeticMismatchCount = 0;
  for (const row of rows || []) {
    if (!portfolios.has(row.portfolio_id)) portfolios.set(row.portfolio_id, { meta: row, events: [] });
    if (row.event_id) {
      portfolios.get(row.portfolio_id).events.push(row);
      if (Number(row.arithmetic_invalid)) arithmeticMismatchCount += 1;
    }
  }
  if (arithmeticMismatchCount) issues.push({ code: "INVESTMENT_TRADE_ARITHMETIC_MISMATCH", count: arithmeticMismatchCount });
  for (const [portfolioId, { meta, events }] of portfolios) {
    if (meta.account_type !== "investment" || meta.rdn_status !== "active" || Number(meta.allow_negative)) {
      issues.push({ code: "INVESTMENT_RDN_INVALID", portfolioId, accountId: meta.rdn_account_id });
    }
    const beforeStart = events.filter((event) => event.event_date < meta.initial_balance_date);
    if (beforeStart.length) issues.push({ code: "INVESTMENT_EVENT_BEFORE_RDN_START", portfolioId, count: beforeStart.length });
    try { investmentHoldingStateFromEvents(events); }
    catch (error) { issues.push({ code: "INVESTMENT_HOLDING_INTEGRITY", portfolioId, detailCode: error?.code || "INVALID_HISTORY" }); }
  }
};

export const integrityIssuesFromBaseRows = (baseRows) => {
  const issues = [];
  appendSimpleIntegrityIssues(issues, baseRows.slice(0, 6));
  appendPushIntegrityIssues(issues, baseRows.slice(6, 9));
  appendBalanceIntegrityIssues(issues, baseRows[9] || []);
  appendConfigIntegrityIssues(issues, baseRows[10] || []);
  appendReminderIntegrityIssues(issues, baseRows[11] || []);
  appendAllocationIntegrityIssues(issues, baseRows.slice(12, 16));
  appendCostShareIntegrityIssues(issues, baseRows[16] || []);
  appendInvestmentIntegrityIssues(issues, baseRows[17] || []);
  return issues;
};

export const integrityIssues = async (db) => integrityIssuesFromBaseRows(await readBatchRows(db, integrityBaseStatements()));

export const runIntegrity = async (db, context, { audit = true } = {}) => {
  const issues = await integrityIssues(db);
  const timestamp = nowIso();
  const record = { integrity_run_id: uuid(), status: issues.length ? "failed" : "passed", issues_json: canonicalJson(issues), created_by: context.actor.user_id, created_at: timestamp };
  await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", Object.values(record));
  if (audit) await appendAudit(db, context, { entityType: "system", entityId: "integrity", next: { ok: !issues.length, issueCount: issues.length } });
  return { ok: !issues.length, checkedAt: timestamp, issues };
};
