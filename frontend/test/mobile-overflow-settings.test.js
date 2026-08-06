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
  const [app, overview, layout, notifications, integrations, members] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/settings/SettingsPage.jsx"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/DeviceNotificationsPage.jsx"),
    read("src/features/settings/GoogleIntegrationsPage.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
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
  assert.match(members, /Tambah atau ubah akses/);
  assert.match(members, /Pengguna aplikasi/);
});
