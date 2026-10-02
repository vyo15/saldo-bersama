import { accountBalanceAsOf } from "../readModels.js";
import { addDays, appError, operableAccountSql, todayJakarta } from "../core.js";

const MAX_LOOKBACK_DAYS = 90;
const RECENT_FALLBACK_DAYS = 31;

const isoDate = (value) => String(value || "").slice(0, 10);
const absolute = (value) => Math.abs(Number(value || 0));

const signedTransactionImpact = (row, accountId) => {
  const amount = Number(row.amount || 0);
  if (!Number.isSafeInteger(amount)) return 0;
  if (row.transaction_type === "expense" && row.source_account_id === accountId) return -amount;
  if (["income", "refund"].includes(row.transaction_type) && row.destination_account_id === accountId) return amount;
  if (row.transaction_type === "transfer") {
    if (row.source_account_id === accountId) return -amount;
    if (row.destination_account_id === accountId) return amount;
  }
  if (row.transaction_type === "adjustment" && row.source_account_id === accountId) return amount;
  return 0;
};

const improvementFor = (difference, impact, mode = "add") => {
  const current = absolute(difference);
  const nextDifference = mode === "remove" ? difference + impact : difference - impact;
  const next = absolute(nextDifference);
  return { current, next, nextDifference, improvement: current - next };
};

const confidenceFor = ({ next, current, exactPreferred = true }) => {
  if (next === 0 && exactPreferred) return "strong";
  if (current > 0 && next <= Math.floor(current * 0.35)) return "strong";
  if (current > 0 && next <= Math.floor(current * 0.7)) return "possible";
  return "weak";
};

const recurringCandidates = (rows, difference) => rows.flatMap((row) => {
  const remaining = Math.max(0, Number(row.expected_amount || 0) - Number(row.actual_amount || 0));
  if (!remaining) return [];
  const impact = row.kind === "expense" ? -remaining : remaining;
  const fit = improvementFor(difference, impact, "add");
  if (fit.improvement <= 0) return [];
  return [{
    candidate_id: `recurring:${row.occurrence_id}`,
    kind: "recurring",
    confidence: confidenceFor(fit),
    score: fit.next === 0 ? 100 : Math.max(60, Math.round((fit.improvement / fit.current) * 90)),
    title: row.rule_name || "Jadwal rutin",
    detail: `Jatuh tempo ${row.due_date}`,
    amount: remaining,
    impact,
    occurrence_id: row.occurrence_id,
    recurring_rule_id: row.recurring_rule_id,
    period: row.period_key,
    reasons: [
      fit.next === 0 ? "Nominalnya tepat menjelaskan selisih." : "Nominalnya mengurangi sebagian besar selisih.",
      "Pembayaran ini belum tercatat penuh.",
    ],
  }];
});

const duplicateKey = (row) => [
  row.transaction_type,
  row.transaction_date,
  row.amount,
  row.category_id || "",
  row.source_account_id || "",
  row.destination_account_id || "",
  String(row.description || "").trim().toLowerCase(),
].join("|");

const duplicateCandidates = (rows, accountId, difference) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = duplicateKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].flatMap((group) => {
    if (group.length < 2) return [];
    const representative = group[0];
    const impact = signedTransactionImpact(representative, accountId);
    if (!impact) return [];
    const fit = improvementFor(difference, impact, "remove");
    if (fit.improvement <= 0) return [];
    return [{
      candidate_id: `duplicate:${representative.transaction_id}`,
      kind: "duplicate",
      confidence: fit.next === 0 ? "possible" : "weak",
      score: fit.next === 0 ? 82 : 55,
      title: representative.description || "Transaksi serupa",
      detail: `${group.length} transaksi sangat mirip pada ${representative.transaction_date}`,
      amount: Number(representative.amount || 0),
      impact,
      transaction_id: representative.transaction_id,
      transaction_ids: group.map((row) => row.transaction_id),
      reasons: [
        "Ada lebih dari satu transaksi dengan tanggal, nominal, rekening, dan detail yang sama.",
        fit.next === 0 ? "Menghapus satu duplikat akan menutup selisih secara matematis." : "Satu duplikat dapat mengurangi selisih.",
      ],
    }];
  });
};

const recentReviewCandidates = (rows, accountId, difference) => rows.flatMap((row) => {
  const impact = signedTransactionImpact(row, accountId);
  if (!impact || absolute(impact) !== absolute(difference)) return [];
  const fit = improvementFor(difference, impact, "remove");
  if (fit.improvement <= 0) return [];
  return [{
    candidate_id: `recent:${row.transaction_id}`,
    kind: row.transaction_type === "transfer" ? "transfer" : "recent_transaction",
    confidence: "weak",
    score: 40,
    title: row.description || (row.transaction_type === "transfer" ? "Transfer terbaru" : "Transaksi terbaru"),
    detail: `${row.transaction_date} · nominal sama dengan selisih`,
    amount: Number(row.amount || 0),
    impact,
    transaction_id: row.transaction_id,
    reasons: ["Nominal transaksi ini sama dengan selisih.", "Periksa hanya bila detail pada rekening nyata memang berbeda."],
  }];
});

const boundedWindowStart = (referenceDate, previousDate) => {
  const oldest = addDays(referenceDate, -MAX_LOOKBACK_DAYS);
  const fallback = addDays(referenceDate, -RECENT_FALLBACK_DAYS);
  if (!previousDate) return fallback;
  const previous = isoDate(previousDate);
  return previous < oldest ? oldest : previous;
};

export const diagnoseReconciliation = async (db, context) => {
  const reconciliationId = String(context.payload?.reconciliation_id || "");
  if (!reconciliationId) throw appError("RECONCILIATION_REQUIRED", "Hasil pemeriksaan saldo wajib dipilih.", 400);
  const access = operableAccountSql(context.actor, "a");
  const reconciliation = await db.one(`SELECT r.*,
      a.initial_balance,a.initial_balance_date,a.allow_negative,a.account_type,a.status AS account_status
    FROM reconciliations r
    JOIN accounts a ON a.account_id=r.account_id
    WHERE r.reconciliation_id=? AND a.status='active' AND a.account_type<>'investment' AND ${access.sql}`, [reconciliationId, ...access.args]);
  if (!reconciliation) throw appError("RECONCILIATION_NOT_FOUND", "Hasil pemeriksaan tidak ditemukan atau rekening tidak dapat dioperasikan.", 404);

  const referenceDate = todayJakarta();
  const currentSystemBalance = await accountBalanceAsOf(db, reconciliation, referenceDate);
  const actualBalance = Number(reconciliation.actual_balance || 0);
  const difference = actualBalance - currentSystemBalance;
  const previous = await db.one(`SELECT reconciled_at FROM reconciliations
    WHERE account_id=? AND reconciliation_id<>? AND reconciled_at<?
    ORDER BY reconciled_at DESC LIMIT 1`, [reconciliation.account_id, reconciliationId, reconciliation.reconciled_at]);
  const windowStart = boundedWindowStart(referenceDate, previous?.reconciled_at);

  const [recurringRows, transactionRows] = await Promise.all([
    db.all(`SELECT o.occurrence_id,o.recurring_rule_id,o.period_key,o.due_date,o.expected_amount,o.actual_amount,o.status,
      r.name AS rule_name,r.kind
      FROM recurring_occurrences o
      JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
      WHERE r.default_account_id=? AND r.status='active'
        AND o.status IN ('expected','overdue','partial')
        AND o.actual_amount<o.expected_amount
        AND o.due_date BETWEEN ? AND ?
      ORDER BY o.due_date ASC`, [reconciliation.account_id, windowStart, referenceDate]),
    db.all(`SELECT transaction_id,transaction_type,transaction_date,amount,category_id,source_account_id,destination_account_id,description
      FROM transactions
      WHERE status='active' AND transaction_date BETWEEN ? AND ?
        AND (source_account_id=? OR destination_account_id=?)
      ORDER BY transaction_date DESC,created_at DESC LIMIT 120`, [windowStart, referenceDate, reconciliation.account_id, reconciliation.account_id]),
  ]);

  const candidates = [
    ...recurringCandidates(recurringRows, difference),
    ...duplicateCandidates(transactionRows, reconciliation.account_id, difference),
    ...recentReviewCandidates(transactionRows, reconciliation.account_id, difference),
  ]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "id"))
    .slice(0, 4)
    .map(({ score: _score, ...candidate }) => candidate);

  return {
    reconciliation_id: reconciliationId,
    account_id: reconciliation.account_id,
    actual_balance: actualBalance,
    system_balance: currentSystemBalance,
    difference,
    resolved: difference === 0,
    window_start: windowStart,
    candidates,
    signals: {
      unpaid_recurring: recurringRows.length,
      recent_transactions: transactionRows.length,
      recent_transfers: transactionRows.filter((row) => row.transaction_type === "transfer").length,
    },
  };
};
