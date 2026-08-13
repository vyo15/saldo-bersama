const periodKey = "2026-08";

export const ownerSession = Object.freeze({
  uid: "browser-owner",
  email: "owner@example.test",
  name: "Owner Browser",
  picture: "",
  role: "owner",
  status: "active",
});

export const memberSession = Object.freeze({
  uid: "browser-member",
  email: "member@example.test",
  name: "Member Browser",
  picture: "",
  role: "member",
  status: "active",
});

const accounts = Object.freeze([
  {
    account_id: "acc-shared-bank",
    name: "Rekening Bersama · BNI",
    account_type: "bank",
    bank_template: "bni",
    ewallet_template: "generic",
    account_number: "1234567890123456",
    initial_balance: 5000000,
    initial_balance_date: "2026-01-01",
    updated_at: "2026-08-03T00:00:00.000Z",
    owner_scope: "shared",
    owner_user_id: null,
    balance: 8_500_000,
    status: "active",
    allow_negative: false,
    row_version: 2,
  },
  {
    account_id: "acc-shared-cash",
    name: "Tunai Bersama",
    account_type: "cash",
    bank_template: "generic",
    ewallet_template: "generic",
    account_number: "",
    initial_balance: 1000000,
    initial_balance_date: "2026-01-01",
    updated_at: "2026-08-03T00:00:00.000Z",
    owner_scope: "shared",
    owner_user_id: null,
    balance: 1_500_000,
    status: "active",
    allow_negative: false,
    row_version: 1,
  },
  {
    account_id: "acc-owner-personal",
    name: "Tabungan Owner · BCA",
    account_type: "bank",
    bank_template: "bca",
    ewallet_template: "generic",
    account_number: "9876543210123456",
    initial_balance: 2000000,
    initial_balance_date: "2026-01-01",
    updated_at: "2026-08-03T00:00:00.000Z",
    owner_scope: "personal",
    owner_user_id: ownerSession.uid,
    balance: 2_250_000,
    status: "active",
    allow_negative: false,
    row_version: 1,
  },
  {
    account_id: "acc-member-personal",
    name: "Tabungan Member · Mandiri",
    account_type: "bank",
    bank_template: "mandiri",
    ewallet_template: "generic",
    account_number: "1111222233334444",
    initial_balance: 1250000,
    initial_balance_date: "2026-01-01",
    updated_at: "2026-08-03T00:00:00.000Z",
    owner_scope: "personal",
    owner_user_id: memberSession.uid,
    balance: 1_750_000,
    status: "active",
    allow_negative: false,
    row_version: 1,
  },
]);

const accountsForSession = (session) => accounts.map((account) => {
  const isOwnedByActor = account.owner_scope === "personal" && account.owner_user_id === session.uid;
  const canOperate = session.role === "owner" || account.owner_scope === "shared" || isOwnedByActor;
  const owner = account.owner_user_id === ownerSession.uid ? ownerSession : account.owner_user_id === memberSession.uid ? memberSession : null;
  return {
    ...account,
    owner_name: account.owner_scope === "personal" ? owner?.name || "Pengguna" : "",
    is_owned_by_actor: isOwnedByActor,
    can_transact: canOperate,
    can_reconcile: canOperate,
    can_manage: session.role === "owner",
    read_only: !canOperate && session.role !== "owner",
  };
});

const categories = Object.freeze([
  { category_id: "cat-income", name: "Gaji", transaction_type: "income", nature: "fixed", status: "active", row_version: 1 },
  { category_id: "cat-food", name: "Makan", transaction_type: "expense", nature: "variable", status: "active", row_version: 1 },
  { category_id: "cat-home", name: "Rumah", transaction_type: "expense", nature: "fixed", status: "active", row_version: 1 },
]);

const recentTransactions = Object.freeze([
  {
    transaction_id: "txn-expense-1",
    transaction_type: "expense",
    amount: 125_000,
    transaction_date: "2026-08-02",
    source_account_id: "acc-shared-bank",
    destination_account_id: null,
    category_id: "cat-food",
    envelope_period_id: "env-food-2026-08",
    description: "Belanja makan mingguan",
    merchant: "Pasar",
    status: "active",
    row_version: 1,
    can_edit: true,
    can_cancel: true,
    created_by: "browser-owner",
  },
  {
    transaction_id: "txn-income-1",
    transaction_type: "income",
    amount: 5_000_000,
    transaction_date: "2026-08-01",
    source_account_id: null,
    destination_account_id: "acc-shared-bank",
    category_id: "cat-income",
    envelope_period_id: null,
    description: "Gaji bulan Agustus",
    merchant: "",
    status: "active",
    row_version: 1,
    can_edit: true,
    can_cancel: true,
    created_by: "browser-owner",
  },
  {
    transaction_id: "txn-transfer-1",
    transaction_type: "transfer",
    amount: 500_000,
    transaction_date: "2026-08-01",
    source_account_id: "acc-shared-bank",
    destination_account_id: "acc-shared-cash",
    category_id: null,
    envelope_period_id: null,
    description: "Isi kas bersama",
    merchant: "",
    status: "active",
    row_version: 1,
    can_edit: true,
    can_cancel: true,
    created_by: "browser-owner",
  },
]);

const memberTransactions = Object.freeze([
  {
    transaction_id: "txn-member-expense-1",
    transaction_type: "expense",
    amount: 85_000,
    transaction_date: "2026-08-03",
    source_account_id: "acc-shared-cash",
    destination_account_id: null,
    category_id: "cat-food",
    envelope_period_id: null,
    description: "Makan bersama dicatat member",
    merchant: "Warung",
    status: "active",
    row_version: 1,
    can_edit: false,
    can_cancel: false,
    created_by: "browser-member",
  },
  {
    transaction_id: "txn-member-transfer-1",
    transaction_type: "transfer",
    amount: 250_000,
    transaction_date: "2026-08-02",
    source_account_id: "acc-shared-cash",
    destination_account_id: "acc-shared-bank",
    category_id: null,
    envelope_period_id: null,
    description: "Pindah dana dicatat member",
    merchant: "",
    status: "active",
    row_version: 1,
    can_edit: false,
    can_cancel: false,
    created_by: "browser-member",
  },
]);

const ledgerTransactions = Object.freeze([...recentTransactions, ...memberTransactions]);

const envelopes = Object.freeze([
  {
    envelope_id: "env-food",
    envelope_period_id: "env-food-2026-08",
    name: "Belanja harian",
    period_type: "monthly",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    allocated_amount: 1_500_000,
    used_amount: 500_000,
    reserved_amount: 100_000,
    remaining_amount: 900_000,
    owner_scope: "shared",
    source_account_id: "acc-shared-bank",
    status: "active",
    row_version: 1,
    can_close: true,
  },
]);

const recurring = Object.freeze([
  {
    recurring_rule_id: "rec-rent",
    occurrence_id: "occ-rent-2026-08",
    period_key: periodKey,
    name: "Kontrakan",
    kind: "expense",
    transaction_type: "expense",
    category_id: "cat-home",
    expected_amount: 1_300_000,
    actual_amount: 0,
    due_date: "2026-08-20",
    frequency: "monthly",
    rule_due_day: 20,
    default_account_id: "acc-shared-bank",
    payment_method: "transfer",
    auto_debit: false,
    start_date: "2026-01-20",
    end_date: null,
    priority: 1,
    rule_status: "active",
    scope: "shared",
    owner_user_id: null,
    status: "expected",
    transaction_ids: "",
    row_version: 1,
    rule_row_version: 1,
    can_pay: true,
    can_reverse: false,
    can_cancel_occurrence: true,
    can_restore_occurrence: false,
    can_edit_rule: true,
    can_archive_rule: true,
  },
]);

const recurringForSession = (session) => recurring.map((item) => {
  const canManage = session.role === "owner";
  return {
    ...item,
    can_cancel_occurrence: canManage && item.can_cancel_occurrence,
    can_restore_occurrence: canManage && item.can_restore_occurrence,
    can_edit_rule: canManage && item.can_edit_rule,
    can_archive_rule: canManage && item.can_archive_rule,
  };
});

const goals = Object.freeze([
  {
    goal_id: "goal-wedding",
    name: "Tabungan nikah",
    goal_type: "savings",
    account_id: "acc-shared-bank",
    owner_scope: "shared",
    target_amount: 20_000_000,
    current_amount: 4_000_000,
    remaining_amount: 16_000_000,
    target_date: "2027-08-01",
    required_monthly_amount: 1_333_334,
    pace_status: "on_track",
    priority: "high",
    status: "active",
    row_version: 1,
    can_move: true,
    can_deposit: true,
    can_withdraw: true,
    can_complete: false,
    can_reopen: false,
    can_reverse: false,
    can_update: true,
    can_archive: true,
  },
]);

const budgets = Object.freeze([
  {
    budget_id: "budget-food",
    category_id: "cat-food",
    category_name: "Makan",
    name: "Makan",
    scope: "shared",
    amount: 1_000_000,
    used_amount: 800_000,
    warning_threshold: 80,
    row_version: 1,
    status: "active",
  },
]);

const alerts = Object.freeze([
  { id: "budget:budget-food:80", type: "budget_threshold", severity: "warning", title: "Makan 80% terpakai", message: "Pemakaian kategori makan mendekati batas.", targetPath: "/anggaran" },
  { id: "recurring-due:occ-rent-2026-08", type: "recurring_due", severity: "warning", title: "Kontrakan segera jatuh tempo", message: "Tagihan jatuh tempo dalam 7 hari.", targetPath: "/tagihan" },
  { id: "goal-behind:goal-wedding", type: "goal_behind", severity: "warning", title: "Target perlu dijaga", message: "Setoran bulanan perlu dipertahankan.", targetPath: "/target" },
  { id: `unallocated:${periodKey}`, type: "unallocated_expense", severity: "warning", title: "1 pengeluaran belum masuk alokasi", message: "Pilih kantong agar sisa jatah tetap akurat.", targetPath: "/transaksi" },
  { id: "reconciliation-stale:acc-shared-cash", type: "reconciliation_stale", severity: "info", title: "Saldo Tunai belum pernah dicek", message: "Cocokkan saldo aplikasi dengan saldo sebenarnya.", targetPath: "/rekonsiliasi" },
]);

export const bootstrapFixture = Object.freeze({
  accounts,
  categories,
  config: { schemaVersion: 9, timezone: "Asia/Jakarta", maintenanceMode: false },
});

export const overviewFixture = Object.freeze({
  periodKey,
  totalBalance: 10_000_000,
  openingBalance: 5_125_000,
  safeToSpend: 3_400_000,
  dailySafeToSpend: 110_000,
  reservedBills: 1_000_000,
  unallocatedFunds: 250_000,
  unallocatedCount: 1,
  accountBalances: accounts.map(({ account_id, name, balance }) => ({ account_id, name, balance })),
  cashFlow: { income: 5_000_000, expense: 125_000, refund: 0, net: 4_875_000 },
  categoryExpenses: [
    { name: "Makan", amount: 125_000 },
    { name: "Rumah", amount: 75_000 },
  ],
  envelopes,
  recurring,
  goals,
  budgets,
  recentTransactions,
  alerts,
  lastSyncedAt: "2026-08-02T05:44:14.120Z",
  isHistoricalPeriod: false,
});

const reportFixture = Object.freeze({
  overview: overviewFixture,
  budgets,
  categoryExpenses: overviewFixture.categoryExpenses.map((item) => ({ label: item.name, value: item.amount, name: item.name, amount: item.amount })),
  accountExpenses: [{ label: "Rekening Bersama", value: 125_000, name: "Rekening Bersama", amount: 125_000 }],
  creatorExpenses: [
    { user_id: ownerSession.uid, label: "Owner Browser", value: 125_000, name: "Owner Browser", amount: 125_000, transaction_count: 1 },
    { user_id: memberSession.uid, label: "Member Browser", value: 85_000, name: "Member Browser", amount: 85_000, transaction_count: 1 },
  ],
  natureExpenses: [{ label: "Variabel", value: 125_000, name: "Variabel", amount: 125_000 }],
  trend: {
    months: 6,
    items: [
      { label: "Mar", net: 500_000, totalBalance: 6_000_000 },
      { label: "Apr", net: 750_000, totalBalance: 6_750_000 },
      { label: "Mei", net: 800_000, totalBalance: 7_550_000 },
      { label: "Jun", net: 900_000, totalBalance: 8_450_000 },
      { label: "Jul", net: 675_000, totalBalance: 9_125_000 },
      { label: "Agu", net: 875_000, totalBalance: 10_000_000 },
    ],
  },
});

export const createAuthenticatedGatewayResponses = (session = ownerSession) => {
  const sessionAccounts = accountsForSession(session);
  const sessionBootstrap = { ...bootstrapFixture, accounts: sessionAccounts };
  const sessionOverview = {
    ...overviewFixture,
    totalBalance: sessionAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    accountBalances: sessionAccounts.map(({ account_id, name, balance, owner_scope, owner_name }) => ({ account_id, name, balance, owner_scope, owner_name })),
  };
  return {
    "app.initialState": { bootstrap: sessionBootstrap, overview: sessionOverview },
    "bootstrap.get": sessionBootstrap,
    "dashboard.overview": sessionOverview,
    "transactions.list": (payload = {}) => {
      const period = String(payload.period || periodKey);
      const type = String(payload.transaction_type || "all");
      const creator = String(payload.created_by || "all");
      const accountId = String(payload.account_id || "all");
      const limit = Math.max(1, Number(payload.limit || 100));
      const offset = Math.max(0, Number(payload.offset || 0));
      const filtered = ledgerTransactions.filter((item) => {
        if (period && item.transaction_date.slice(0, 7) !== period) return false;
        if (type !== "all" && item.transaction_type !== type) return false;
        if (creator !== "all" && creator !== "" && item.created_by !== (creator === "me" ? session.uid : creator)) return false;
        if (accountId !== "all" && accountId !== "" && item.source_account_id !== accountId && item.destination_account_id !== accountId) return false;
        return true;
      });
      return {
        items: filtered.slice(offset, offset + limit),
        filterOptions: {
          accounts: sessionAccounts.map(({ account_id, name, owner_scope, owner_name }) => ({ account_id, name, owner_scope, owner_name })),
          categories: categories.map(({ category_id, name }) => ({ category_id, name })),
          creators: [
            { user_id: ownerSession.uid, name: ownerSession.name, email: ownerSession.email },
            { user_id: memberSession.uid, name: memberSession.name, email: memberSession.email },
          ],
        },
        total: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
        nextOffset: offset + Math.min(limit, filtered.length - offset),
        periodLocked: false,
      };
    },
    "envelopes.list": { items: envelopes },
    "recurring.list": { items: recurringForSession(session) },
    "goals.list": { items: goals },
    "budgets.list": { items: budgets },
    "reports.monthly": { ...reportFixture, overview: sessionOverview },
    "accounts.list": { items: sessionAccounts },
    "categories.list": { items: categories },
    "reconciliations.list": { items: [] },
    "users.list": { items: [
      { user_id: ownerSession.uid, email: ownerSession.email, name: ownerSession.name, role: "owner", status: "active", is_current: session.uid === ownerSession.uid, row_version: 1 },
      { user_id: memberSession.uid, email: memberSession.email, name: memberSession.name, role: "member", status: "active", is_current: session.uid === memberSession.uid, row_version: 1 },
    ] },
    "audit.list": { items: [{ audit_id: "audit-1", timestamp: "2026-08-02T05:40:00.000Z", actor_email: session.email, action: "transaction.create", entity_type: "transaction", result: "success" }] },
    "archive.list": { accounts: [], categories: [], envelopeRules: [], goals: [], recurringRules: [], budgets: [] },
    "import.preview": {
      previewToken: "browser-import-preview", acceptable: false, validCount: 1,
      invalid: [{ index: 1, code: "CATEGORY_NOT_FOUND", message: "Kategori import tidak valid." }], duplicates: [],
      impact: { income: 0, refund: 0, expense: 125000, transfer: 0 },
    },
    "restore.preview": {
      previewToken: "browser-restore-preview", fileName: "saldo-bersama-full-v9-browser.json.gz",
      createdAt: "2026-08-13T04:15:00.000Z", schemaVersion: 9,
      tables: { transactions: 18, accounts: 3, categories: 8, users: 2, envelope_rules: 4, savings_goals: 2, recurring_rules: 3, budgets: 5, audit_log: 42 },
    },
    "system.health": {
      status: "ok", schemaVersion: 9, maintenanceMode: false, recoveryRequired: false, timezone: "Asia/Jakarta", currency: "IDR",
      integrations: { configured: { sheets: false, calendar: false, drive: false }, providers: {}, bridge: { configured: true, checked: false }, driveBackup: null },
    },
    "integrations.status": {
      configured: { sheets: true, calendar: true, drive: true },
      providers: { sheets: {}, calendar: {}, drive: {} },
      bridge: {
        configured: true, checked: true, reachable: true,
        health: { mirrorConfigured: true, calendarConfigured: true, backupConfigured: true, jobsConfigured: true, triggerReady: true },
      },
      driveBackup: {
        backupId: "backup-browser", backupType: "manual", fileId: "drive-browser-backup", fileName: "saldo-bersama-full-v9-browser.json.gz",
        schemaVersion: 9, status: "verified", createdAt: "2026-08-13T04:15:00.000Z", verifiedAt: "2026-08-13T04:16:00.000Z", errorCode: null,
      },
    },
    "reset.status": {
      checkedAt: "2026-08-13T04:00:00.000Z", outcome: "idle", requiresAttention: false, canStartNewIntent: true,
      maintenanceMode: false, intent: null, backup: null, committedReset: null,
      currentSummary: { totalRows: 2, businessRows: 2, operationalRows: 0 },
    },
    "reset.preview": {
      scope: "prelaunch-testing-data", previewFingerprint: "browser-reset-preview", previewedAt: "2026-08-13T04:00:00.000Z",
      confirmationPhrase: "BERSIHKAN DATA TESTING",
      summary: {
        transactions: 1, reconciliations: 1, goals: 0, goalMovements: 0, budgets: 0, allocationRules: 0, allocationPeriods: 0,
        allocationMovements: 0, recurringRules: 0, recurringOccurrences: 0, periodClosures: 0, notificationDeliveries: 0,
        notificationQueue: 0, integrationLinks: 0, integrationOutbox: 0, importPreviews: 0, businessRows: 2, operationalRows: 0, totalRows: 2,
      },
      preserved: { accounts: 3, categories: 3, users: 2, audit: 8, backups: 1, pushSubscriptions: 1, notificationPreferences: 7 },
    },
    "notifications.preferences": {
      items: [
        { type: "recurring_due", enabled: true, row_version: null, source: "default" },
        { type: "recurring_funding_shortage", enabled: true, row_version: null, source: "default" },
        { type: "recurring_completed", enabled: true, row_version: null, source: "default" },
        { type: "budget_threshold", enabled: true, row_version: null, source: "default" },
        { type: "envelope_threshold", enabled: true, row_version: null, source: "default" },
        { type: "goal_behind", enabled: true, row_version: null, source: "default" },
        { type: "unallocated_expense", enabled: true, row_version: null, source: "default" }
      ],
    },
    "periods.list": { items: [] },
  };
};
