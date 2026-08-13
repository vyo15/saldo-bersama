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
];

export const integrityIssuesFromBaseRows = (baseRows) => {
  const issues = [];
  const [
    fk = [],
    duplicates = [],
    invalidTransfer = [],
    brokenOwnership = [],
    invalidEnvelopeAssignee = [],
    linkedCancelled = [],
    pushOwnershipMismatchRows = [],
    inactiveUserSubscriptionRows = [],
    terminalQueueWithRetryableDeliveryRows = [],
    protectedAccountLedgerRows = [],
  ] = baseRows;

  for (const row of fk) issues.push({ code: "FOREIGN_KEY", table: row.table, rowid: row.rowid, parent: row.parent });
  if (duplicates.length) issues.push({ code: "DUPLICATE_TRANSACTION_IDEMPOTENCY", count: duplicates.length });
  if (invalidTransfer.length) issues.push({ code: "INVALID_TRANSFER", count: invalidTransfer.length });
  if (brokenOwnership.length) issues.push({ code: "BROKEN_ACCOUNT_OWNERSHIP", count: brokenOwnership.length });
  if (invalidEnvelopeAssignee.length) issues.push({ code: "INVALID_ENVELOPE_ASSIGNEE", count: invalidEnvelopeAssignee.length });
  if (linkedCancelled.length) issues.push({ code: "RECURRING_ACTUAL_MISMATCH", count: linkedCancelled.length });

  const pushOwnershipMismatchCount = Number(pushOwnershipMismatchRows[0]?.count || 0);
  if (pushOwnershipMismatchCount > 0) issues.push({ code: "PUSH_DELIVERY_OWNERSHIP_MISMATCH", count: pushOwnershipMismatchCount });
  const inactiveUserSubscriptionCount = Number(inactiveUserSubscriptionRows[0]?.count || 0);
  if (inactiveUserSubscriptionCount > 0) issues.push({ code: "PUSH_SUBSCRIPTION_INACTIVE_USER", count: inactiveUserSubscriptionCount });
  const terminalQueueWithRetryableDeliveryCount = Number(terminalQueueWithRetryableDeliveryRows[0]?.count || 0);
  if (terminalQueueWithRetryableDeliveryCount > 0) issues.push({ code: "PUSH_QUEUE_TERMINAL_WITH_RETRYABLE_DELIVERY", count: terminalQueueWithRetryableDeliveryCount });

  const protectedAccounts = new Map();
  for (const row of protectedAccountLedgerRows) {
    const accountId = row.protected_account_id;
    if (!accountId) continue;
    if (!protectedAccounts.has(accountId)) {
      protectedAccounts.set(accountId, {
        account: {
          account_id: accountId,
          initial_balance: Number(row.protected_initial_balance || 0),
          initial_balance_date: row.protected_initial_balance_date,
        },
        transactions: [],
      });
    }
    if (row.transaction_id) {
      protectedAccounts.get(accountId).transactions.push({
        transaction_id: row.transaction_id,
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        source_account_id: row.source_account_id,
        destination_account_id: row.destination_account_id,
        amount: row.amount,
        created_at: row.created_at,
        status: row.status,
      });
    }
  }
  for (const { account, transactions } of protectedAccounts.values()) {
    const negative = firstNegativeBalanceFromRows(account, transactions, { fromDate: account.initial_balance_date });
    if (negative) issues.push({ code: "NEGATIVE_BALANCE", accountId: account.account_id, date: negative.date, balance: negative.balance });
  }
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
