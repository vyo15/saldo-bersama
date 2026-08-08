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
    name: "Kontrakan",
    transaction_type: "expense",
    amount: 1_000_000,
    due_date: "2026-08-10",
    frequency: "monthly",
    source_account_id: "acc-shared-bank",
    category_id: "cat-home",
    owner_scope: "shared",
    status: "pending",
    occurrence_status: "pending",
    row_version: 1,
    can_pay: true,
    can_update: true,
    can_archive: true,
    can_reverse: false,
  },
]);

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
  { id: "alert-budget", severity: "warning", title: "Anggaran makan 80%", message: "Pemakaian kategori makan mendekati batas.", targetPath: "/anggaran" },
  { id: "alert-recurring", severity: "info", title: "Kontrakan segera jatuh tempo", message: "Tagihan jatuh tempo dalam 8 hari.", targetPath: "/tagihan" },
  { id: "alert-goal", severity: "warning", title: "Target perlu dijaga", message: "Setoran bulanan perlu dipertahankan.", targetPath: "/target" },
  { id: "alert-unallocated", severity: "danger", title: "Transaksi belum dialokasikan", message: "Satu transaksi perlu ditinjau.", targetPath: "/transaksi" },
  { id: "alert-reconciliation", severity: "info", title: "Saatnya rekonsiliasi", message: "Cocokkan saldo rekening dengan bank.", targetPath: "/rekening" },
]);

export const bootstrapFixture = Object.freeze({
  accounts,
  categories,
  config: { schemaVersion: 6, timezone: "Asia/Jakarta", maintenanceMode: false },
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
    "recurring.list": { items: recurring },
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
    "system.health": { status: "ok", schemaVersion: 6, maintenanceMode: false, recoveryRequired: false, timezone: "Asia/Jakarta", currency: "IDR", integrations: { configured: { sheets: false, calendar: false }, providers: {} } },
    "integrations.status": { configured: { sheets: false, calendar: false }, providers: { sheets: {}, calendar: {} } },
    "periods.list": { items: [] },
  };
};
