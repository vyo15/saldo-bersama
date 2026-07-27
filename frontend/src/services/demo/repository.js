import { calculateAccountBalance, calculateCashFlow, calculateEnvelopeUsage, calculateSafeToSpend } from "../../domain/finance.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { validateTransactionInput } from "../../domain/validation.js";

const STORAGE_KEY = "saldo-bersama.demo.v2";
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => today().slice(0, 7);
const clone = (value) => structuredClone(value);
const uuid = () => crypto.randomUUID();
const endOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
};

const seed = () => ({
  user: { userId: "demo-owner", email: "demo@saldo-bersama.local", name: "Demo Owner", role: "owner" },
  users: [{ user_id: "demo-owner-user", email: "demo@saldo-bersama.local", name: "Demo Owner", role: "owner", status: "active", row_version: 1, is_current: true }],
  accounts: [
    { account_id: "acc-bank", name: "Rekening Bersama", account_type: "bank", owner_scope: "shared", initial_balance: 6_000_000, status: "active", row_version: 1 },
    { account_id: "acc-cash", name: "Dompet Tunai", account_type: "cash", owner_scope: "shared", initial_balance: 500_000, status: "active", row_version: 1 },
    { account_id: "acc-emergency", name: "Dana Darurat", account_type: "emergency_fund", owner_scope: "shared", initial_balance: 4_000_000, status: "active", row_version: 1 },
  ],
  categories: [
    { category_id: "cat-salary", name: "Gaji", transaction_type: "income", nature: "fixed", status: "active", row_version: 1 },
    { category_id: "cat-food", name: "Makanan", transaction_type: "expense", nature: "variable", status: "active", row_version: 1 },
    { category_id: "cat-transport", name: "Transportasi", transaction_type: "expense", nature: "variable", status: "active", row_version: 1 },
    { category_id: "cat-bills", name: "Tagihan Rumah", transaction_type: "expense", nature: "fixed", status: "active", row_version: 1 },
    { category_id: "cat-other", name: "Lain-lain", transaction_type: "expense", nature: "unexpected", status: "active", row_version: 1 },
  ],
  transactions: [
    { transaction_id: "trx-income", transaction_date: `${monthKey()}-01`, transaction_type: "income", destination_account_id: "acc-bank", category_id: "cat-salary", amount: 6_000_000, description: "Gaji bulan berjalan", scope: "shared", status: "active", row_version: 1, created_at: nowIso() },
    { transaction_id: "trx-food", transaction_date: today(), transaction_type: "expense", source_account_id: "acc-bank", category_id: "cat-food", envelope_period_id: "env-food-current", amount: 125_000, description: "Belanja kebutuhan makan", scope: "shared", status: "active", row_version: 1, created_at: nowIso() },
    { transaction_id: "trx-bill", transaction_date: today(), transaction_type: "expense", source_account_id: "acc-bank", category_id: "cat-bills", amount: 350_000, description: "Internet rumah", scope: "shared", status: "active", row_version: 1, created_at: nowIso() },
  ],
  envelopeRules: [
    { envelope_rule_id: "env-food", name: "Makan Bulanan", period_type: "monthly", default_amount: 1_500_000, status: "active" },
    { envelope_rule_id: "env-transport", name: "Transportasi", period_type: "monthly", default_amount: 600_000, status: "active" },
    { envelope_rule_id: "env-buffer", name: "Buffer Bulanan", period_type: "monthly", default_amount: 400_000, status: "active" },
  ],
  envelopes: [
    { envelope_period_id: "env-food-current", envelope_rule_id: "env-food", name: "Makan Bulanan", period_start: `${monthKey()}-01`, period_end: endOfMonth(), allocated_amount: 1_500_000, reserved_amount: 0, status: "active", row_version: 1 },
    { envelope_period_id: "env-transport-current", envelope_rule_id: "env-transport", name: "Transportasi", period_start: `${monthKey()}-01`, period_end: endOfMonth(), allocated_amount: 600_000, reserved_amount: 50_000, status: "active", row_version: 1 },
    { envelope_period_id: "env-buffer-current", envelope_rule_id: "env-buffer", name: "Buffer Bulanan", period_start: `${monthKey()}-01`, period_end: endOfMonth(), allocated_amount: 400_000, reserved_amount: 0, status: "active", row_version: 1 },
  ],
  recurring: [
    { occurrence_id: "occ-internet", recurring_rule_id: "rule-internet", name: "Internet Rumah", kind: "expense", default_account_id: "acc-bank", category_id: "cat-bills", due_date: `${monthKey()}-20`, expected_amount: 350_000, actual_amount: 350_000, status: "paid", row_version: 1 },
    { occurrence_id: "occ-electric", recurring_rule_id: "rule-electric", name: "Listrik", kind: "expense", default_account_id: "acc-bank", category_id: "cat-bills", due_date: `${monthKey()}-25`, expected_amount: 500_000, actual_amount: 0, status: "scheduled", row_version: 1 },
    { occurrence_id: "occ-salary", recurring_rule_id: "rule-salary", name: "Gaji", kind: "income", default_account_id: "acc-bank", category_id: "cat-salary", due_date: `${monthKey()}-01`, expected_amount: 6_000_000, actual_amount: 6_000_000, status: "received", row_version: 1 },
  ],
  goals: [
    { goal_id: "goal-emergency", name: "Dana Darurat", goal_type: "emergency_fund", target_amount: 18_000_000, current_amount: 4_000_000, account_id: "acc-emergency", target_date: "2027-12-31", status: "active", row_version: 1 },
    { goal_id: "goal-home", name: "Perlengkapan Rumah", goal_type: "savings", target_amount: 5_000_000, current_amount: 1_250_000, account_id: "acc-bank", target_date: "2027-06-30", status: "active", row_version: 1 },
  ],
  budgets: [
    { budget_id: "budget-food", period_key: monthKey(), category_id: "cat-food", name: "Makanan", amount: 1_500_000, warning_threshold: 80, status: "active", row_version: 1 },
    { budget_id: "budget-transport", period_key: monthKey(), category_id: "cat-transport", name: "Transportasi", amount: 600_000, warning_threshold: 80, status: "active", row_version: 1 },
  ],
  pendingImport: null,
  periodClosures: [],
  reconciliations: [],
  idempotency: {},
  audit: [],
});

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || seed(); }
  catch { return seed(); }
};
const save = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const wait = (value) => new Promise((resolve) => window.setTimeout(() => resolve(clone(value)), 80));
const audit = (state, action, entityType, entityId) => state.audit.unshift({ timestamp: nowIso(), action, entity_type: entityType, entity_id: entityId });

const commit = (state, action, options, result) => {
  if (options.idempotencyKey) state.idempotency[options.idempotencyKey] = { action, result };
  save(state);
  return wait(result);
};

const overview = (state) => {
  const accounts = state.accounts.map((account) => ({ ...account, balance: calculateAccountBalance(account, state.transactions) }));
  const cashFlow = calculateCashFlow(state.transactions);
  const envelopes = state.envelopes.map((item) => calculateEnvelopeUsage(item, state.transactions));
  const reservedBills = state.recurring.filter((item) => item.kind === "expense" && !["paid", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)), 0);
  const allocatedRemaining = envelopes.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_amount || 0)), 0);
  const allocatableBalance = accounts.filter((item) => !["emergency_fund", "savings", "sinking_fund"].includes(item.account_type)).reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
  const safeToSpend = calculateSafeToSpend({ accountBalances: accounts.filter((item) => !["emergency_fund", "savings", "sinking_fund"].includes(item.account_type)), reservedBills, emergencyFund: 0 });
  const current = new Date();
  const daysRemaining = Math.max(1, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate() - current.getDate() + 1);
  return {
    periodKey: monthKey(), accountBalances: accounts,
    totalBalance: accounts.reduce((sum, item) => sum + item.balance, 0),
    liquidBalance: accounts.filter((item) => !["emergency_fund", "savings", "sinking_fund"].includes(item.account_type)).reduce((sum, item) => sum + item.balance, 0),
    emergencyBalance: accounts.filter((item) => item.account_type === "emergency_fund").reduce((sum, item) => sum + item.balance, 0),
    safeToSpend, dailySafeToSpend: Math.floor(safeToSpend / daysRemaining), daysRemaining,
    cashFlow: { ...cashFlow, net: cashFlow.income + cashFlow.refund - cashFlow.expense },
    envelopes, recurring: state.recurring, goals: state.goals,
    recentTransactions: [...state.transactions].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8),
    unallocatedCount: state.transactions.filter((item) => item.transaction_type === "expense" && !item.envelope_period_id && item.status === "active").length,
    unallocatedFunds: Math.max(0, allocatableBalance - allocatedRemaining), allocatedRemaining,
    reservedBills, lastSyncedAt: nowIso(),
  };
};

const budgetItems = (state, period = monthKey()) => state.budgets.filter((item) => item.period_key === period && item.status === "active").map((item) => ({
  ...item,
  used_amount: state.transactions.filter((transaction) => transaction.status === "active" && transaction.transaction_type === "expense" && transaction.category_id === item.category_id && transaction.transaction_date.startsWith(period)).reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
}));

export const demoRepository = {
  session: () => wait(load().user),
  logout: () => wait({ loggedOut: true }),
  async request(action, payload = {}, options = {}) {
    const state = load();
    const previous = options.idempotencyKey && state.idempotency[options.idempotencyKey];
    if (previous) {
      if (previous.action !== action) throw Object.assign(new Error("Idempotency key sudah dipakai untuk operasi berbeda."), { code: "IDEMPOTENCY_MISMATCH" });
      return wait(previous.result);
    }

    switch (action) {
      case "system.initialize": return wait({ initialized: true, schemaVersion: "1" });
      case "system.health": return wait({ status: "ok", schemaVersion: "1" });
      case "bootstrap.get": return wait({ user: state.user, accounts: state.accounts, categories: state.categories, config: { schemaVersion: "1", timezone: "Asia/Jakarta", currency: "IDR", maintenanceMode: false } });
      case "users.list": return wait({ items: state.users });
      case "users.upsert": {
        let member = state.users.find((item) => item.email === String(payload.email || "").toLowerCase());
        if (member) { member.name = payload.name || member.name; member.role = payload.role === "owner" ? "owner" : "member"; member.status = "active"; member.row_version += 1; }
        else { member = { user_id: uuid(), email: String(payload.email || "").toLowerCase(), name: payload.name || payload.email, role: payload.role === "owner" ? "owner" : "member", status: "active", row_version: 1, is_current: false }; state.users.push(member); }
        audit(state, action, "user", member.user_id); return commit(state, action, options, member);
      }
      case "users.deactivate": {
        const member = state.users.find((item) => item.user_id === payload.user_id);
        if (!member || member.is_current) throw new Error("Anggota tidak dapat dinonaktifkan.");
        member.status = "inactive"; member.row_version += 1; audit(state, action, "user", member.user_id); return commit(state, action, options, member);
      }
      case "audit.list": return wait({ items: state.audit.map((entry, index) => ({ audit_id: `${index}-${entry.timestamp}`, actor_email: state.user.email, result: "success", ...entry })) });
      case "dashboard.overview": return wait(overview(state));
      case "accounts.list": return wait({ items: state.accounts.map((account) => ({ ...account, balance: calculateAccountBalance(account, state.transactions) })) });
      case "accounts.create": {
        const account = { account_id: uuid(), ...payload, initial_balance: Number(payload.initial_balance || 0), allow_negative: false, status: "active", row_version: 1 };
        state.accounts.push(account); audit(state, action, "account", account.account_id);
        return commit(state, action, options, account);
      }
      case "categories.list": return wait({ items: state.categories });
      case "categories.create": {
        const category = { category_id: uuid(), ...payload, status: "active", row_version: 1 };
        state.categories.push(category); audit(state, action, "category", category.category_id);
        return commit(state, action, options, category);
      }
      case "transactions.list": return wait({ items: [...state.transactions].reverse(), total: state.transactions.length });
      case "transactions.create": {
        const validation = validateTransactionInput(payload);
        if (!validation.ok) throw Object.assign(new Error("Data transaksi belum valid."), { details: validation.errors });
        const duplicate = state.transactions.find((item) => item.status === "active" && item.transaction_date === validation.value.transaction_date && item.transaction_type === validation.value.transaction_type && Number(item.amount) === validation.value.amount && item.source_account_id === validation.value.source_account_id && item.destination_account_id === validation.value.destination_account_id && String(item.description || "").toLowerCase() === String(validation.value.description || "").toLowerCase());
        if (duplicate && !payload.confirm_duplicate) throw Object.assign(new Error("Transaksi mirip sudah tercatat. Konfirmasi diperlukan."), { code: "POSSIBLE_DUPLICATE", details: { transactionId: duplicate.transaction_id } });
        const transaction = { ...validation.value, transaction_id: uuid(), status: "active", row_version: 1, idempotency_key: options.idempotencyKey || createIdempotencyKey(), created_by: state.user.userId, created_at: nowIso() };
        state.transactions.push(transaction); audit(state, action, "transaction", transaction.transaction_id);
        return commit(state, action, options, transaction);
      }
      case "transactions.update": {
        const transaction = state.transactions.find((item) => item.transaction_id === payload.transaction_id);
        if (!transaction) throw new Error("Transaksi tidak ditemukan.");
        if (transaction.row_version !== payload.row_version) throw Object.assign(new Error("Transaksi telah berubah di perangkat lain."), { code: "CONFLICT" });
        const validation = validateTransactionInput(payload);
        if (!validation.ok) throw Object.assign(new Error("Data transaksi belum valid."), { details: validation.errors });
        Object.assign(transaction, validation.value, { transaction_id: transaction.transaction_id, status: "active", row_version: transaction.row_version + 1, updated_at: nowIso() });
        audit(state, action, "transaction", transaction.transaction_id); return commit(state, action, options, transaction);
      }
      case "transactions.cancel": {
        const transaction = state.transactions.find((item) => item.transaction_id === (payload.transactionId || payload.transaction_id));
        if (!transaction) throw new Error("Transaksi tidak ditemukan.");
        if (transaction.row_version !== (payload.rowVersion || payload.row_version)) throw Object.assign(new Error("Transaksi telah berubah di perangkat lain."), { code: "CONFLICT" });
        transaction.status = "cancelled"; transaction.cancellation_reason = payload.reason; transaction.cancelled_at = nowIso(); transaction.row_version += 1;
        audit(state, action, "transaction", transaction.transaction_id);
        return commit(state, action, options, transaction);
      }
      case "envelopes.list": return wait({ items: state.envelopes.map((item) => calculateEnvelopeUsage(item, state.transactions)) });
      case "envelopes.createRule": {
        const rule = { envelope_rule_id: uuid(), ...payload, status: "active", row_version: 1 };
        state.envelopeRules.push(rule); audit(state, action, "envelope_rule", rule.envelope_rule_id);
        return commit(state, action, options, rule);
      }
      case "envelopes.createPeriod": {
        const rule = state.envelopeRules.find((item) => item.envelope_rule_id === payload.envelope_rule_id);
        if (!rule) throw new Error("Aturan kantong tidak ditemukan.");
        if (state.envelopes.some((item) => item.envelope_rule_id === rule.envelope_rule_id && item.period_start === payload.period_start && item.period_end === payload.period_end)) throw Object.assign(new Error("Periode kantong sudah dibuat."), { code: "DUPLICATE_PERIOD" });
        const period = { envelope_period_id: uuid(), envelope_rule_id: rule.envelope_rule_id, name: rule.name, period_start: payload.period_start, period_end: payload.period_end, allocated_amount: Number(payload.allocated_amount || rule.default_amount), reserved_amount: Number(payload.reserved_amount || 0), status: "active", row_version: 1 };
        state.envelopes.push(period); audit(state, action, "envelope_period", period.envelope_period_id);
        return commit(state, action, options, calculateEnvelopeUsage(period, state.transactions));
      }
      case "envelopes.move": {
        const from = state.envelopes.find((item) => item.envelope_period_id === payload.fromEnvelopePeriodId);
        const to = state.envelopes.find((item) => item.envelope_period_id === payload.toEnvelopePeriodId);
        const amount = Number(payload.amount);
        if (!from || !to || amount <= 0) throw new Error("Mutasi alokasi tidak valid.");
        const available = calculateEnvelopeUsage(from, state.transactions).remaining_amount;
        if (amount > available) throw new Error("Nominal melebihi sisa kantong sumber.");
        from.allocated_amount -= amount; to.allocated_amount += amount; from.row_version += 1; to.row_version += 1;
        audit(state, action, "envelope", `${from.envelope_period_id}->${to.envelope_period_id}`);
        return commit(state, action, options, { from: calculateEnvelopeUsage(from, state.transactions), to: calculateEnvelopeUsage(to, state.transactions) });
      }
      case "recurring.list": return wait({ items: state.recurring });
      case "recurring.createRule": {
        const occurrence = { occurrence_id: uuid(), recurring_rule_id: uuid(), name: payload.name, kind: payload.kind, category_id: payload.category_id, default_account_id: payload.default_account_id, due_date: `${monthKey()}-${String(Math.min(28, Number(payload.due_day || 1))).padStart(2, "0")}`, expected_amount: Number(payload.expected_amount), actual_amount: 0, status: payload.kind === "income" ? "expected" : "scheduled", row_version: 1, frequency: payload.frequency };
        state.recurring.push(occurrence); audit(state, action, "recurring_rule", occurrence.recurring_rule_id);
        return commit(state, action, options, occurrence);
      }
      case "recurring.payOccurrence": {
        const occurrence = state.recurring.find((item) => item.occurrence_id === payload.occurrence_id);
        if (!occurrence) throw new Error("Jadwal tidak ditemukan.");
        if (occurrence.row_version !== payload.row_version) throw Object.assign(new Error("Jadwal telah berubah."), { code: "CONFLICT" });
        const amount = Number(payload.amount || occurrence.expected_amount);
        const transaction = { transaction_id: uuid(), transaction_date: payload.transaction_date || today(), transaction_type: occurrence.kind === "income" ? "income" : "expense", source_account_id: occurrence.kind === "expense" ? payload.account_id : "", destination_account_id: occurrence.kind === "income" ? payload.account_id : "", category_id: occurrence.category_id, amount, description: occurrence.name, status: "active", row_version: 1, created_at: nowIso() };
        state.transactions.push(transaction); occurrence.actual_amount += amount; occurrence.status = occurrence.actual_amount >= occurrence.expected_amount ? (occurrence.kind === "income" ? "received" : "paid") : "partial"; occurrence.row_version += 1;
        audit(state, action, "recurring_occurrence", occurrence.occurrence_id);
        return commit(state, action, options, { occurrence, transaction });
      }
      case "goals.list": return wait({ items: state.goals });
      case "goals.create": {
        const goal = { goal_id: uuid(), ...payload, current_amount: 0, status: "active", row_version: 1 };
        state.goals.push(goal); audit(state, action, "goal", goal.goal_id);
        return commit(state, action, options, goal);
      }
      case "goals.move": {
        const goal = state.goals.find((item) => item.goal_id === payload.goal_id);
        if (!goal) throw new Error("Target tidak ditemukan.");
        const amount = Number(payload.amount);
        if (payload.movement_type === "withdraw" && amount > goal.current_amount) throw new Error("Penarikan melebihi saldo target.");
        goal.current_amount += payload.movement_type === "withdraw" ? -amount : amount; goal.row_version += 1;
        const transaction = { transaction_id: uuid(), transaction_date: payload.transaction_date || today(), transaction_type: "transfer", source_account_id: payload.source_account_id, destination_account_id: payload.destination_account_id, amount, description: goal.name, goal_id: goal.goal_id, status: "active", row_version: 1, created_at: nowIso() };
        state.transactions.push(transaction); audit(state, action, "goal_movement", goal.goal_id);
        return commit(state, action, options, { goal, transaction });
      }
      case "budgets.list": return wait({ items: budgetItems(state, payload.period) });
      case "budgets.upsert": {
        let budget = state.budgets.find((item) => item.period_key === payload.period_key && item.category_id === payload.category_id);
        const category = state.categories.find((item) => item.category_id === payload.category_id);
        if (budget) { budget.amount = Number(payload.amount); budget.warning_threshold = Number(payload.warning_threshold || 80); budget.row_version += 1; }
        else { budget = { budget_id: uuid(), period_key: payload.period_key, category_id: payload.category_id, name: category?.name || "Budget", amount: Number(payload.amount), warning_threshold: Number(payload.warning_threshold || 80), status: "active", row_version: 1 }; state.budgets.push(budget); }
        audit(state, action, "budget", budget.budget_id);
        return commit(state, action, options, budget);
      }
      case "reconciliations.create": {
        const account = state.accounts.find((item) => item.account_id === payload.account_id);
        if (!account) throw new Error("Rekening tidak ditemukan.");
        const systemBalance = calculateAccountBalance(account, state.transactions);
        const reconciliation = { reconciliation_id: uuid(), account_id: account.account_id, reconciled_at: nowIso(), system_balance: systemBalance, actual_balance: Number(payload.actual_balance), difference: Number(payload.actual_balance) - systemBalance, notes: payload.notes || "", status: Number(payload.actual_balance) === systemBalance ? "matched" : "difference" };
        state.reconciliations.push(reconciliation); audit(state, action, "reconciliation", reconciliation.reconciliation_id); return commit(state, action, options, reconciliation);
      }
      case "periods.close": {
        if (state.periodClosures.some((item) => item.period_key === payload.period_key && item.status === "closed")) throw new Error("Periode sudah ditutup.");
        const unallocated = state.transactions.filter((item) => item.status === "active" && item.transaction_type === "expense" && !item.envelope_period_id && item.transaction_date.startsWith(payload.period_key));
        if (unallocated.length) throw Object.assign(new Error("Masih ada pengeluaran belum dialokasikan."), { code: "PERIOD_INTEGRITY_FAILED" });
        const closure = { closure_id: uuid(), period_key: payload.period_key, reason: payload.reason, status: "closed", row_version: 1, closed_at: nowIso() };
        state.periodClosures.push(closure); audit(state, action, "period_closure", closure.closure_id); return commit(state, action, options, closure);
      }
      case "reports.monthly": {
        const categoryMap = {};
        state.transactions.filter((item) => item.status === "active" && item.transaction_type === "expense").forEach((item) => {
          const name = state.categories.find((category) => category.category_id === item.category_id)?.name || "Belum dikategorikan";
          categoryMap[name] = Number(categoryMap[name] || 0) + Number(item.amount || 0);
        });
        return wait({ overview: overview(state), budgets: budgetItems(state, payload.period), categoryExpenses: Object.entries(categoryMap).map(([name, amount]) => ({ name, amount })) });
      }
      case "integrity.run": return wait({ ok: true, checkedAt: nowIso(), issues: [] });
      case "calendar.sync": return wait({ synced: state.recurring.length, calendarId: "demo-calendar" });
      case "backup.create": return wait({ fileName: `saldo-bersama-demo-${Date.now()}.json`, createdAt: nowIso(), verified: true });
      case "export.create": return wait({ fileName: `saldo-bersama-demo.${payload.format || "json"}`, format: payload.format || "json", createdAt: nowIso() });
      case "import.preview": {
        const records = Array.isArray(payload.records) ? payload.records : [];
        const token = uuid(); state.pendingImport = { token, records }; save(state);
        return wait({ previewToken: token, validCount: records.length, invalid: [], duplicates: [], expiresInSeconds: 600 });
      }
      case "import.apply": {
        if (!state.pendingImport || state.pendingImport.token !== payload.previewToken) throw new Error("Preview import tidak ditemukan.");
        state.pendingImport.records.forEach((record) => state.transactions.push({ ...record, transaction_id: uuid(), status: "active", row_version: 1, created_at: nowIso() }));
        const imported = state.pendingImport.records.length; state.pendingImport = null; audit(state, action, "import", String(imported));
        return commit(state, action, options, { imported, verifiedAt: nowIso(), safetyBackup: { verified: true } });
      }
      case "restore.preview": return wait({ backupFileId: payload.backupFileId, schemaVersion: "1", summary: {}, previewToken: uuid(), expiresInSeconds: 600 });
      case "restore.apply": {
        if (payload.confirmation !== "RESTORE SALDO BERSAMA") throw new Error("Konfirmasi restore tidak sesuai.");
        const fresh = seed(); save(fresh);
        return wait({ restored: true, sourceFileId: payload.backupFileId, verifiedAt: nowIso(), safetyBackup: { verified: true } });
      }
      case "notifications.register": return wait({ registered: true });
      case "notifications.unregister": return wait({ unregistered: true });
      default: throw Object.assign(new Error(`Action demo belum tersedia: ${action}`), { code: "NOT_IMPLEMENTED" });
    }
  },
};
