import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterNotificationItems } from "../src/features/notifications/notificationListFilters.js";

const fixtures = [
  { id: "a", type: "reconciliation_difference", title: "Saldo BNI berbeda", message: "Cek rekening" },
  { id: "b", type: "recurring_due", title: "Listrik segera jatuh tempo", message: "Jatuh tempo 2026-10-15" },
  { id: "c", type: "manual_reminder", title: "Bayar sekolah", message: "Ingat angsuran" },
  { id: "d", type: "manual_reminder", title: "Kontrol kendaraan", message: "Waktunya servis" },
];

const source = (path) => readFile(new URL(`../src/features/notifications/${path}`, import.meta.url), "utf8");

test("pencarian mematuhi kategori, entitas, fakta, dan urutan server tanpa mengakses ID internal", () => {
  const isRead = () => false;
  assert.deepEqual(filterNotificationItems(fixtures, { filter: "action", isRead }).map((item) => item.id), ["a", "b"]);
  assert.deepEqual(filterNotificationItems(fixtures, { filter: "action", query: "  bNi  ", isRead }).map((item) => item.id), ["a"]);
  assert.deepEqual(filterNotificationItems(fixtures, { filter: "action", query: "JATUH tempo", isRead }).map((item) => item.id), ["b"]);
  assert.deepEqual(filterNotificationItems(fixtures, { filter: "reminder", query: "sekolah", isRead }).map((item) => item.id), ["c"]);
  assert.deepEqual(filterNotificationItems(fixtures, { filter: "action", query: "reconciliation_difference", isRead }), []);
});

test("belum dibaca bersifat filter visual dan tidak memodifikasi notifikasi", () => {
  const original = structuredClone(fixtures);
  const visible = filterNotificationItems(fixtures, { filter: "reminder", unreadOnly: true, isRead: (item) => item.id === "c" });
  assert.deepEqual(visible.map((item) => item.id), ["d"]);
  assert.deepEqual(fixtures, original);
  assert.deepEqual(filterNotificationItems([], { query: "apa saja" }), []);
});

test("interactive list menjaga routing persetujuan, mark-read server, dan tombol bersihkan terpisah", async () => {
  const [page, row, css] = await Promise.all([
    source("NotificationsPage.jsx"), source("NotificationRow.jsx"), source("NotificationsPage.module.css"),
  ]);
  assert.match(page, /financialAlertSelectionGuard\(guidanceAlert/);
  assert.match(page, /notifications\.markRead\(alert\)/);
  assert.match(page, /notifications\.dismiss\(alert\)/);
  assert.match(page, /filterNotificationItems\(alerts/);
  assert.match(page, /aria-pressed=\{unreadOnly\}/);
  assert.match(page, /type="search"/);
  assert.match(row, /className=\{styles\.clearButton\}/);
  assert.match(row, /Promise\.resolve\(\)\.then\(\(\) => onDismiss\(alert\)\)\.catch/);
  assert.match(row, /setCollapsing\(false\)/);
  assert.match(row, /itemRef\.current\.contains\(document\.activeElement\)/);
  assert.match(css, /@keyframes notification-row-enter/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.swipeItem \{ animation: none; \}/);
  assert.doesNotMatch(page, /clearAllNotifications|approveTransfer\(/);
});
