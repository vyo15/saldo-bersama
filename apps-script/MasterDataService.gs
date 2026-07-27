function listAccounts_() {
  const transactions = rows_("Transactions");
  return rows_("Accounts").map(function(row) {
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
  const record = {
    account_id: uuid_(), name: name, account_type: sanitizeText_(payload.account_type || "bank", 40),
    owner_scope: payload.owner_scope === "personal" ? "personal" : "shared", owner_user_id: payload.owner_user_id || context.actor.user_id,
    initial_balance: initialBalance, initial_balance_date: validateDate_(payload.initial_balance_date || today_()),
    allow_negative: Boolean(payload.allow_negative), status: "active", row_version: 1,
    created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendRow_("Accounts", record);
  appendAudit_(context, "accounts.create", "account", record.account_id, null, publicRow_(record));
  return publicRow_(record);
}

function updateAccount_(context) {
  const payload = context.payload;
  const current = findBy_("Accounts", "account_id", payload.account_id);
  if (!current) throw sbError_("NOT_FOUND", "Rekening tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const previous = publicRow_(current);
  current.name = sanitizeText_(payload.name === undefined ? current.name : payload.name, 100);
  current.owner_scope = payload.owner_scope === undefined ? current.owner_scope : payload.owner_scope;
  current.allow_negative = payload.allow_negative === undefined ? current.allow_negative : Boolean(payload.allow_negative);
  current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Accounts", current.__row, current);
  appendAudit_(context, "accounts.update", "account", current.account_id, previous, publicRow_(current));
  return publicRow_(current);
}

function archiveAccount_(context) {
  const current = findBy_("Accounts", "account_id", context.payload.account_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const previous = publicRow_(current);
  current.status = "archived"; current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Accounts", current.__row, current);
  appendAudit_(context, "accounts.archive", "account", current.account_id, previous, publicRow_(current));
  return publicRow_(current);
}

function listCategories_() { return rows_("Categories").map(publicRow_); }

function createCategory_(context) {
  const payload = context.payload;
  const name = sanitizeText_(payload.name, 80);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama kategori wajib diisi.", 400);
  if (!["income", "expense"].includes(payload.transaction_type)) throw sbError_("INVALID_TYPE", "Jenis kategori tidak valid.", 400);
  const duplicate = rows_("Categories").find(function(row) { return row.status === "active" && String(row.name).toLowerCase() === name.toLowerCase() && row.transaction_type === payload.transaction_type; });
  if (duplicate) throw sbError_("DUPLICATE_CATEGORY", "Kategori aktif dengan nama tersebut sudah ada.", 409);
  const record = {
    category_id: uuid_(), name: name, transaction_type: payload.transaction_type,
    nature: sanitizeText_(payload.nature || "variable", 40), icon: sanitizeText_(payload.icon || "", 40),
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendRow_("Categories", record);
  appendAudit_(context, "categories.create", "category", record.category_id, null, publicRow_(record));
  return publicRow_(record);
}

function updateCategory_(context) {
  const payload = context.payload;
  const current = findBy_("Categories", "category_id", payload.category_id);
  if (!current) throw sbError_("NOT_FOUND", "Kategori tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || payload.row_version);
  const previous = publicRow_(current);
  current.name = sanitizeText_(payload.name === undefined ? current.name : payload.name, 80);
  current.nature = sanitizeText_(payload.nature === undefined ? current.nature : payload.nature, 40);
  current.icon = sanitizeText_(payload.icon === undefined ? current.icon : payload.icon, 40);
  current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Categories", current.__row, current);
  appendAudit_(context, "categories.update", "category", current.category_id, previous, publicRow_(current));
  return publicRow_(current);
}

function archiveCategory_(context) {
  const current = findBy_("Categories", "category_id", context.payload.category_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const previous = publicRow_(current);
  current.status = "archived"; current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Categories", current.__row, current);
  appendAudit_(context, "categories.archive", "category", current.category_id, previous, publicRow_(current));
  return publicRow_(current);
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
  const role = payload.role === "owner" ? "owner" : "member";
  const current = findBy_("Users", "email", email);
  if (current) {
    assertVersion_(current, context.rowVersion || payload.row_version);
    if (current.role === "owner" && role !== "owner" && activeOwnerCount_() <= 1) throw sbError_("LAST_OWNER", "Owner terakhir tidak dapat diturunkan menjadi member.", 409);
    const previous = publicRow_(current);
    current.name = sanitizeText_(payload.name || current.name || email, 120);
    current.role = role;
    current.status = "active";
    current.row_version = rowVersion_(current) + 1;
    current.updated_at = nowIso_();
    updateRow_("Users", current.__row, current);
    appendAudit_(context, "users.upsert", "user", current.user_id, previous, { email: current.email, name: current.name, role: current.role, status: current.status, row_version: current.row_version });
    return { user_id: current.user_id, email: current.email, name: current.name, role: current.role, status: current.status, row_version: current.row_version };
  }
  const record = { user_id: uuid_(), firebase_uid: "", email: email, name: sanitizeText_(payload.name || email, 120), role: role, status: "active", row_version: 1, created_at: nowIso_(), updated_at: nowIso_() };
  appendRow_("Users", record);
  appendAudit_(context, "users.upsert", "user", record.user_id, null, { email: record.email, name: record.name, role: record.role, status: record.status, row_version: record.row_version });
  return { user_id: record.user_id, email: record.email, name: record.name, role: record.role, status: record.status, row_version: record.row_version };
}

function deactivateUser_(context) {
  const current = findBy_("Users", "user_id", context.payload.user_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Anggota aktif tidak ditemukan.", 404);
  if (current.user_id === context.actor.user_id) throw sbError_("SELF_DEACTIVATION_DENIED", "Akun sendiri tidak dapat dinonaktifkan dari aplikasi.", 409);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  if (current.role === "owner" && activeOwnerCount_() <= 1) throw sbError_("LAST_OWNER", "Owner terakhir tidak dapat dinonaktifkan.", 409);
  const previous = publicRow_(current);
  current.status = "inactive";
  current.row_version = rowVersion_(current) + 1;
  current.updated_at = nowIso_();
  updateRow_("Users", current.__row, current);
  appendAudit_(context, "users.deactivate", "user", current.user_id, previous, { email: current.email, role: current.role, status: current.status, row_version: current.row_version });
  return { user_id: current.user_id, email: current.email, role: current.role, status: current.status, row_version: current.row_version };
}
