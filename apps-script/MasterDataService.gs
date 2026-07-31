const SB_ACCOUNT_TYPES = ["bank", "cash", "ewallet", "savings", "emergency_fund", "sinking_fund"];
const SB_CATEGORY_NATURES = ["fixed", "variable", "unexpected", "discretionary", "emergency"];

function activeUser_(userId) {
  const user = findBy_("Users", "user_id", userId);
  if (!user || user.status !== "active") throw sbError_("INVALID_USER", "Pemilik pribadi tidak ditemukan atau tidak aktif.", 400);
  return user;
}

function visibleAccountRows_(context) {
  return rows_("Accounts").filter(function(account) { return canAccessAccount_(context, account); });
}

function listAccounts_(context, transactionSnapshot) {
  const transactions = transactionSnapshot || visibleTransactions_(context);
  return visibleAccountRows_(context).map(function(row) {
    const account = publicRow_(row);
    account.balance = accountBalance_(account.account_id, transactions);
    return account;
  });
}

function createAccount_(context) {
  const payload = context.payload;
  const name = sanitizeText_(payload.name, 100);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  const initialBalance = Number(payload.initial_balance || 0);
  if (!Number.isSafeInteger(initialBalance) || Math.abs(initialBalance) > 100000000000) throw sbError_("INVALID_AMOUNT", "Saldo awal harus integer rupiah.", 400);
  if (payload.owner_scope !== undefined && ["personal", "shared"].indexOf(payload.owner_scope) === -1) throw sbError_("INVALID_OWNER_SCOPE", "Scope rekening harus personal atau shared.", 400);
  const scope = payload.owner_scope === "personal" ? "personal" : "shared";
  const ownerUserId = context.actor.role === "owner" && payload.owner_user_id ? payload.owner_user_id : context.actor.user_id;
  const accountType = sanitizeText_(payload.account_type || "bank", 40);
  if (SB_ACCOUNT_TYPES.indexOf(accountType) === -1) throw sbError_("INVALID_ACCOUNT_TYPE", "Jenis rekening tidak valid.", 400);
  if (scope === "personal") activeUser_(ownerUserId);
  const record = {
    account_id: uuid_(), name: name, account_type: accountType,
    owner_scope: scope, owner_user_id: scope === "personal" ? ownerUserId : "",
    initial_balance: initialBalance, initial_balance_date: validateDate_(payload.initial_balance_date || today_()),
    allow_negative: strictBoolean_(payload.allow_negative, "allow_negative", false), status: "active", row_version: 1,
    created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendAuditedRow_("Accounts", "account_id", record, context, "accounts.create", "account", null, publicRow_(record));
  return publicRow_(record);
}

function updateAccount_(context) {
  const payload = context.payload;
  const current = findBy_("Accounts", "account_id", payload.account_id);
  if (!current) throw sbError_("NOT_FOUND", "Rekening tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const updated = Object.assign({}, current);
  updated.name = sanitizeText_(payload.name === undefined ? current.name : payload.name, 100);
  if (!updated.name) throw sbError_("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  if (payload.owner_scope !== undefined && ["personal", "shared"].indexOf(payload.owner_scope) === -1) throw sbError_("INVALID_OWNER_SCOPE", "Scope rekening harus personal atau shared.", 400);
  updated.owner_scope = payload.owner_scope === undefined ? current.owner_scope : payload.owner_scope;
  if (updated.owner_scope === "shared") updated.owner_user_id = "";
  else if (context.actor.role === "owner" && payload.owner_user_id) updated.owner_user_id = payload.owner_user_id;
  else if (!updated.owner_user_id) updated.owner_user_id = context.actor.user_id;
  if (updated.owner_scope === "personal") activeUser_(updated.owner_user_id);
  const ownershipChanged = String(updated.owner_scope) !== String(current.owner_scope) || String(updated.owner_user_id || "") !== String(current.owner_user_id || "");
  if (ownershipChanged) {
    const hasTransactions = rows_("Transactions").some(function(row) {
      return String(row.source_account_id || "") === String(current.account_id) || String(row.destination_account_id || "") === String(current.account_id);
    });
    const dependencies = accountArchiveDependencies_(current.account_id).filter(function(item) { return item.type !== "non_zero_balance"; });
    if (hasTransactions || dependencies.length) throw sbError_("ACCOUNT_OWNERSHIP_LOCKED", "Kepemilikan rekening tidak dapat diubah setelah rekening dipakai transaksi atau referensi aktif.", 409, dependencies);
  }
  updated.allow_negative = payload.allow_negative === undefined ? current.allow_negative : strictBoolean_(payload.allow_negative, "allow_negative", current.allow_negative);
  updated.row_version = rowVersion_(current) + 1; updated.updated_by = context.actor.user_id; updated.updated_at = nowIso_();
  updateAuditedRow_("Accounts", current, updated, context, "accounts.update", "account", updated.account_id);
  return publicRow_(updated);
}

function accountArchiveDependencies_(accountId) {
  const dependencies = [];
  const balance = accountBalance_(accountId);
  if (balance !== 0) dependencies.push({ type: "non_zero_balance", balance: balance });
  if (rows_("Recurring_Rules").some(function(row) { return row.status === "active" && String(row.default_account_id) === String(accountId); })) dependencies.push({ type: "active_recurring_rule" });
  if (rows_("Envelope_Rules").some(function(row) { return row.status === "active" && String(row.source_account_id) === String(accountId); })) dependencies.push({ type: "active_envelope_rule" });
  if (rows_("Savings_Goals").some(function(row) { return row.status === "active" && String(row.account_id) === String(accountId); })) dependencies.push({ type: "active_savings_goal" });
  return dependencies;
}

function archiveAccount_(context) {
  const current = findBy_("Accounts", "account_id", context.payload.account_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const dependencies = accountArchiveDependencies_(current.account_id);
  if (dependencies.length) throw sbError_("ACCOUNT_HAS_DEPENDENCIES", "Rekening belum dapat diarsipkan karena saldo atau referensi aktif masih ada.", 409, dependencies);
  const updated = Object.assign({}, current, { status: "archived", row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  updateAuditedRow_("Accounts", current, updated, context, "accounts.archive", "account", updated.account_id);
  return publicRow_(updated);
}

function listCategories_() { return rows_("Categories").map(publicRow_); }

function createCategory_(context) {
  const payload = context.payload;
  const name = sanitizeText_(payload.name, 80);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama kategori wajib diisi.", 400);
  if (!["income", "expense"].includes(payload.transaction_type)) throw sbError_("INVALID_TYPE", "Jenis kategori tidak valid.", 400);
  const nature = sanitizeText_(payload.nature || "variable", 40);
  if (SB_CATEGORY_NATURES.indexOf(nature) === -1) throw sbError_("INVALID_CATEGORY_NATURE", "Sifat kategori tidak valid.", 400);
  const duplicate = rows_("Categories").find(function(row) { return row.status === "active" && String(row.name).toLowerCase() === name.toLowerCase() && row.transaction_type === payload.transaction_type; });
  if (duplicate) throw sbError_("DUPLICATE_CATEGORY", "Kategori aktif dengan nama tersebut sudah ada.", 409);
  const record = {
    category_id: uuid_(), name: name, transaction_type: payload.transaction_type,
    nature: nature, icon: sanitizeText_(payload.icon || "", 40),
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendAuditedRow_("Categories", "category_id", record, context, "categories.create", "category", null, publicRow_(record));
  return publicRow_(record);
}

function updateCategory_(context) {
  const payload = context.payload;
  const current = findBy_("Categories", "category_id", payload.category_id);
  if (!current) throw sbError_("NOT_FOUND", "Kategori tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const nextName = sanitizeText_(payload.name === undefined ? current.name : payload.name, 80);
  const nextNature = sanitizeText_(payload.nature === undefined ? current.nature : payload.nature, 40);
  if (!nextName) throw sbError_("NAME_REQUIRED", "Nama kategori wajib diisi.", 400);
  if (SB_CATEGORY_NATURES.indexOf(nextNature) === -1) throw sbError_("INVALID_CATEGORY_NATURE", "Sifat kategori tidak valid.", 400);
  const duplicate = rows_("Categories").find(function(row) { return row.category_id !== current.category_id && row.status === "active" && String(row.name).toLowerCase() === nextName.toLowerCase() && row.transaction_type === current.transaction_type; });
  if (duplicate) throw sbError_("DUPLICATE_CATEGORY", "Kategori aktif dengan nama tersebut sudah ada.", 409);
  const updated = Object.assign({}, current, {
    name: nextName,
    nature: nextNature,
    icon: sanitizeText_(payload.icon === undefined ? current.icon : payload.icon, 40),
    row_version: rowVersion_(current) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso_()
  });
  updateAuditedRow_("Categories", current, updated, context, "categories.update", "category", updated.category_id);
  return publicRow_(updated);
}

function categoryArchiveDependencies_(categoryId) {
  const dependencies = [];
  if (rows_("Recurring_Rules").some(function(row) { return row.status === "active" && String(row.category_id) === String(categoryId); })) dependencies.push({ type: "active_recurring_rule" });
  if (rows_("Budgets").some(function(row) { return row.status === "active" && String(row.category_id) === String(categoryId); })) dependencies.push({ type: "active_budget" });
  return dependencies;
}

function archiveCategory_(context) {
  const current = findBy_("Categories", "category_id", context.payload.category_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const dependencies = categoryArchiveDependencies_(current.category_id);
  if (dependencies.length) throw sbError_("CATEGORY_HAS_DEPENDENCIES", "Kategori belum dapat diarsipkan karena masih digunakan aturan atau budget aktif.", 409, dependencies);
  const updated = Object.assign({}, current, { status: "archived", row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  updateAuditedRow_("Categories", current, updated, context, "categories.archive", "category", updated.category_id);
  return publicRow_(updated);
}

function listUsers_(context) {
  return rows_("Users").map(function(row) {
    return { user_id: row.user_id, email: row.email, name: row.name, role: row.role, status: row.status, row_version: row.row_version, is_current: row.user_id === context.actor.user_id, created_at: row.created_at, updated_at: row.updated_at };
  });
}

function activeOwnerCount_() {
  return rows_("Users").filter(function(row) { return row.status === "active" && row.role === "owner"; }).length;
}

function upsertUser_(context) {
  const payload = context.payload;
  const email = String(payload.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw sbError_("INVALID_EMAIL", "Email anggota tidak valid.", 400);
  if (["owner", "member"].indexOf(payload.role) === -1) throw sbError_("INVALID_ROLE", "Role anggota harus owner atau member.", 400);
  const role = payload.role;
  const current = findBy_("Users", "email", email);
  if (current) {
    assertVersion_(current, context.rowVersion || payload.row_version);
    if (current.role === "owner" && role !== "owner" && activeOwnerCount_() <= 1) throw sbError_("LAST_OWNER", "Owner terakhir tidak dapat diturunkan menjadi member.", 409);
    const updated = Object.assign({}, current, {
      name: sanitizeText_(payload.name || current.name || email, 120), role: role, status: "active",
      row_version: rowVersion_(current) + 1, updated_at: nowIso_()
    });
    updateAuditedRow_("Users", current, updated, context, "users.upsert", "user", updated.user_id,
      { email: current.email, name: current.name, role: current.role, status: current.status, row_version: current.row_version },
      { email: updated.email, name: updated.name, role: updated.role, status: updated.status, row_version: updated.row_version });
    return { user_id: updated.user_id, email: updated.email, name: updated.name, role: updated.role, status: updated.status, row_version: updated.row_version };
  }
  const record = { user_id: uuid_(), firebase_uid: "", email: email, name: sanitizeText_(payload.name || email, 120), role: role, status: "active", row_version: 1, created_at: nowIso_(), updated_at: nowIso_() };
  appendAuditedRow_("Users", "user_id", record, context, "users.upsert", "user", null, { email: record.email, name: record.name, role: record.role, status: record.status, row_version: record.row_version });
  return { user_id: record.user_id, email: record.email, name: record.name, role: record.role, status: record.status, row_version: record.row_version };
}

function userDeactivateDependencies_(userId) {
  const dependencies = [];
  const ownsActivePersonal = function(sheetName) {
    return rows_(sheetName).some(function(row) {
      return row.status === "active" && row.scope === "personal" && String(row.owner_user_id) === String(userId);
    });
  };
  if (rows_("Accounts").some(function(row) { return row.status === "active" && row.owner_scope === "personal" && String(row.owner_user_id) === String(userId); })) dependencies.push({ type: "active_personal_account" });
  if (ownsActivePersonal("Envelope_Rules")) dependencies.push({ type: "active_personal_envelope" });
  if (ownsActivePersonal("Recurring_Rules")) dependencies.push({ type: "active_personal_recurring_rule" });
  if (ownsActivePersonal("Budgets")) dependencies.push({ type: "active_personal_budget" });
  if (ownsActivePersonal("Savings_Goals")) dependencies.push({ type: "active_personal_goal" });
  return dependencies;
}

function deactivateUser_(context) {
  const current = findBy_("Users", "user_id", context.payload.user_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Anggota aktif tidak ditemukan.", 404);
  if (current.user_id === context.actor.user_id) throw sbError_("SELF_DEACTIVATION_DENIED", "Akun sendiri tidak dapat dinonaktifkan dari aplikasi.", 409);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  if (current.role === "owner" && activeOwnerCount_() <= 1) throw sbError_("LAST_OWNER", "Owner terakhir tidak dapat dinonaktifkan.", 409);
  const dependencies = userDeactivateDependencies_(current.user_id);
  if (dependencies.length) throw sbError_("USER_HAS_DEPENDENCIES", "Anggota belum dapat dinonaktifkan karena masih memiliki rekening atau kantong personal aktif.", 409, dependencies);
  const updated = Object.assign({}, current, { status: "inactive", row_version: rowVersion_(current) + 1, updated_at: nowIso_() });
  updateAuditedRow_("Users", current, updated, context, "users.deactivate", "user", updated.user_id,
    { email: current.email, role: current.role, status: current.status, row_version: current.row_version },
    { email: updated.email, role: updated.role, status: updated.status, row_version: updated.row_version });
  return { user_id: updated.user_id, email: updated.email, role: updated.role, status: updated.status, row_version: updated.row_version };
}
