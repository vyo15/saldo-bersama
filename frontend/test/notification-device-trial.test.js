import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relative) => readFile(path.join(root, relative), "utf8");

test("trial notifikasi perangkat memakai native showNotification dengan asset non-sensitif dan deep-link target", async () => {
  const [service, presets, panel, page, sw] = await Promise.all([
    source("src/services/notifications.js"),
    source("src/services/notificationTrials.js"),
    source("src/features/settings/NotificationTrialPanel.jsx"),
    source("src/features/settings/DeviceNotificationsPage.jsx"),
    source("public/sw.js"),
  ]);

  assert.match(service, /export const showNotificationTrial/);
  assert.match(service, /Notification\.requestPermission\(\)/);
  assert.match(service, /registration\.showNotification\(preset\.title, options\)/);
  assert.match(service, /image: preset\.image/);
  assert.match(service, /data: \{ targetPath: preset\.targetPath, trialTheme: preset\.id \}/);
  const trialFunction = service.match(/export const showNotificationTrial[\s\S]*?\n};/)?.[0] || "";
  assert.doesNotMatch(trialFunction, /apiClient\.request/);

  assert.match(presets, /Liburan sebentar lagi! ❤️/);
  assert.match(presets, /Pelan-pelan, pasti bisa 💚/);
  assert.match(presets, /\/notifications\/trial\/liburan\.webp\?v=2/);
  assert.match(presets, /\/notifications\/trial\/masa-depan\.webp\?v=2/);
  assert.ok((presets.match(/targetPath: "\/target"/g) || []).length >= 2);

  assert.match(panel, /Coba notifikasi di HP ini/);
  assert.match(panel, /Tampilkan di perangkat ini/);
  assert.match(panel, /showNotificationTrial\(theme\)/);
  assert.match(page, /<NotificationTrialPanel pushState=\{pushState\} refreshPushState=\{refreshPushState\} \/>/);
  assert.match(sw, /\/notifications\/trial\/liburan\.webp\?v=2/);
  assert.match(sw, /\/notifications\/trial\/masa-depan\.webp\?v=2/);
});


test("asset trial notifikasi tetap ringan agar clean source archive punya headroom", async () => {
  const assets = [
    "public/notifications/trial/liburan.webp",
    "public/notifications/trial/masa-depan.webp",
  ];
  const sizes = await Promise.all(assets.map(async (relative) => (await stat(path.join(root, relative))).size));
  sizes.forEach((size) => assert.ok(size <= 225 * 1024, `Asset trial terlalu besar: ${size} byte`));
});
