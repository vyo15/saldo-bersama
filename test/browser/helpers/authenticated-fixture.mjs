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
    name: "Rekening Bersama",
    account_type: "bank",
    account_number: "1234567890123456",
    initial_balance: 5000000,
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
    account_number: "",
    initial_balance: 1000000,
    updated_at: "2026-08-03T00:00:00.000Z",
    owner_scope: "shared",
    owner_user_id: null,
    balance: 1_500_000,
    status: "active",
    allow_negative: false,
    row_version: 1,
  },
]);

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

const alerts = Object.freeze([
  { id: "alert-budget", severity: "warning", title: "Budget makan 80%", message: "Pemakaian kategori makan mendekati batas.", targetPath: "/laporan" },
  { id: "alert-recurring", severity: "info", title: "Kontrakan segera jatuh tempo", message: "Tagihan jatuh tempo dalam 8 hari.", targetPath: "/tagihan" },
  { id: "alert-goal", severity: "warning", title: "Target perlu dijaga", message: "Setoran bulanan perlu dipertahankan.", targetPath: "/target" },
  { id: "alert-unallocated", severity: "danger", title: "Transaksi belum dialokasikan", message: "Satu transaksi perlu ditinjau.", targetPath: "/transaksi" },
  { id: "alert-reconciliation", severity: "info", title: "Saatnya rekonsiliasi", message: "Cocokkan saldo rekening dengan bank.", targetPath: "/rekening" },
]);

export const bootstrapFixture = Object.freeze({
  accounts,
  categories,
  config: { schemaVersion: 4, timezone: "Asia/Jakarta", maintenanceMode: false },
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
  recentTransactions,
  alerts,
  lastSyncedAt: "2026-08-02T05:44:14.120Z",
  isHistoricalPeriod: false,
});

const reportFixture = Object.freeze({
  overview: overviewFixture,
  budgets: [
    {
      budget_id: "budget-food",
      category_id: "cat-food",
      category_name: "Makan",
      scope: "shared",
      amount: 1_000_000,
      actual_amount: 800_000,
      remaining_amount: 200_000,
      warning_threshold: 80,
      row_version: 1,
      status: "active",
    },
  ],
  categoryExpenses: overviewFixture.categoryExpenses.map((item) => ({ label: item.name, value: item.amount, name: item.name, amount: item.amount })),
  accountExpenses: [{ label: "Rekening Bersama", value: 125_000, name: "Rekening Bersama", amount: 125_000 }],
  creatorExpenses: [{ label: "Owner Browser", value: 125_000, name: "Owner Browser", amount: 125_000 }],
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

export const createAuthenticatedGatewayResponses = (session = ownerSession) => ({
  "app.initialState": { bootstrap: bootstrapFixture, overview: overviewFixture },
  "bootstrap.get": bootstrapFixture,
  "dashboard.overview": overviewFixture,
  "transactions.list": {
    items: recentTransactions,
    filterOptions: {
      accounts: accounts.map(({ account_id, name }) => ({ account_id, name })),
      categories: categories.map(({ category_id, name }) => ({ category_id, name })),
      creators: [{ user_id: session.uid, name: session.name, email: session.email }],
    },
    total: recentTransactions.length,
    limit: 100,
    offset: 0,
    periodLocked: false,
  },
  "envelopes.list": { items: envelopes },
  "recurring.list": { items: recurring },
  "goals.list": { items: goals },
  "reports.monthly": reportFixture,
  "accounts.list": { items: accounts },
  "categories.list": { items: categories },
  "reconciliations.list": { items: [] },
  "users.list": { items: [
    { user_id: ownerSession.uid, email: ownerSession.email, name: ownerSession.name, role: "owner", status: "active", is_current: session.uid === ownerSession.uid, row_version: 1 },
    { user_id: memberSession.uid, email: memberSession.email, name: memberSession.name, role: "member", status: "active", is_current: session.uid === memberSession.uid, row_version: 1 },
  ] },
  "audit.list": { items: [{ audit_id: "audit-1", timestamp: "2026-08-02T05:40:00.000Z", actor_email: session.email, action: "transaction.create", entity_type: "transaction", result: "success" }] },
  "system.health": { database: "ok", maintenanceMode: false, schema: { ready: true, version: 4 }, integrations: { configured: { sheets: false, calendar: false }, providers: {} } },
  "integrations.status": { configured: { sheets: false, calendar: false }, providers: { sheets: {}, calendar: {} } },
  "periods.list": { items: [] },
});
