import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Keluarga menjadi hub anggota dan pengajuan tanpa menu Persetujuan terpisah", async () => {
  const [navigation, app, members, approvals] = await Promise.all([
    read("src/config/navigation.js"),
    read("src/app/App.jsx"),
    read("src/features/settings/MembersSettingsPage.jsx"),
    read("src/features/approvals/ApprovalCenterPage.jsx"),
  ]);
  assert.match(navigation, /to: "\/anggota", label: "Keluarga"/);
  assert.doesNotMatch(navigation, /to: "\/persetujuan", label: "Persetujuan"/);
  assert.match(app, /path="anggota\/:memberId"/);
  assert.match(app, /path="persetujuan" element=\{<Navigate to="\/anggota\?tab=pengajuan" replace \/>\}/);
  assert.match(members, /Anggota/);
  assert.match(members, /Pengajuan/);
  assert.match(members, /memberFinance/);
  assert.match(members, /owner_user_id/);
  assert.match(members, /assignee_user_id/);
  assert.match(members, /requesterId=\{member\.user_id\}/);
  assert.match(members, /MemberActivityPanel embedded/);
  assert.match(approvals, /requesterId \? allMasterItems\.filter/);
  assert.match(approvals, /requesterId \? allTransferItems\.filter/);
});

test("Akun Saya memberi Member pusat ringkasan keuangan pengajuan dan aktivitas", async () => {
  const [app, routes, navigation, layout, page] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/app/routeModules.js"),
    read("src/features/settings/settingsNavigation.js"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/MyAccountPage.jsx"),
  ]);
  assert.match(app, /path="akun" element=\{routeElement\(MyAccountPage\)\}/);
  assert.match(routes, /"\/pengaturan\/akun"/);
  assert.match(navigation, /to: "\/pengaturan\/akun", label: "Akun Saya"/);
  assert.match(layout, /"\/pengaturan\/akun"/);
  for (const label of ["Ringkasan", "Keuangan Saya", "Pengajuan Saya", "Aktivitas Saya"]) assert.match(page, new RegExp(label));
  assert.match(page, /masterDataRequests\.list/);
  assert.match(page, /transferRequests\.list/);
  assert.match(page, /MemberActivityPanel embedded/);
  assert.match(page, /owner_user_id/);
  assert.match(page, /assignee_user_id/);
});
