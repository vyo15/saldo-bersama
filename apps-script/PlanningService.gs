function canAccessEnvelopeRule_(context, rule) {
  if (!rule || !canAccessOwnedScope_(context, rule.scope, rule.owner_user_id)) return false;
  if (!rule.source_account_id) return true;
  return canAccessAccount_(context, findBy_("Accounts", "account_id", rule.source_account_id));
}

function canAccessRecurringRule_(context, rule) {
  if (!rule || !canAccessOwnedScope_(context, rule.scope, rule.owner_user_id)) return false;
  return canAccessAccount_(context, findBy_("Accounts", "account_id", rule.default_account_id));
}

function canAccessBudget_(context, budget) {
  if (!budget || !canAccessOwnedScope_(context, budget.scope, budget.owner_user_id)) return false;
  if (!budget.envelope_rule_id) return true;
  return canAccessEnvelopeRule_(context, findBy_("Envelope_Rules", "envelope_rule_id", budget.envelope_rule_id));
}

function canAccessGoal_(context, goal) {
  if (!goal || !canAccessOwnedScope_(context, goal.scope, goal.owner_user_id)) return false;
  return canAccessAccount_(context, findBy_("Accounts", "account_id", goal.account_id));
}

function assertRecurringRuleAccess_(context, rule) {
  if (!canAccessRecurringRule_(context, rule)) throw sbError_("FORBIDDEN_RECURRING", "Jadwal pribadi ini bukan milik pengguna aktif.", 403);
}

function assertGoalAccess_(context, goal) {
  if (!canAccessGoal_(context, goal)) throw sbError_("FORBIDDEN_GOAL", "Target pribadi ini bukan milik pengguna aktif.", 403);
}


function allocationAvailabilitySummary_(context, snapshots) {
  const options = snapshots || {};
  const requestedPeriod = options.period
    || context && context.payload && context.payload.period
    || context && context.payload && context.payload.period_start && String(context.payload.period_start).slice(0, 7)
    || monthKey_();
  const period = periodKey_(requestedPeriod);
  const defaultBounds = monthBounds_(period);
  const startDate = String(options.startDate || defaultBounds.start);
  const endDate = String(options.endDate || defaultBounds.end);
  const cutoffDate = String(options.cutoffDate || periodCutoffDate_(period));
  const transactionInput = options.model || options.transactions || null;
  const model = transactionInput && transactionInput.activeTransactions
    ? transactionInput
    : buildTransactionReadModel_(context, transactionInput);
  const actorKey = context && context.actor
    ? [context.actor.user_id || "", context.actor.role || ""].join(":")
    : "system";
  const cacheKey = ["allocation", actorKey, startDate, endDate, cutoffDate, options.includeArchivedAccounts === true ? "all" : "active"].join(":");
  const cache = requestCache_();
  if (cache.readModels && cache.readModels[cacheKey]) return cache.readModels[cacheKey];

  const protectedTypes = ["emergency_fund", "savings", "sinking_fund"];
  const accountRows = options.accounts || listAccounts_(context, model, cutoffDate);
  const accounts = accountRows.filter(function(account) {
    const statusAllowed = options.includeArchivedAccounts === true || account.status === "active";
    return statusAllowed && protectedTypes.indexOf(String(account.account_type)) === -1;
  });
  const availableByAccount = {};
  let availableBalance = 0;
  accounts.forEach(function(account) {
    const amount = Math.max(0, Number(account.balance || 0));
    availableByAccount[String(account.account_id)] = amount;
    availableBalance += amount;
  });

  const rules = Object.fromEntries(rows_("Envelope_Rules").filter(function(rule) {
    return canAccessEnvelopeRule_(context, rule);
  }).map(function(rule) { return [String(rule.envelope_rule_id), rule]; }));
  const usedByEnvelope = expenseTotalsByEnvelope_(model.transactions, cutoffDate);
  const allocatedByAccount = {};
  let allocatedRemaining = 0;
  rows_("Envelope_Periods").filter(function(envelopePeriod) {
    return envelopePeriod.status === "active"
      && String(envelopePeriod.period_start || "") <= endDate
      && String(envelopePeriod.period_end || "") >= startDate;
  }).forEach(function(envelopePeriod) {
    const rule = rules[String(envelopePeriod.envelope_rule_id)];
    if (!rule) return;
    const remaining = Math.max(0,
      Number(envelopePeriod.allocated_amount || 0)
      - Number(envelopePeriod.reserved_amount || 0)
      - Number(usedByEnvelope[String(envelopePeriod.envelope_period_id)] || 0));
    allocatedRemaining += remaining;
    if (rule.source_account_id) {
      const accountKey = String(rule.source_account_id);
      allocatedByAccount[accountKey] = Number(allocatedByAccount[accountKey] || 0) + remaining;
    }
  });

  const summary = {
    period: period,
    startDate: startDate,
    endDate: endDate,
    cutoffDate: cutoffDate,
    availableBalance: availableBalance,
    allocatedRemaining: allocatedRemaining,
    unallocatedAmount: Math.max(0, availableBalance - allocatedRemaining),
    availableByAccount: availableByAccount,
    allocatedByAccount: allocatedByAccount
  };
  if (!cache.readModels) cache.readModels = {};
  cache.readModels[cacheKey] = summary;
  return summary;
}

function allocationAvailability_(sourceAccountId, context, snapshots) {
  const summary = allocationAvailabilitySummary_(context, snapshots);
  if (!sourceAccountId) {
    return {
      availableBalance: summary.availableBalance,
      allocatedRemaining: summary.allocatedRemaining,
      unallocatedAmount: summary.unallocatedAmount
    };
  }
  const key = String(sourceAccountId);
  const availableBalance = Number(summary.availableByAccount[key] || 0);
  const allocatedRemaining = Number(summary.allocatedByAccount[key] || 0);
  return {
    availableBalance: availableBalance,
    allocatedRemaining: allocatedRemaining,
    // Account-scoped envelopes still consume the same household-wide pool.  An
    // account must never be allowed to allocate more than either its own
    // remaining balance or the global unallocated amount after all envelopes.
    unallocatedAmount: Math.max(0, Math.min(
      availableBalance - allocatedRemaining,
      Number(summary.unallocatedAmount || 0)
    ))
  };
}

function monthBounds_(periodKey) {
  const parts = String(periodKey).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const endDay = new Date(year, month, 0).getDate();
  return { start: periodKey + "-01", end: periodKey + "-" + String(endDay).padStart(2, "0") };
}

function listEnvelopes_(context, transactionSnapshot) {
  const period = periodKey_(context.payload.period);
  const bounds = monthBounds_(period);
  const cutoffDate = periodCutoffDate_(period);
  const model = transactionSnapshot && transactionSnapshot.activeTransactions
    ? transactionSnapshot
    : buildTransactionReadModel_(context, transactionSnapshot || null);
  const usedByEnvelope = expenseTotalsByEnvelope_(model.transactions, cutoffDate);
  const rules = Object.fromEntries(rows_("Envelope_Rules").filter(function(rule) {
    return canAccessEnvelopeRule_(context, rule);
  }).map(function(rule) { return [rule.envelope_rule_id, rule]; }));
  return rows_("Envelope_Periods").filter(function(row) {
    return rules[row.envelope_rule_id] && row.period_start <= bounds.end && row.period_end >= bounds.start;
  }).map(function(row) {
    const rule = rules[row.envelope_rule_id];
    const used = Number(usedByEnvelope[String(row.envelope_period_id)] || 0);
    return Object.assign(publicRow_(row), {
      used_amount: used,
      remaining_amount: Number(row.allocated_amount || 0) - Number(row.reserved_amount || 0) - used,
      scope: rule.scope || "shared",
      owner_user_id: rule.owner_user_id || "",
      source_account_id: rule.source_account_id || "",
      period_type: rule.period_type || "monthly",
      rollover_policy: rule.rollover_policy || "unallocated",
      can_close: context.actor.role === "owner" && row.status === "active"
        && !isPeriodClosed_(row.period_start) && !isPeriodClosed_(row.period_end)
    });
  });
}

function createEnvelopeRule_(context, payloadOverride, options) {
  const payload = payloadOverride || context.payload;
  const settings = options || {};
  let source = null;
  if (payload.source_account_id) {
    source = activeAccount_(payload.source_account_id);
    assertAccountAccess_(context, source);
  }
  const owned = normalizeOwnedScope_(context, payload, source ? ownedScopeFromAccount_(source) : { scope: "shared", owner_user_id: "" });
  if (source && source.owner_scope === "personal" && (owned.scope !== "personal" || String(owned.owner_user_id) !== String(source.owner_user_id))) throw sbError_("SCOPE_ACCOUNT_MISMATCH", "Scope kantong harus sama dengan rekening pribadi sumber.", 400);
  const periodType = sanitizeText_(payload.period_type || "monthly", 30);
  const rolloverPolicy = sanitizeText_(payload.rollover_policy || "unallocated", 40);
  const overspendPolicy = sanitizeText_(payload.overspend_policy || "confirm", 40);
  if (["daily", "weekly", "biweekly", "monthly", "paycycle", "custom"].indexOf(periodType) === -1) throw sbError_("INVALID_PERIOD_TYPE", "Jenis periode kantong tidak valid.", 400);
  if (["none", "carry", "unallocated"].indexOf(rolloverPolicy) === -1) throw sbError_("ROLLOVER_DESTINATION_REQUIRED", "Rollover ke buffer, tabungan, atau dana darurat memerlukan tujuan eksplisit yang belum tersedia. Pilih bawa ke periode berikutnya atau kembali ke dana belum dialokasikan.", 400);
  if (["warn", "confirm", "owner_approval", "deny"].indexOf(overspendPolicy) === -1) throw sbError_("INVALID_OVERSPEND_POLICY", "Kebijakan overspend tidak valid.", 400);
  const record = {
    envelope_rule_id: uuid_(), name: sanitizeText_(payload.name, 100), period_type: periodType,
    scope: owned.scope, owner_user_id: owned.owner_user_id,
    default_amount: intAmount_(payload.default_amount), source_account_id: source ? source.account_id : "",
    rollover_policy: rolloverPolicy, overspend_policy: overspendPolicy,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  if (!record.name) throw sbError_("NAME_REQUIRED", "Nama kantong wajib diisi.", 400);
  if (settings.skipAudit === true) appendRow_("Envelope_Rules", record);
  else appendAuditedRow_("Envelope_Rules", "envelope_rule_id", record, context, "envelopes.createRule", "envelope_rule", null, publicRow_(record));
  return publicRow_(record);
}

function createEnvelopePeriod_(context, payloadOverride, options) {
  const payload = payloadOverride || context.payload;
  const settings = options || {};
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", payload.envelope_rule_id);
  if (!rule || rule.status !== "active") throw sbError_("INVALID_ENVELOPE_RULE", "Aturan kantong tidak aktif.", 400);
  if (!canAccessEnvelopeRule_(context, rule)) throw sbError_("FORBIDDEN_ENVELOPE", "Aturan kantong pribadi ini bukan milik pengguna aktif.", 403);
  const start = validateDate_(payload.period_start);
  const end = validateDate_(payload.period_end);
  if (start > end) throw sbError_("INVALID_PERIOD", "Tanggal mulai periode tidak boleh setelah tanggal akhir.", 400);
  assertPeriodRangeOpen_(start, end);
  const overlap = rows_("Envelope_Periods").find(function(row) { return row.envelope_rule_id === rule.envelope_rule_id && row.status === "active" && row.period_start <= end && row.period_end >= start; });
  if (overlap) throw sbError_("DUPLICATE_PERIOD", "Periode kantong bertumpuk dengan periode aktif yang sudah ada.", 409);
  const allocatedAmount = intAmount_(payload.allocated_amount || rule.default_amount);
  const reservedAmount = Number(payload.reserved_amount || 0);
  if (!Number.isSafeInteger(reservedAmount) || reservedAmount < 0 || reservedAmount > allocatedAmount) throw sbError_("INVALID_RESERVED_AMOUNT", "Dana dipesan harus integer antara nol dan alokasi.", 400);
  const availability = allocationAvailability_(rule.source_account_id || "", context, {
    period: start.slice(0, 7),
    startDate: start,
    endDate: end,
    cutoffDate: periodCutoffDate_(start.slice(0, 7))
  });
  if (allocatedAmount > availability.unallocatedAmount) throw sbError_("INSUFFICIENT_UNALLOCATED_FUNDS", "Alokasi melebihi dana yang belum dialokasikan.", 409, availability);
  const record = {
    envelope_period_id: uuid_(), envelope_rule_id: rule.envelope_rule_id, name: rule.name, period_start: start, period_end: end,
    allocated_amount: allocatedAmount, reserved_amount: reservedAmount,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id,
    updated_at: nowIso_(), closed_by: "", closed_at: ""
  };
  if (settings.skipAudit === true) appendRow_("Envelope_Periods", record);
  else appendAuditedRow_("Envelope_Periods", "envelope_period_id", record, context, "envelopes.createPeriod", "envelope_period", null, publicRow_(record));
  return envelopeUsage_(record, visibleTransactions_(context));
}

function createEnvelope_(context) {
  let rule = null;
  let period = null;
  try {
    rule = createEnvelopeRule_(context, context.payload, { skipAudit: true });
    period = createEnvelopePeriod_(context, {
      envelope_rule_id: rule.envelope_rule_id,
      period_start: context.payload.period_start,
      period_end: context.payload.period_end,
      allocated_amount: context.payload.allocated_amount || context.payload.default_amount,
      reserved_amount: context.payload.reserved_amount || 0
    }, { skipAudit: true });
    appendAudit_(context, "envelopes.create", "envelope", rule.envelope_rule_id, null, { rule: rule, period: period });
    return { rule: rule, period: period };
  } catch (error) {
    if (!rule && !period) throw error;
    compensateOrFailClosed_("envelope_create_compensation_required", {
      action: "envelopes.create",
      envelopeRuleId: rule && rule.envelope_rule_id,
      envelopePeriodId: period && period.envelope_period_id,
      cause: error.code || error.message
    }, function() {
      if (period) {
        const periodRow = findBy_("Envelope_Periods", "envelope_period_id", period.envelope_period_id);
        if (periodRow) deleteRow_("Envelope_Periods", periodRow.__row);
      }
      if (rule) {
        const ruleRow = findBy_("Envelope_Rules", "envelope_rule_id", rule.envelope_rule_id);
        if (ruleRow) deleteRow_("Envelope_Rules", ruleRow.__row);
      }
    });
    if (error && Number(error.status) >= 400 && Number(error.status) < 500) throw error;
    throw sbError_("ENVELOPE_CREATE_ROLLED_BACK", "Pembuatan kantong gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}

function moveEnvelope_(context) {
  const payload = context.payload;
  const from = findBy_("Envelope_Periods", "envelope_period_id", payload.fromEnvelopePeriodId);
  const to = findBy_("Envelope_Periods", "envelope_period_id", payload.toEnvelopePeriodId);
  if (!from || !to || from.status !== "active" || to.status !== "active") throw sbError_("INVALID_ENVELOPE", "Kantong sumber atau tujuan tidak aktif.", 400);
  if (from.envelope_period_id === to.envelope_period_id) throw sbError_("SAME_ENVELOPE", "Kantong sumber dan tujuan harus berbeda.", 400);
  const fromRule = findBy_("Envelope_Rules", "envelope_rule_id", from.envelope_rule_id);
  const toRule = findBy_("Envelope_Rules", "envelope_rule_id", to.envelope_rule_id);
  if (!canAccessEnvelopeRule_(context, fromRule) || !canAccessEnvelopeRule_(context, toRule)) throw sbError_("FORBIDDEN_ENVELOPE", "Kantong pribadi ini bukan milik pengguna aktif.", 403);
  if (String(fromRule.scope || "shared") !== String(toRule.scope || "shared") || String(fromRule.owner_user_id || "") !== String(toRule.owner_user_id || "")) {
    throw sbError_("ENVELOPE_SCOPE_MISMATCH", "Alokasi hanya dapat dipindahkan antar kantong dengan kepemilikan yang sama.", 400);
  }
  assertPeriodRangeOpen_(from.period_start, from.period_end);
  assertPeriodRangeOpen_(to.period_start, to.period_end);
  const amount = intAmount_(payload.amount);
  const visibleTransactions = visibleTransactions_(context);
  const available = envelopeUsage_(from, visibleTransactions).remaining_amount;
  if (amount > available) throw sbError_("INSUFFICIENT_ALLOCATION", "Alokasi melebihi sisa kantong sumber.", 409, { available: available });
  const previousFrom = Object.assign({}, from);
  const previousTo = Object.assign({}, to);
  const updatedFrom = Object.assign({}, from, { allocated_amount: Number(from.allocated_amount) - amount, row_version: rowVersion_(from) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const updatedTo = Object.assign({}, to, { allocated_amount: Number(to.allocated_amount) + amount, row_version: rowVersion_(to) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const movement = { movement_id: uuid_(), from_envelope_period_id: from.envelope_period_id, to_envelope_period_id: to.envelope_period_id, amount: amount, movement_type: "reallocation", reason: sanitizeText_(payload.reason, 160), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_() };
  try {
    updateRow_("Envelope_Periods", from.__row, updatedFrom);
    updateRow_("Envelope_Periods", to.__row, updatedTo);
    appendRow_("Envelope_Movements", movement);
    appendAudit_(context, "envelopes.move", "envelope_movement", movement.movement_id, { from: publicRow_(previousFrom), to: publicRow_(previousTo) }, publicRow_(movement));
  } catch (error) {
    compensateOrFailClosed_("envelope_compensation_required", { action: "envelopes.move", movementId: movement.movement_id, cause: error.code || error.message }, function() {
      updateRow_("Envelope_Periods", previousFrom.__row, previousFrom);
      updateRow_("Envelope_Periods", previousTo.__row, previousTo);
      const inserted = findBy_("Envelope_Movements", "movement_id", movement.movement_id);
      if (inserted) deleteRow_("Envelope_Movements", inserted.__row);
    });
    throw sbError_("ENVELOPE_MOVE_ROLLED_BACK", "Pemindahan alokasi gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { movement: publicRow_(movement), from: envelopeUsage_(updatedFrom, visibleTransactions), to: envelopeUsage_(updatedTo, visibleTransactions) };
}

function addEnvelopeDays_(dateValue, dayCount) {
  const date = new Date(String(dateValue) + "T12:00:00+07:00");
  if (Number.isNaN(date.getTime())) throw sbError_("INVALID_DATE", "Tanggal periode kantong tidak valid.", 400);
  date.setDate(date.getDate() + Number(dayCount || 0));
  return Utilities.formatDate(date, SB_TIMEZONE, "yyyy-MM-dd");
}

function envelopePeriodDurationDays_(startDate, endDate) {
  const start = new Date(String(startDate) + "T12:00:00+07:00");
  const end = new Date(String(endDate) + "T12:00:00+07:00");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (!Number.isSafeInteger(days) || days < 1 || days > 366) throw sbError_("INVALID_PERIOD", "Durasi periode kantong tidak valid.", 400);
  return days;
}

function nextEnvelopePeriodBounds_(rule, current) {
  const nextStart = addEnvelopeDays_(current.period_end, 1);
  const periodType = String(rule.period_type || "monthly");
  if (periodType === "monthly") return monthBounds_(nextStart.slice(0, 7));
  const fixedDurations = { daily: 1, weekly: 7, biweekly: 14 };
  const duration = fixedDurations[periodType] || envelopePeriodDurationDays_(current.period_start, current.period_end);
  return { start: nextStart, end: addEnvelopeDays_(nextStart, duration - 1) };
}

function closeEnvelope_(context) {
  const current = findBy_("Envelope_Periods", "envelope_period_id", context.payload.envelope_period_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Periode kantong aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", current.envelope_rule_id);
  if (!rule || !canAccessEnvelopeRule_(context, rule)) throw sbError_("FORBIDDEN_ENVELOPE", "Kantong pribadi ini bukan milik pengguna aktif.", 403);
  assertPeriodRangeOpen_(current.period_start, current.period_end);

  const visibleTransactions = visibleTransactions_(context);
  const unallocated = visibleTransactions.filter(function(row) {
    if (row.status !== "active" || row.transaction_type !== "expense" || row.envelope_period_id || row.transaction_date < current.period_start || row.transaction_date > current.period_end) return false;
    if (String(row.scope || "shared") !== String(rule.scope || "shared")) return false;
    return rule.scope !== "personal" || String(row.owner_user_id || "") === String(rule.owner_user_id || "");
  });
  if (unallocated.length) throw sbError_("UNALLOCATED_EXPENSES", "Periode belum dapat ditutup karena ada pengeluaran belum dialokasikan.", 409, { count: unallocated.length });

  const usageBefore = envelopeUsage_(current, visibleTransactions);
  const remaining = Math.max(0, Number(usageBefore.remaining_amount || 0));
  const rolloverPolicy = String(rule.rollover_policy || "unallocated");
  if (["buffer", "savings", "emergency"].indexOf(rolloverPolicy) !== -1 && remaining > 0) {
    throw sbError_("ROLLOVER_DESTINATION_REQUIRED", "Sisa kantong harus dipindahkan manual ke kantong tujuan sebelum periode ditutup karena aturan rollover belum memiliki tujuan eksplisit.", 409, { remainingAmount: remaining, rolloverPolicy: rolloverPolicy });
  }

  const updatedCurrent = Object.assign({}, current, {
    status: "closed", closed_by: context.actor.user_id, closed_at: nowIso_(),
    row_version: rowVersion_(current) + 1, updated_at: nowIso_(), updated_by: context.actor.user_id
  });
  let nextPrevious = null;
  let nextUpdated = null;
  let nextCreated = null;
  let movement = null;

  try {
    if (rolloverPolicy === "carry" && remaining > 0) {
      const bounds = nextEnvelopePeriodBounds_(rule, current);
      assertPeriodRangeOpen_(bounds.start, bounds.end);
      const overlapping = rows_("Envelope_Periods").filter(function(row) {
        return row.envelope_rule_id === rule.envelope_rule_id && row.status === "active"
          && row.period_start <= bounds.end && row.period_end >= bounds.start;
      });
      const exactNext = overlapping.find(function(row) {
        return row.period_start === bounds.start && row.period_end === bounds.end;
      }) || null;
      if (overlapping.length && !exactNext) throw sbError_("DUPLICATE_PERIOD", "Rollover tidak dapat dibuat karena periode berikutnya bertumpuk dengan periode aktif lain.", 409);

      if (exactNext) {
        const availability = allocationAvailability_(rule.source_account_id || "", context, {
          period: bounds.start.slice(0, 7), startDate: bounds.start, endDate: bounds.end,
          cutoffDate: periodCutoffDate_(bounds.start.slice(0, 7))
        });
        if (remaining > Number(availability.unallocatedAmount || 0)) {
          throw sbError_("INSUFFICIENT_UNALLOCATED_FUNDS", "Sisa kantong tidak dapat dibawa karena dana belum dialokasikan periode berikutnya tidak mencukupi.", 409, availability);
        }
        nextPrevious = Object.assign({}, exactNext);
        nextUpdated = Object.assign({}, exactNext, {
          allocated_amount: Number(exactNext.allocated_amount || 0) + remaining,
          row_version: rowVersion_(exactNext) + 1,
          updated_by: context.actor.user_id,
          updated_at: nowIso_()
        });
        updateRow_("Envelope_Periods", exactNext.__row, nextUpdated);
      } else {
        const createdUsage = createEnvelopePeriod_(context, {
          envelope_rule_id: rule.envelope_rule_id,
          period_start: bounds.start,
          period_end: bounds.end,
          allocated_amount: remaining,
          reserved_amount: 0
        }, { skipAudit: true });
        nextCreated = findBy_("Envelope_Periods", "envelope_period_id", createdUsage.envelope_period_id);
        nextUpdated = nextCreated;
      }

      movement = {
        movement_id: uuid_(),
        from_envelope_period_id: current.envelope_period_id,
        to_envelope_period_id: nextUpdated.envelope_period_id,
        amount: remaining,
        movement_type: "rollover",
        reason: "Sisa periode dibawa otomatis ke periode berikutnya.",
        status: "active", row_version: 1,
        created_by: context.actor.user_id, created_at: nowIso_()
      };
      appendRow_("Envelope_Movements", movement);
    }

    updateRow_("Envelope_Periods", current.__row, updatedCurrent);
    const rollover = {
      policy: rolloverPolicy,
      amount: rolloverPolicy === "carry" ? remaining : 0,
      destination_envelope_period_id: nextUpdated ? nextUpdated.envelope_period_id : "",
      released_to_unallocated: rolloverPolicy !== "carry" ? remaining : 0
    };
    appendAudit_(context, "envelopes.close", "envelope_period", updatedCurrent.envelope_period_id,
      { period: publicRow_(current), usage: usageBefore },
      { period: publicRow_(updatedCurrent), rollover: rollover, movement: movement ? publicRow_(movement) : null });
    return Object.assign(envelopeUsage_(updatedCurrent, visibleTransactions), { rollover: rollover });
  } catch (error) {
    compensateOrFailClosed_("envelope_close_compensation_required", {
      action: "envelopes.close",
      envelopePeriodId: current.envelope_period_id,
      nextEnvelopePeriodId: nextUpdated && nextUpdated.envelope_period_id,
      movementId: movement && movement.movement_id,
      cause: error.code || error.message
    }, function() {
      const insertedMovement = movement && findBy_("Envelope_Movements", "movement_id", movement.movement_id);
      if (insertedMovement) deleteRow_("Envelope_Movements", insertedMovement.__row);
      if (nextCreated) {
        const insertedNext = findBy_("Envelope_Periods", "envelope_period_id", nextCreated.envelope_period_id);
        if (insertedNext) deleteRow_("Envelope_Periods", insertedNext.__row);
      } else if (nextPrevious) {
        const currentNext = findBy_("Envelope_Periods", "envelope_period_id", nextPrevious.envelope_period_id);
        if (currentNext) updateRow_("Envelope_Periods", currentNext.__row, nextPrevious);
      }
      const currentAfterFailure = findBy_("Envelope_Periods", "envelope_period_id", current.envelope_period_id);
      if (currentAfterFailure) updateRow_("Envelope_Periods", currentAfterFailure.__row, current);
    });
    if (error && Number(error.status) >= 400 && Number(error.status) < 500) throw error;
    throw sbError_("ENVELOPE_CLOSE_ROLLED_BACK", "Penutupan kantong gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}

function recurringDueDates_(rule, periodKey) {
  const parts = String(periodKey).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);
  const start = new Date(String(rule.start_date) + "T00:00:00+07:00");
  const end = rule.end_date ? new Date(String(rule.end_date) + "T23:59:59+07:00") : null;
  if (monthEnd < start || (end && monthStart > end)) return [];
  const frequency = String(rule.frequency || "monthly");
  const dates = [];
  const pushDate = function(date) {
    if (date < start || (end && date > end)) return;
    dates.push(Utilities.formatDate(date, SB_TIMEZONE, "yyyy-MM-dd"));
  };
  if (frequency === "daily") {
    for (let day = 1; day <= daysInMonth; day += 1) pushDate(new Date(year, month - 1, day));
    return dates;
  }
  if (frequency === "weekly" || frequency === "biweekly") {
    const intervalDays = frequency === "weekly" ? 7 : 14;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const candidate = new Date(year, month - 1, day);
      const differenceDays = Math.round((candidate.getTime() - start.getTime()) / 86400000);
      if (differenceDays >= 0 && differenceDays % intervalDays === 0) pushDate(candidate);
    }
    return dates;
  }
  const monthIntervals = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };
  const interval = monthIntervals[frequency] || 1;
  const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
  const currentMonthIndex = year * 12 + (month - 1);
  if (currentMonthIndex < startMonthIndex || (currentMonthIndex - startMonthIndex) % interval !== 0) return dates;
  const dueDay = Math.max(1, Math.min(daysInMonth, Number(rule.due_day || 1)));
  pushDate(new Date(year, month - 1, dueDay));
  return dates;
}

function generateRecurringOccurrencesUnlocked_(periodKey, recurringRuleIds) {
  const allowed = recurringRuleIds && recurringRuleIds.length ? new Set(recurringRuleIds.map(String)) : null;
  const rules = rows_("Recurring_Rules").filter(function(row) {
    return row.status === "active" && (!allowed || allowed.has(String(row.recurring_rule_id)));
  });
  const existingKeys = new Set(rows_("Recurring_Occurrences").map(function(row) {
    return String(row.recurring_rule_id) + ":" + String(row.due_date);
  }));
  let generated = 0;
  rules.forEach(function(rule) {
    recurringDueDates_(rule, periodKey).forEach(function(dueDate) {
      const key = String(rule.recurring_rule_id) + ":" + dueDate;
      if (existingKeys.has(key)) return;
      appendRow_("Recurring_Occurrences", {
        occurrence_id: uuid_(), recurring_rule_id: rule.recurring_rule_id, period_key: periodKey,
        due_date: dueDate, expected_amount: Number(rule.expected_amount || 0),
        actual_amount: 0, status: rule.kind === "income" ? "expected" : "scheduled", transaction_ids: "", calendar_event_id: "",
        row_version: 1, created_at: nowIso_(), updated_at: nowIso_()
      });
      existingKeys.add(key);
      generated += 1;
    });
  });
  return generated;
}

function ensureRecurringOccurrences_(periodKey) {
  // Read actions must not create derived rows while maintenance/recovery is active.
  if (getConfig_("maintenance_mode") === "true") return;
  const lock = LockService.getScriptLock();
  const alreadyHeld = lock.hasLock();
  if (!alreadyHeld && !lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Jadwal sedang dibuat oleh proses lain. Coba kembali.", 409);
  try { return generateRecurringOccurrencesUnlocked_(periodKey); }
  finally { if (!alreadyHeld) lock.releaseLock(); }
}

function listRecurring_(context) {
  const period = periodKey_(context.payload.period);
  const cutoffDate = periodCutoffDate_(period);
  const historicalPeriod = period < monthKey_();
  const rules = Object.fromEntries(rows_("Recurring_Rules").filter(function(rule) {
    return canAccessRecurringRule_(context, rule);
  }).map(function(row) { return [row.recurring_rule_id, row]; }));
  const transactionModel = buildTransactionReadModel_(context);
  const transactionById = transactionModel.transactionById || {};
  return rows_("Recurring_Occurrences").filter(function(row) { return row.period_key === period; }).map(function(row) {
    const rule = rules[row.recurring_rule_id];
    if (!rule) return null;
    const linkedTransactionIds = String(row.transaction_ids || "").split(",").map(function(value) { return value.trim(); }).filter(Boolean);
    const lastLinkedTransaction = linkedTransactionIds.length ? transactionById[linkedTransactionIds[linkedTransactionIds.length - 1]] : null;
    const dueDatePassed = historicalPeriod ? row.due_date <= cutoffDate : row.due_date < cutoffDate;
    const derivedStatus = !["paid", "received", "partial", "cancelled"].includes(row.status) && dueDatePassed
      ? (rule.kind === "income" ? "late" : "overdue")
      : row.status;
    const dueDateUnlocked = !isTransactionDateLocked_(row.due_date);
    const linkedTransactionUnlocked = !lastLinkedTransaction || !isTransactionDateLocked_(lastLinkedTransaction.transaction_date);
    return Object.assign(publicRow_(row), {
      status: derivedStatus,
      name: rule.name || "Jadwal",
      kind: rule.kind || "expense",
      category_id: rule.category_id || "",
      default_account_id: rule.default_account_id || "",
      frequency: rule.frequency || "monthly",
      payment_method: rule.payment_method || "transfer",
      auto_debit: rule.auto_debit,
      start_date: rule.start_date || "",
      end_date: rule.end_date || "",
      priority: rule.priority || "normal",
      rule_status: rule.status || "active",
      rule_row_version: rule.row_version,
      scope: rule.scope || "shared",
      owner_user_id: rule.owner_user_id || "",
      can_pay: rule.status === "active" && dueDateUnlocked && !["paid", "received", "cancelled"].includes(row.status),
      can_reverse: Boolean(dueDateUnlocked && linkedTransactionUnlocked && lastLinkedTransaction && lastLinkedTransaction.status === "active"
        && (context.actor.role === "owner" || String(lastLinkedTransaction.created_by || "") === String(context.actor.user_id))),
      can_edit_rule: context.actor.role === "owner",
      can_archive_rule: context.actor.role === "owner" && rule.status === "active"
    });
  }).filter(Boolean);
}

function recurringRuleRecord_(context, payload, current) {
  const base = current ? Object.assign({}, current) : {};
  const kind = current ? current.kind : String(payload.kind || "");
  if (["income", "expense"].indexOf(kind) === -1) throw sbError_("INVALID_RECURRING_KIND", "Jenis jadwal harus income atau expense.", 400);
  const name = sanitizeText_(payload.name === undefined ? base.name : payload.name, 100);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama jadwal wajib diisi.", 400);
  const frequency = String(payload.frequency === undefined ? (base.frequency || "monthly") : payload.frequency);
  if (!["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw sbError_("INVALID_FREQUENCY", "Frekuensi jadwal tidak valid.", 400);
  const categoryId = payload.category_id === undefined ? base.category_id : payload.category_id;
  activeCategory_(categoryId, kind);
  const dueDay = Number(payload.due_day === undefined ? (base.due_day || 1) : payload.due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw sbError_("INVALID_DUE_DAY", "Tanggal jatuh tempo harus 1-31.", 400);
  const startDate = validateDate_(payload.start_date === undefined ? (base.start_date || today_()) : payload.start_date);
  const endRaw = payload.end_date === undefined ? (base.end_date || "") : payload.end_date;
  const endDate = endRaw ? validateDate_(endRaw) : "";
  if (endDate && endDate < startDate) throw sbError_("INVALID_DATE_RANGE", "Tanggal akhir jadwal tidak boleh sebelum tanggal mulai.", 400);
  const accountId = payload.default_account_id === undefined ? base.default_account_id : payload.default_account_id;
  const account = activeAccount_(accountId);
  assertAccountAccess_(context, account);
  const owned = normalizeOwnedScope_(context, payload, current ? { scope: current.scope || "shared", owner_user_id: current.owner_user_id || "" } : ownedScopeFromAccount_(account));
  if (owned.scope === "shared" && account.owner_scope === "personal") throw sbError_("SCOPE_ACCOUNT_MISMATCH", "Jadwal bersama tidak boleh memakai rekening pribadi.", 400);
  if (owned.scope === "personal" && account.owner_scope === "personal" && String(owned.owner_user_id) !== String(account.owner_user_id)) throw sbError_("SCOPE_OWNER_MISMATCH", "Owner jadwal dan rekening pribadi harus sama.", 400);
  const priority = sanitizeText_(payload.priority === undefined ? (base.priority || "normal") : payload.priority, 20);
  if (!["low", "normal", "high"].includes(priority)) throw sbError_("INVALID_PRIORITY", "Prioritas jadwal tidak valid.", 400);
  const status = sanitizeText_(payload.status === undefined ? (base.status || "active") : payload.status, 20);
  if (!["active", "archived"].includes(status)) throw sbError_("INVALID_STATUS", "Status jadwal tidak valid.", 400);
  return Object.assign({}, base, {
    recurring_rule_id: current ? current.recurring_rule_id : uuid_(),
    name: name,
    kind: kind,
    category_id: categoryId || "",
    expected_amount: payload.expected_amount === undefined ? Number(base.expected_amount || 0) : intAmount_(payload.expected_amount),
    frequency: frequency,
    due_day: dueDay,
    default_account_id: account.account_id,
    payment_method: sanitizeText_(payload.payment_method === undefined ? (base.payment_method || "transfer") : payload.payment_method, 40),
    auto_debit: payload.auto_debit === undefined ? Boolean(base.auto_debit) : strictBoolean_(payload.auto_debit, "auto_debit", base.auto_debit),
    start_date: startDate,
    end_date: endDate,
    priority: priority,
    status: status,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id
  });
}

function removePendingOccurrencesForRulePeriod_(ruleId, periodKey) {
  const removable = rows_("Recurring_Occurrences").filter(function(row) {
    return String(row.recurring_rule_id) === String(ruleId)
      && String(row.period_key) === String(periodKey)
      && !["paid", "received", "partial", "cancelled"].includes(row.status)
      && !String(row.transaction_ids || "").trim();
  });
  deleteRowsDescending_("Recurring_Occurrences", removable.map(function(row) { return row.__row; }));
  return removable.length;
}

function createRecurringRule_(context) {
  let record = null;
  let generated = 0;
  try {
    record = recurringRuleRecord_(context, context.payload, null);
    record.row_version = 1;
    record.created_by = context.actor.user_id;
    record.created_at = nowIso_();
    record.updated_by = context.actor.user_id;
    record.updated_at = nowIso_();
    appendRow_("Recurring_Rules", record);
    generated = generateRecurringOccurrencesUnlocked_(monthKey_(), [record.recurring_rule_id]);
    appendAudit_(context, "recurring.createRule", "recurring_rule", record.recurring_rule_id, null, { rule: publicRow_(record), generatedOccurrences: generated });
    return Object.assign(publicRow_(record), { generated_occurrences: generated });
  } catch (error) {
    if (!record) throw error;
    compensateOrFailClosed_("recurring_create_compensation_required", { action: "recurring.createRule", recurringRuleId: record.recurring_rule_id, cause: error.code || error.message }, function() {
      const occurrences = rows_("Recurring_Occurrences").filter(function(row) { return String(row.recurring_rule_id) === String(record.recurring_rule_id); });
      deleteRowsDescending_("Recurring_Occurrences", occurrences.map(function(row) { return row.__row; }));
      const rule = findBy_("Recurring_Rules", "recurring_rule_id", record.recurring_rule_id);
      if (rule) deleteRow_("Recurring_Rules", rule.__row);
    });
    throw sbError_("RECURRING_CREATE_ROLLED_BACK", "Pembuatan jadwal gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}


const SB_RECURRING_BUSINESS_FIELDS = Object.freeze([
  "name", "kind", "category_id", "expected_amount", "frequency", "due_day",
  "default_account_id", "payment_method", "auto_debit", "start_date", "end_date",
  "priority", "scope", "owner_user_id"
]);

function recurringBusinessChanged_(current, updated) {
  return SB_RECURRING_BUSINESS_FIELDS.some(function(field) {
    return canonicalJson_(current[field] === undefined ? "" : current[field])
      !== canonicalJson_(updated[field] === undefined ? "" : updated[field]);
  });
}

function recurringHasClosedHistory_(ruleId) {
  return rows_("Recurring_Occurrences").some(function(occurrence) {
    return String(occurrence.recurring_rule_id) === String(ruleId)
      && isTransactionDateLocked_(occurrence.due_date);
  });
}

const SB_RECURRING_LINKED_IDENTITY_FIELDS = Object.freeze([
  "category_id", "default_account_id", "scope", "owner_user_id"
]);

function recurringFinancialIdentityChanged_(current, updated) {
  return SB_RECURRING_LINKED_IDENTITY_FIELDS.some(function(field) {
    return String(current[field] || "") !== String(updated[field] || "");
  });
}

function recurringHasLinkedTransactions_(ruleId) {
  const occurrenceIds = new Set(rows_("Recurring_Occurrences").filter(function(occurrence) {
    return String(occurrence.recurring_rule_id || "") === String(ruleId || "");
  }).map(function(occurrence) { return String(occurrence.occurrence_id || ""); }));
  if (!occurrenceIds.size) return false;
  return rows_("Transactions").some(function(transaction) {
    return occurrenceIds.has(String(transaction.recurring_occurrence_id || ""));
  });
}

function updateRecurringRule_(context) {
  const current = findBy_("Recurring_Rules", "recurring_rule_id", context.payload.recurring_rule_id);
  if (!current) throw sbError_("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertRecurringRuleAccess_(context, current);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const updated = recurringRuleRecord_(context, context.payload, current);
  if (recurringBusinessChanged_(current, updated) && recurringHasClosedHistory_(current.recurring_rule_id)) {
    throw sbError_("RECURRING_RULE_HISTORY_LOCKED", "Aturan rutin memiliki histori pada periode tertutup. Arsipkan aturan lama dan buat aturan baru untuk perubahan berikutnya.", 409);
  }
  if (recurringFinancialIdentityChanged_(current, updated) && recurringHasLinkedTransactions_(current.recurring_rule_id)) {
    throw sbError_("RECURRING_RULE_LINKED_IDENTITY_LOCKED", "Kategori, rekening, atau kepemilikan jadwal tidak dapat diubah setelah memiliki transaksi terkait. Arsipkan aturan lama dan buat aturan baru.", 409);
  }
  updated.row_version = rowVersion_(current) + 1;
  updated.updated_by = context.actor.user_id;
  updated.updated_at = nowIso_();
  const period = monthKey_();
  const previousOccurrences = rows_("Recurring_Occurrences").filter(function(row) {
    return String(row.recurring_rule_id) === String(current.recurring_rule_id) && String(row.period_key) === period;
  });
  try {
    updateRow_("Recurring_Rules", current.__row, updated);
    const currentPeriodLocked = isTransactionDateLocked_(period + "-01");
    const removed = currentPeriodLocked ? 0 : removePendingOccurrencesForRulePeriod_(updated.recurring_rule_id, period);
    const generated = !currentPeriodLocked && updated.status === "active" ? generateRecurringOccurrencesUnlocked_(period, [updated.recurring_rule_id]) : 0;
    appendAudit_(context, "recurring.updateRule", "recurring_rule", updated.recurring_rule_id, publicRow_(current), {
      rule: publicRow_(updated),
      removedPendingOccurrences: removed,
      generatedOccurrences: generated,
      currentPeriodLocked: currentPeriodLocked
    });
    return Object.assign(publicRow_(updated), { generated_occurrences: generated });
  } catch (error) {
    compensateOrFailClosed_("recurring_update_compensation_required", { action: "recurring.updateRule", recurringRuleId: current.recurring_rule_id, cause: error.code || error.message }, function() {
      updateRow_("Recurring_Rules", current.__row, current);
      const currentRows = rows_("Recurring_Occurrences").filter(function(row) {
        return String(row.recurring_rule_id) === String(current.recurring_rule_id) && String(row.period_key) === period;
      });
      deleteRowsDescending_("Recurring_Occurrences", currentRows.map(function(row) { return row.__row; }));
      previousOccurrences.forEach(function(row) { appendRow_("Recurring_Occurrences", publicRow_(row)); });
    });
    if (error && Number(error.status) >= 400 && Number(error.status) < 500) throw error;
    throw sbError_("RECURRING_UPDATE_ROLLED_BACK", "Perubahan jadwal gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}

function payOccurrence_(context) {
  const occurrence = findBy_("Recurring_Occurrences", "occurrence_id", context.payload.occurrence_id);
  if (!occurrence || ["paid", "received", "cancelled"].includes(occurrence.status)) throw sbError_("INVALID_OCCURRENCE", "Jadwal tidak ditemukan atau sudah selesai.", 409);
  assertVersion_(occurrence, context.rowVersion || context.payload.row_version);
  assertTransactionDateUnlocked_(occurrence.due_date);
  const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
  if (!rule || rule.status !== "active") throw sbError_("INVALID_RECURRING_RULE", "Aturan rutin tidak ditemukan atau tidak aktif.", 400);
  assertRecurringRuleAccess_(context, rule);
  let transaction = null;
  const previousOccurrence = Object.assign({}, occurrence);
  try {
    transaction = createTransaction_(context, {
      transaction_date: context.payload.transaction_date || today_(), transaction_type: rule.kind === "income" ? "income" : "expense",
      source_account_id: rule.kind === "income" ? "" : (context.payload.account_id || rule.default_account_id),
      destination_account_id: rule.kind === "income" ? (context.payload.account_id || rule.default_account_id) : "",
      category_id: rule.category_id, recurring_occurrence_id: occurrence.occurrence_id,
      amount: context.payload.amount || occurrence.expected_amount, description: rule.name,
      payment_method: rule.payment_method, scope: rule.scope || "shared", owner_user_id: rule.owner_user_id || "", confirm_duplicate: true
    }, { skipAudit: true, allowInternalLinks: true });
    const updatedOccurrence = Object.assign({}, occurrence, {
      actual_amount: Number(occurrence.actual_amount || 0) + Number(transaction.amount),
      transaction_ids: [String(occurrence.transaction_ids || ""), transaction.transaction_id].filter(Boolean).join(","),
      row_version: rowVersion_(occurrence) + 1,
      updated_at: nowIso_()
    });
    updatedOccurrence.status = updatedOccurrence.actual_amount >= Number(occurrence.expected_amount || 0) ? (rule.kind === "income" ? "received" : "paid") : "partial";
    updateRow_("Recurring_Occurrences", occurrence.__row, updatedOccurrence);
    appendAudit_(context, "recurring.payOccurrence", "recurring_occurrence", occurrence.occurrence_id, { occurrence: publicRow_(previousOccurrence), transaction: null }, { occurrence: publicRow_(updatedOccurrence), transaction: transaction });
    return { occurrence: publicRow_(updatedOccurrence), transaction: transaction };
  } catch (error) {
    if (!transaction) throw error;
    compensateOrFailClosed_("recurring_payment_compensation_required", { action: "recurring.payOccurrence", occurrenceId: occurrence.occurrence_id, transactionId: transaction && transaction.transaction_id, cause: error.code || error.message }, function() {
      updateRow_("Recurring_Occurrences", previousOccurrence.__row, previousOccurrence);
      if (transaction && transaction.transaction_id) {
        const transactionRow = findBy_("Transactions", "transaction_id", transaction.transaction_id);
        if (transactionRow) deleteRow_("Transactions", transactionRow.__row);
      }
    });
    if (error && Number(error.status) >= 400 && Number(error.status) < 500) throw error;
    throw sbError_("RECURRING_PAYMENT_ROLLED_BACK", "Pembayaran jadwal gagal dan transaksi terkait telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}

function reverseOccurrencePayment_(context) {
  const payload = context.payload;
  const occurrence = findBy_("Recurring_Occurrences", "occurrence_id", payload.occurrence_id);
  if (!occurrence) throw sbError_("NOT_FOUND", "Jadwal tidak ditemukan.", 404);
  assertVersion_(occurrence, context.rowVersion || payload.row_version);
  assertTransactionDateUnlocked_(occurrence.due_date);
  const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
  if (!rule) throw sbError_("INVALID_RECURRING_RULE", "Aturan rutin tidak ditemukan.", 400);
  assertRecurringRuleAccess_(context, rule);
  const transaction = findBy_("Transactions", "transaction_id", payload.transaction_id);
  if (!transaction || transaction.status !== "active" || transaction.recurring_occurrence_id !== occurrence.occurrence_id) throw sbError_("INVALID_LINKED_TRANSACTION", "Transaksi pembayaran aktif tidak ditemukan pada jadwal ini.", 409);
  assertCanModifyTransaction_(context, transaction);
  assertTransactionDateUnlocked_(transaction.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan pembayaran wajib diisi.", 400);
  const previousOccurrence = Object.assign({}, occurrence);
  const previousTransaction = Object.assign({}, transaction);
  const updatedTransaction = Object.assign({}, transaction, { status: "cancelled", cancelled_by: context.actor.user_id, cancelled_at: nowIso_(), cancellation_reason: reason, row_version: rowVersion_(transaction) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const remainingTransactions = rows_("Transactions").filter(function(row) { return row.status === "active" && row.recurring_occurrence_id === occurrence.occurrence_id && row.transaction_id !== transaction.transaction_id; });
  const actualAmount = remainingTransactions.reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const updatedOccurrence = Object.assign({}, occurrence, {
    actual_amount: actualAmount,
    transaction_ids: remainingTransactions.map(function(row) { return row.transaction_id; }).join(","),
    status: actualAmount <= 0 ? (rule.kind === "income" ? "expected" : "scheduled") : actualAmount >= Number(occurrence.expected_amount || 0) ? (rule.kind === "income" ? "received" : "paid") : "partial",
    row_version: rowVersion_(occurrence) + 1,
    updated_at: nowIso_()
  });
  try {
    updateRow_("Transactions", transaction.__row, updatedTransaction);
    updateRow_("Recurring_Occurrences", occurrence.__row, updatedOccurrence);
    appendAudit_(context, "recurring.reversePayment", "recurring_occurrence", occurrence.occurrence_id, { occurrence: publicRow_(previousOccurrence), transaction: publicRow_(previousTransaction) }, { occurrence: publicRow_(updatedOccurrence), transaction: publicRow_(updatedTransaction), reason: reason });
  } catch (error) {
    compensateOrFailClosed_("recurring_reverse_compensation_required", { action: "recurring.reversePayment", occurrenceId: occurrence.occurrence_id, transactionId: transaction.transaction_id, cause: error.code || error.message }, function() {
      updateRow_("Transactions", previousTransaction.__row, previousTransaction);
      updateRow_("Recurring_Occurrences", previousOccurrence.__row, previousOccurrence);
    });
    if (error && Number(error.status) >= 400 && Number(error.status) < 500) throw error;
    throw sbError_("RECURRING_REVERSE_ROLLED_BACK", "Pembatalan pembayaran gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { occurrence: publicRow_(updatedOccurrence), transaction: publicRow_(updatedTransaction) };
}

function listBudgets_(context) {
  const period = periodKey_(context.payload.period);
  const cutoffDate = periodCutoffDate_(period);
  const model = buildTransactionReadModel_(context);
  const usedByBudgetKey = {};
  (model.activeTransactionsByPeriod[period] || []).forEach(function(transaction) {
    if (transaction.status !== "active" || transaction.transaction_type !== "expense" || String(transaction.transaction_date || "") > cutoffDate) return;
    const key = [
      String(transaction.category_id || ""),
      String(transaction.scope || "shared"),
      String(transaction.owner_user_id || "")
    ].join(":");
    usedByBudgetKey[key] = Number(usedByBudgetKey[key] || 0) + Number(transaction.amount || 0);
  });
  return rows_("Budgets").filter(function(row) {
    return row.period_key === period && row.status === "active" && canAccessBudget_(context, row);
  }).map(function(row) {
    const key = [
      String(row.category_id || ""),
      String(row.scope || "shared"),
      String(row.owner_user_id || "")
    ].join(":");
    return Object.assign(publicRow_(row), { used_amount: Number(usedByBudgetKey[key] || 0) });
  });
}

function upsertBudget_(context) {
  const payload = context.payload;
  const period = String(payload.period_key || monthKey_());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw sbError_("INVALID_PERIOD", "Periode budget harus menggunakan format YYYY-MM.", 400);
  assertPeriodOpen_(period + "-01");
  const warningThreshold = Number(payload.warning_threshold === undefined ? 80 : payload.warning_threshold);
  if (!Number.isInteger(warningThreshold) || warningThreshold < 1 || warningThreshold > 100) throw sbError_("INVALID_WARNING_THRESHOLD", "Ambang peringatan budget harus integer 1-100.", 400);
  const category = activeCategory_(payload.category_id, "expense");
  let envelopeRule = null;
  if (payload.envelope_rule_id) {
    envelopeRule = findBy_("Envelope_Rules", "envelope_rule_id", payload.envelope_rule_id);
    if (!envelopeRule || envelopeRule.status !== "active") throw sbError_("INVALID_ENVELOPE_RULE", "Aturan kantong budget tidak aktif.", 400);
    if (!canAccessEnvelopeRule_(context, envelopeRule)) throw sbError_("FORBIDDEN_ENVELOPE", "Aturan kantong budget tidak dapat diakses.", 403);
  }
  const fallback = envelopeRule
    ? { scope: envelopeRule.scope || "shared", owner_user_id: envelopeRule.owner_user_id || "" }
    : { scope: "shared", owner_user_id: "" };
  const owned = normalizeOwnedScope_(context, payload, fallback);
  if (envelopeRule && (String(owned.scope) !== String(envelopeRule.scope || "shared") || String(owned.owner_user_id || "") !== String(envelopeRule.owner_user_id || ""))) {
    throw sbError_("BUDGET_SCOPE_MISMATCH", "Scope budget harus sama dengan aturan kantong terkait.", 400);
  }
  const matches = rows_("Budgets").filter(function(row) {
    return row.period_key === period
      && row.category_id === category.category_id
      && String(row.scope || "shared") === owned.scope
      && String(row.owner_user_id || "") === owned.owner_user_id;
  });
  const activeMatches = matches.filter(function(row) { return row.status === "active"; });
  if (activeMatches.length > 1) {
    throw sbError_("DUPLICATE_ACTIVE_BUDGET", "Terdapat lebih dari satu budget aktif untuk periode, kategori, dan pemilik yang sama. Jalankan integrity check sebelum melanjutkan.", 409, {
      periodKey: period,
      categoryId: category.category_id,
      budgetIds: activeMatches.map(function(row) { return row.budget_id; })
    });
  }
  const current = activeMatches[0] || matches.sort(function(left, right) {
    return String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || ""));
  })[0] || null;
  if (current) {
    assertVersion_(current, context.rowVersion || payload.row_version);
    const updated = Object.assign({}, current, {
      envelope_rule_id: envelopeRule ? envelopeRule.envelope_rule_id : "",
      amount: intAmount_(payload.amount),
      warning_threshold: warningThreshold,
      status: "active",
      scope: owned.scope,
      owner_user_id: owned.owner_user_id,
      row_version: rowVersion_(current) + 1,
      updated_by: context.actor.user_id,
      updated_at: nowIso_()
    });
    updateAuditedRow_("Budgets", current, updated, context, "budgets.upsert", "budget", updated.budget_id);
    return publicRow_(updated);
  }
  const record = {
    budget_id: uuid_(), period_key: period, category_id: category.category_id,
    envelope_rule_id: envelopeRule ? envelopeRule.envelope_rule_id : "", name: category.name,
    amount: intAmount_(payload.amount), warning_threshold: warningThreshold,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_(),
    scope: owned.scope, owner_user_id: owned.owner_user_id
  };
  appendAuditedRow_("Budgets", "budget_id", record, context, "budgets.upsert", "budget", null, publicRow_(record));
  return publicRow_(record);
}

function archiveBudget_(context) {
  const current = findBy_("Budgets", "budget_id", context.payload.budget_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Budget aktif tidak ditemukan.", 404);
  if (!canAccessBudget_(context, current)) throw sbError_("FORBIDDEN_BUDGET", "Budget pribadi ini bukan milik pengguna aktif.", 403);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  assertPeriodOpen_(String(current.period_key) + "-01");
  const updated = Object.assign({}, current, {
    status: "archived",
    row_version: rowVersion_(current) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso_()
  });
  updateAuditedRow_("Budgets", current, updated, context, "budgets.archive", "budget", updated.budget_id);
  return publicRow_(updated);
}

function goalMovementsAsOf_(goalId, cutoffDate) {
  const cutoff = String(cutoffDate || today_());
  const transactionById = Object.fromEntries(rows_("Transactions").map(function(row) { return [String(row.transaction_id), row]; }));
  return rows_("Goal_Movements").filter(function(row) {
    if (row.goal_id !== goalId || row.status !== "active") return false;
    if (!row.transaction_id) return String(row.created_at || "").slice(0, 10) <= cutoff;
    const transaction = transactionById[String(row.transaction_id)];
    return Boolean(transaction && transaction.status === "active" && String(transaction.transaction_date || "") <= cutoff);
  });
}

function goalCurrentAmount_(goalId, cutoffDate) {
  return goalMovementsAsOf_(goalId, cutoffDate).reduce(function(sum, row) { return sum + (row.movement_type === "withdraw" ? -Number(row.amount || 0) : Number(row.amount || 0)); }, 0);
}

function listGoals_(context, cutoffOverride) {
  const period = context && context.payload && context.payload.period;
  const cutoffDate = cutoffOverride || periodCutoffDate_(period || monthKey_());
  const movementModel = goalMovementReadModelAsOf_(cutoffDate);
  const accountById = Object.fromEntries(rows_("Accounts").map(function(account) {
    return [String(account.account_id || ""), account];
  }));
  return rows_("Savings_Goals").filter(function(row) {
    const createdDate = String(row.created_at || "").slice(0, 10);
    return canAccessGoal_(context, row) && (!createdDate || createdDate <= cutoffDate);
  }).map(function(row) {
    const goalId = String(row.goal_id || "");
    const latest = movementModel.latestByGoal[goalId] || null;
    const linkedAccount = accountById[String(row.account_id || "")] || null;
    const latestTransaction = latest && latest.transaction_id
      ? movementModel.transactionById[String(latest.transaction_id)]
      : null;
    const latestTransactionUnlocked = !latestTransaction || !isTransactionDateLocked_(latestTransaction.transaction_date);
    return Object.assign(publicRow_(row), {
      current_amount: Number(movementModel.totals[goalId] || 0),
      last_movement_id: latest ? latest.goal_movement_id : "",
      last_transaction_id: latest ? latest.transaction_id : "",
      last_movement_type: latest ? latest.movement_type : "",
      can_move: row.status === "active" && Boolean(linkedAccount && linkedAccount.status === "active"),
      can_reverse: Boolean(latest && latestTransaction && latestTransaction.status === "active" && latestTransactionUnlocked
        && (context.actor.role === "owner" || String(latest.created_by) === String(context.actor.user_id))),
      can_update: context.actor.role === "owner",
      can_archive: context.actor.role === "owner" && row.status !== "archived"
    });
  });
}

function createGoal_(context) {
  const payload = context.payload;
  const goalType = sanitizeText_(payload.goal_type || "savings", 40);
  if (["savings", "emergency_fund", "sinking_fund"].indexOf(goalType) === -1) throw sbError_("INVALID_GOAL_TYPE", "Jenis target tidak valid.", 400);
  if (!payload.account_id) throw sbError_("ACCOUNT_REQUIRED", "Target wajib terhubung ke rekening tujuan.", 400);
  const account = activeAccount_(payload.account_id);
  assertAccountAccess_(context, account);
  const owned = normalizeOwnedScope_(context, payload, ownedScopeFromAccount_(account));
  if (owned.scope === "shared" && account.owner_scope === "personal") throw sbError_("SCOPE_ACCOUNT_MISMATCH", "Target bersama tidak boleh memakai rekening pribadi.", 400);
  if (owned.scope === "personal" && account.owner_scope === "personal" && String(owned.owner_user_id) !== String(account.owner_user_id)) throw sbError_("SCOPE_OWNER_MISMATCH", "Owner target dan rekening pribadi harus sama.", 400);
  const record = {
    goal_id: uuid_(), name: sanitizeText_(payload.name, 100), goal_type: goalType,
    target_amount: intAmount_(payload.target_amount), target_date: validateDate_(payload.target_date),
    account_id: account.account_id, priority: sanitizeText_(payload.priority || "normal", 20),
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(),
    updated_by: context.actor.user_id, updated_at: nowIso_(),
    scope: owned.scope, owner_user_id: owned.owner_user_id
  };
  if (!record.name) throw sbError_("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  appendAuditedRow_("Savings_Goals", "goal_id", record, context, "goals.create", "goal", null, publicRow_(record));
  return Object.assign(publicRow_(record), { current_amount: 0 });
}

function updateGoal_(context) {
  const current = findBy_("Savings_Goals", "goal_id", context.payload.goal_id);
  if (!current) throw sbError_("NOT_FOUND", "Target tidak ditemukan.", 404);
  assertGoalAccess_(context, current);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const name = sanitizeText_(context.payload.name === undefined ? current.name : context.payload.name, 100);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  const targetAmount = context.payload.target_amount === undefined ? Number(current.target_amount || 0) : intAmount_(context.payload.target_amount);
  const targetDate = context.payload.target_date === undefined ? current.target_date : validateDate_(context.payload.target_date);
  const priority = sanitizeText_(context.payload.priority === undefined ? (current.priority || "normal") : context.payload.priority, 20);
  if (!["low", "normal", "high"].includes(priority)) throw sbError_("INVALID_PRIORITY", "Prioritas target tidak valid.", 400);
  const status = sanitizeText_(context.payload.status === undefined ? (current.status || "active") : context.payload.status, 20);
  if (!["active", "completed", "archived"].includes(status)) throw sbError_("INVALID_STATUS", "Status target tidak valid.", 400);
  const currentAmount = goalCurrentAmount_(current.goal_id);
  if (status === "completed" && currentAmount < targetAmount) throw sbError_("GOAL_NOT_REACHED", "Target belum dapat ditandai selesai karena nominal belum tercapai.", 409, { currentAmount: currentAmount, targetAmount: targetAmount });
  const updated = Object.assign({}, current, {
    name: name,
    target_amount: targetAmount,
    target_date: targetDate,
    priority: priority,
    status: status,
    row_version: rowVersion_(current) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso_()
  });
  updateAuditedRow_("Savings_Goals", current, updated, context, "goals.update", "goal", updated.goal_id);
  return Object.assign(publicRow_(updated), { current_amount: currentAmount });
}

function moveGoal_(context) {
  const payload = context.payload;
  const goal = findBy_("Savings_Goals", "goal_id", payload.goal_id);
  if (!goal || goal.status !== "active") throw sbError_("INVALID_GOAL", "Target tidak aktif.", 400);
  assertGoalAccess_(context, goal);
  const amount = intAmount_(payload.amount);
  if (["contribution", "withdraw"].indexOf(payload.movement_type) === -1) throw sbError_("INVALID_MOVEMENT_TYPE", "Jenis mutasi target harus contribution atau withdraw.", 400);
  const movementType = payload.movement_type;
  if (movementType === "withdraw" && amount > goalCurrentAmount_(goal.goal_id)) throw sbError_("INSUFFICIENT_GOAL_BALANCE", "Nominal penarikan melebihi saldo target.", 409);
  if (!payload.source_account_id || !payload.destination_account_id) throw sbError_("ACCOUNT_REQUIRED", "Mutasi target wajib memiliki rekening sumber dan tujuan.", 400);
  if (String(payload.source_account_id) === String(payload.destination_account_id)) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  if (movementType === "contribution" && String(payload.destination_account_id) !== String(goal.account_id)) throw sbError_("GOAL_ACCOUNT_MISMATCH", "Kontribusi harus masuk ke rekening target.", 400);
  if (movementType === "withdraw" && String(payload.source_account_id) !== String(goal.account_id)) throw sbError_("GOAL_ACCOUNT_MISMATCH", "Penarikan harus berasal dari rekening target.", 400);
  const sourceAccount = activeAccount_(payload.source_account_id);
  const destinationAccount = activeAccount_(payload.destination_account_id);
  assertAccountAccess_(context, sourceAccount);
  assertAccountAccess_(context, destinationAccount);
  let transaction = null;
  const movement = { goal_movement_id: uuid_(), goal_id: goal.goal_id, transaction_id: "", movement_type: movementType, amount: amount, reason: sanitizeText_(payload.reason, 180), status: "active", created_by: context.actor.user_id, created_at: nowIso_() };
  try {
    transaction = createTransaction_(context, { transaction_date: payload.transaction_date || today_(), transaction_type: "transfer", source_account_id: sourceAccount.account_id, destination_account_id: destinationAccount.account_id, amount: amount, goal_id: goal.goal_id, description: goal.name, scope: goal.scope || "shared", owner_user_id: goal.owner_user_id || "", confirm_duplicate: true }, { skipAudit: true, allowInternalLinks: true });
    movement.transaction_id = transaction.transaction_id;
    appendRow_("Goal_Movements", movement);
    appendAudit_(context, "goals.move", "goal_movement", movement.goal_movement_id, null, { movement: publicRow_(movement), transaction: transaction });
  } catch (error) {
    compensateOrFailClosed_("goal_movement_compensation_required", { action: "goals.move", goalMovementId: movement.goal_movement_id, transactionId: transaction && transaction.transaction_id, cause: error.code || error.message }, function() {
      const movementRow = findBy_("Goal_Movements", "goal_movement_id", movement.goal_movement_id);
      if (movementRow) deleteRow_("Goal_Movements", movementRow.__row);
      if (transaction && transaction.transaction_id) {
        const transactionRow = findBy_("Transactions", "transaction_id", transaction.transaction_id);
        if (transactionRow) deleteRow_("Transactions", transactionRow.__row);
      }
    });
    throw sbError_("GOAL_MOVE_ROLLED_BACK", "Perubahan target gagal dan transaksi terkait telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { movement: publicRow_(movement), goal: Object.assign(publicRow_(goal), { current_amount: goalCurrentAmount_(goal.goal_id) }) };
}

function reverseGoalMovement_(context) {
  const payload = context.payload;
  const movement = findBy_("Goal_Movements", "goal_movement_id", payload.goal_movement_id);
  if (!movement || movement.status !== "active") throw sbError_("NOT_FOUND", "Mutasi target aktif tidak ditemukan.", 404);
  const goalRecord = findBy_("Savings_Goals", "goal_id", movement.goal_id);
  if (!goalRecord) throw sbError_("INVALID_GOAL", "Target mutasi tidak ditemukan.", 409);
  assertGoalAccess_(context, goalRecord);
  if (context.actor.role !== "owner" && String(movement.created_by) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN", "Member hanya dapat membatalkan mutasi target yang dibuat sendiri.", 403);
  const transaction = movement.transaction_id ? findBy_("Transactions", "transaction_id", movement.transaction_id) : null;
  if (movement.transaction_id && (!transaction || transaction.status !== "active" || transaction.goal_id !== movement.goal_id)) throw sbError_("INVALID_LINKED_TRANSACTION", "Transaksi target aktif tidak ditemukan atau tidak konsisten.", 409);
  if (transaction) assertTransactionDateUnlocked_(transaction.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan mutasi target wajib diisi.", 400);
  const previousMovement = Object.assign({}, movement);
  const previousTransaction = transaction ? Object.assign({}, transaction) : null;
  const updatedMovement = Object.assign({}, movement, { status: "cancelled" });
  const updatedTransaction = transaction ? Object.assign({}, transaction, { status: "cancelled", cancelled_by: context.actor.user_id, cancelled_at: nowIso_(), cancellation_reason: reason, row_version: rowVersion_(transaction) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() }) : null;
  try {
    if (updatedTransaction) updateRow_("Transactions", transaction.__row, updatedTransaction);
    updateRow_("Goal_Movements", movement.__row, updatedMovement);
    appendAudit_(context, "goals.reverseMovement", "goal_movement", movement.goal_movement_id, { movement: publicRow_(previousMovement), transaction: previousTransaction ? publicRow_(previousTransaction) : null }, { movement: publicRow_(updatedMovement), transaction: updatedTransaction ? publicRow_(updatedTransaction) : null, reason: reason });
  } catch (error) {
    compensateOrFailClosed_("goal_reverse_compensation_required", { action: "goals.reverseMovement", goalMovementId: movement.goal_movement_id, transactionId: movement.transaction_id, cause: error.code || error.message }, function() {
      if (previousTransaction) updateRow_("Transactions", previousTransaction.__row, previousTransaction);
      updateRow_("Goal_Movements", previousMovement.__row, previousMovement);
    });
    throw sbError_("GOAL_REVERSE_ROLLED_BACK", "Pembatalan mutasi target gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { movement: publicRow_(updatedMovement), transaction: updatedTransaction ? publicRow_(updatedTransaction) : null, goal: Object.assign(publicRow_(goalRecord), { current_amount: goalCurrentAmount_(goalRecord.goal_id) }) };
}
