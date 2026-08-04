const definePolicy = (mode, { maintenanceAllowed = false, idempotencyRequired = false } = {}) => Object.freeze({
  mode,
  maintenanceAllowed,
  idempotencyRequired,
});

const read = (options) => definePolicy("read", options);
const write = (options = {}) => definePolicy("write", { idempotencyRequired: true, ...options });
const external = (options = {}) => definePolicy("external", { idempotencyRequired: true, ...options });

export const ACTION_POLICIES = Object.freeze({
  "system.health": read({ maintenanceAllowed: true }),
  "app.initialState": read(),
  "bootstrap.get": read(),
  "users.list": read(),
  "users.upsert": write(),
  "users.deactivate": write(),
  "users.reactivate": write(),
  "audit.list": read({ maintenanceAllowed: true }),
  "archive.list": read(),
  "dashboard.overview": read(),
  "accounts.list": read(),
  "accounts.create": write(),
  "accounts.update": write(),
  "accounts.previewLifecycle": read(),
  "accounts.archive": write(),
  "accounts.restore": write(),
  "accounts.deleteUnused": write(),
  "categories.list": read(),
  "categories.create": write(),
  "categories.update": write(),
  "categories.previewArchive": read(),
  "categories.archive": write(),
  "categories.restore": write(),
  "transactions.list": read(),
  "transactions.create": write(),
  "transactions.update": write(),
  "transactions.cancel": write(),
  "transactions.restore": write(),
  "envelopes.list": read(),
  "envelopes.create": write(),
  "envelopes.move": write(),
  "envelopes.close": write(),
  "recurring.list": read(),
  "recurring.createRule": write(),
  "recurring.updateRule": write(),
  "recurring.payOccurrence": write(),
  "recurring.reversePayment": write(),
  "budgets.list": read(),
  "budgets.upsert": write(),
  "budgets.archive": write(),
  "goals.list": read(),
  "goals.create": write(),
  "goals.update": write(),
  "goals.move": write(),
  "goals.reverseMovement": write(),
  "reports.monthly": read(),
  "reconciliations.list": read(),
  "reconciliations.create": write(),
  "periods.list": read(),
  "periods.previewClose": read(),
  "periods.close": write(),
  "periods.reopen": write(),
  "notifications.register": write(),
  "notifications.unregister": write(),
  "calendar.sync": write(),
  "mirror.sync": write(),
  "mirror.rebuild": write(),
  "integrations.status": read({ maintenanceAllowed: true }),
  "backup.create": external({ maintenanceAllowed: true }),
  "import.preview": read(),
  "import.apply": external(),
  "restore.preview": read({ maintenanceAllowed: true }),
  "restore.apply": external({ maintenanceAllowed: true }),
  "integrity.run": write({ maintenanceAllowed: true, idempotencyRequired: false }),
});

export const getActionPolicy = (action) => ACTION_POLICIES[action] || null;
export const isReadAction = (action) => getActionPolicy(action)?.mode === "read";
export const isExternalAction = (action) => getActionPolicy(action)?.mode === "external";
export const isMaintenanceAllowedAction = (action) => Boolean(getActionPolicy(action)?.maintenanceAllowed);
export const requiresIdempotencyKey = (action) => Boolean(getActionPolicy(action)?.idempotencyRequired);
export const actionNames = () => Object.keys(ACTION_POLICIES);
