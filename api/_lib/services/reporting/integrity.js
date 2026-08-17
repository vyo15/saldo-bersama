import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { firstNegativeBalanceFromRows } from "../readModels.js";
import { canonicalJson, nowIso, uuid } from "../core.js";

export const integrityBaseStatements = () => [
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
      t.transaction_id,t.transaction_date,t.transaction_type,t.source_account_id,t.destination_account_id,t.amount,t.created_at,t.status
    FROM accounts a
    LEFT JOIN transactions t ON t.status='active'
      AND t.transaction_date>=a.initial_balance_date
      AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
    WHERE a.allow_negative=0
    ORDER BY a.account_id,t.transaction_date,t.created_at,t.transaction_id`, args: [] },
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
];

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

export const integrityIssuesFromBaseRows = (baseRows) => {
  const issues = [];
  appendSimpleIntegrityIssues(issues, baseRows.slice(0, 6));
  appendPushIntegrityIssues(issues, baseRows.slice(6, 9));
  appendBalanceIntegrityIssues(issues, baseRows[9] || []);
  appendConfigIntegrityIssues(issues, baseRows[10] || []);
  appendReminderIntegrityIssues(issues, baseRows[11] || []);
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
