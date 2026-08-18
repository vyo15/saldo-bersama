import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("pengingat manual hanya muncul pada empat lifecycle finansial yang membutuhkan reminder", async () => {
  const [budgets, allocations, recurring, goals, transactions] = await Promise.all([
    source("src/features/budgets/BudgetsPage.jsx"),
    source("src/features/allocations/AllocationsPage.jsx"),
    source("src/features/recurring/RecurringPage.jsx"),
    source("src/features/goals/GoalsPage.jsx"),
    source("src/features/transactions/TransactionsPage.jsx"),
  ]);

  assert.match(budgets, /entityType: "budget"/);
  assert.match(allocations, /entityType: "envelope_period"/);
  assert.match(allocations, /canSetAllocationReminder/);
  assert.match(recurring, /entityType: "recurring_occurrence"/);
  assert.match(goals, /entityType: "goal"/);
  assert.doesNotMatch(transactions, /ManualReminderModal|reminders\.upsert/);
});

test("dialog pengingat memakai waktu Jakarta, row version, dan tidak menggantikan pengingat otomatis", async () => {
  const [modal, notifications, cache] = await Promise.all([
    source("src/features/reminders/ManualReminderModal.jsx"),
    source("src/services/notifications.js"),
    source("src/services/api/cache.js"),
  ]);

  assert.match(modal, /type="date"/);
  assert.match(modal, /max=\{maxDate\}/);
  assert.match(modal, /type="time"/);
  assert.match(modal, /min=\{minTime\}/);
  assert.match(modal, /Asia\/Jakarta/);
  assert.match(modal, /notifikasi dapat terlambat beberapa menit/i);
  assert.match(modal, /Pengingat otomatis tetap aktif/);
  assert.match(modal, /Pengingat otomatis tetap berjalan/);
  assert.match(modal, /CompactNotice/);
  assert.doesNotMatch(modal, /Atur waktu sendiri|>Detail</);
  assert.match(modal, /getPushNotificationState/);
  assert.match(modal, /lastDispatch/);
  assert.match(modal, /REMINDER_DELIVERY_PENDING|deliveryPending/);
  assert.match(modal, /Web Push belum aktif/);
  assert.match(modal, /Status Web Push belum terverifikasi/);
  assert.match(modal, /Notifikasi aktif di perangkat ini/);
  assert.match(modal, /server_status_unavailable/);
  assert.match(modal, /notice notice--danger form-grid__full/);
  assert.match(modal, /current\?\.row_version/);
  assert.match(notifications, /"reminders\.get"/);
  assert.match(notifications, /"reminders\.upsert"/);
  assert.match(notifications, /"reminders\.cancel"/);
  assert.match(cache, /"reminders\.get": 0/);
});
