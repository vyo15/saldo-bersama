import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("modal mobile hanya menggulir vertikal dan seluruh child form boleh menyusut", async () => {
  const [modal, components] = await Promise.all([
    read("src/components/common/Modal.module.css"),
    read("src/styles/components.css"),
  ]);
  assert.match(modal, /\.body\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(modal, /@media \(max-width: 47\.99rem\)[\s\S]*\.body\s*\{[\s\S]*scrollbar-width:\s*none;/);
  assert.match(modal, /\.body::-webkit-scrollbar\s*\{[\s\S]*width:\s*0;[\s\S]*height:\s*0;[\s\S]*display:\s*none;/);
  assert.match(components, /\.segmented-control\s*\{[\s\S]*min-inline-size:\s*0;/);
  assert.match(components, /\.form-grid,[\s\S]*\.segmented-control\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
  assert.match(components, /input\[type="file"\][\s\S]*max-width:\s*100%;/);
  assert.doesNotMatch(modal + components, /overflow-y:\s*hidden/);
});

test("filter transaksi dan kelompok ikon kategori tidak menjadi carousel horizontal mobile", async () => {
  const [responsive, categoryStyles] = await Promise.all([
    read("src/styles/responsive.css"),
    read("src/features/categories/CategoriesPage.module.css"),
  ]);
  assert.match(responsive, /\.transaction-filter-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*overflow:\s*visible;/);
  assert.match(responsive, /@media \(max-width: 420px\)[\s\S]*\.transaction-filter-row\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(responsive, /\.transaction-filter-row\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(categoryStyles, /\.iconGroups\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/);
  assert.doesNotMatch(categoryStyles, /\.iconGroups\s*\{[^}]*overflow-x:\s*auto/);
});

test("pengaturan memakai route internal dan tidak memuat semua domain pada ringkasan", async () => {
  const [app, overview, layout, notifications, integrations, members, presentation] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/settingsPresentation.js"),
  ]);
  for (const route of ["notifikasi", "integrasi", "anggota", "export", "import", "backup", "pemulihan", "periode", "audit"]) {
    assert.match(app, new RegExp(`path="${route}"`));
  }
  assert.match(layout, /SETTINGS_NAVIGATION/);
  assert.match(layout, /ownerOnly/);
  assert.match(overview, /useApiResource\("system\.health"\)/);
  assert.doesNotMatch(overview, /users\.list|audit\.list|archive\.list|periods\.list|integrations\.status/);
  assert.equal((notifications.match(/Notifikasi perangkat/g) || []).length, 1);
  assert.equal((integrations.match(/<h3>Google Sheets<\/h3>/g) || []).length, 1);
  assert.equal((integrations.match(/<h3>Google Calendar<\/h3>/g) || []).length, 1);
  assert.match(integrations, /menunggu \{sheets\.pending\}/);
  assert.match(integrations, /diproses \{sheets\.processing\}/);
  assert.match(integrations, /gagal \{sheets\.failed\}/);
  assert.match(integrations, /perlu tindakan \{sheets\.deadLetter\}/);
  assert.doesNotMatch(integrations, /antrean \{sheets\.pending\}/);
  assert.match(presentation, /integrationProviderPresentation/);
  assert.match(presentation, /Trigger belum siap/);
  assert.match(presentation, /health check belum dapat dijangkau/);
  assert.match(members, /Tambah anggota/);
  assert.match(members, /Lihat aktivitas transaksi/);
  assert.match(members, /MemberActivityPanel/);
});

test("anggota memakai grid responsif dan panel aktivitas berubah full-screen pada breakpoint mobile", async () => {
  const [members, activity, styles] = await Promise.all([
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/settings/components/MemberActivityPanel.jsx"),
    read("src/features/settings/Settings.module.css"),
  ]);

  assert.match(members, /UserAvatar/);
  assert.match(members, /photoURL:\s*user\?\.photoURL/);
  assert.match(members, /roleFilter/);
  assert.match(activity, /created_by:\s*member\?\.user_id/);
  assert.match(activity, /reports\.monthly/);
  assert.match(activity, /navigate\("\/transaksi", \{ state: \{ creatorId: member\.user_id, period \} \}\)/);
  assert.match(styles, /\.memberGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 51\.25rem\)[\s\S]*\.memberGrid \{ grid-template-columns:\s*1fr;/);
  assert.match(styles, /@media \(max-width: 51\.25rem\)[\s\S]*\.memberActivityPanel \{ width:\s*100%; min-width:\s*0; height:\s*100vh; height:\s*100dvh;/);
});

test("presentasi Integrasi Google memisahkan kegagalan queue dan readiness provider", async () => {
  const { integrationProviderPresentation, providerSummary } = await import("../src/features/settings/settingsPresentation.js");
  const integration = {
    providers: {
      calendar: {
        pending: 2,
        processing: 1,
        failed: 3,
        dead_letter: 4,
        completed: 5,
        lastUpdatedAt: "2026-08-08T03:06:00.000Z",
        lastCompletedAt: "2026-08-08T03:05:00.000Z",
        lastFailureAt: "2026-08-08T03:06:00.000Z",
      },
    },
    bridge: {
      configured: true,
      checked: true,
      reachable: true,
      health: { calendarConfigured: true, jobsConfigured: true, triggerReady: false },
    },
    configured: { calendar: false },
  };
  assert.deepEqual(providerSummary(integration, "calendar"), {
    pending: 2,
    processing: 1,
    failed: 3,
    deadLetter: 4,
    completed: 5,
    lastUpdatedAt: "2026-08-08T03:06:00.000Z",
    lastCompletedAt: "2026-08-08T03:05:00.000Z",
    lastFailureAt: "2026-08-08T03:06:00.000Z",
  });
  const readiness = integrationProviderPresentation(integration, "calendar");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.label, "Trigger belum siap");
});
