import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("pengaturan menggabungkan reset ke satu menu pemeliharaan dengan dua tab terisolasi", async () => {
  const [app, navigation, maintenance] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/settings/settingsNavigation.js"),
    read("src/features/settings/MaintenanceDataPage.jsx"),
  ]);

  assert.match(app, /path="pemeliharaan" element=\{routeElement\(MaintenanceDataPage\)\}/);
  assert.match(navigation, /label: "Pemeliharaan data"/);
  assert.match(navigation, /to: "\/pengaturan\/pemeliharaan"/);
  assert.doesNotMatch(navigation, /to: "\/pengaturan\/reset-data"|to: "\/pengaturan\/reset-semua"/);
  assert.match(app, /path="reset-data" element=\{<Navigate to="\/pengaturan\/pemeliharaan" replace \/>\}/);
  assert.match(app, /path="reset-semua" element=\{<Navigate to="\/pengaturan\/pemeliharaan\?tab=semua" replace \/>\}/);

  assert.match(maintenance, /role="tablist"/);
  assert.match(maintenance, />Reset Testing</);
  assert.match(maintenance, />Reset Semua</);
  assert.match(maintenance, /activeTab === TAB_TESTING \? <ResetDataPage \/> : <FullResetPage \/>/);
  assert.match(maintenance, /const ResetDataPage = lazy\(\(\) => import\("\.\/ResetDataPage\.jsx"\)\);/);
  assert.match(maintenance, /const FullResetPage = lazy\(\(\) => import\("\.\/FullResetPage\.jsx"\)\);/);
  assert.match(maintenance, /<Suspense fallback=/);
  assert.doesNotMatch(maintenance, /import ResetDataPage from|import FullResetPage from/);
  assert.match(maintenance, /useSearchParams\(\)/);
  assert.match(maintenance, /ArrowLeft/);
  assert.match(maintenance, /tabIndex=\{activeTab === TAB_TESTING \? 0 : -1\}/);
});


test("pemeliharaan mobile memakai progressive disclosure dan jalur persiapan canonical", async () => {
  const [maintenance, trial, full, settingsStyles, resetStyles] = await Promise.all([
    read("src/features/settings/MaintenanceDataPage.jsx"),
    read("src/features/settings/ResetDataPage.jsx"),
    read("src/features/settings/FullResetPage.jsx"),
    read("src/features/settings/Settings.module.css"),
    read("src/features/settings/components/SettingsResetPanels.module.css"),
  ]);

  assert.match(maintenance, /Reset selalu dipreview terlebih dahulu/);
  assert.match(maintenance, /to="\/pengaturan\/backup"/);
  assert.match(maintenance, /to="\/pengaturan\/periode"/);
  assert.match(maintenance, /to="\/pengaturan\/pemulihan"/);
  assert.doesNotMatch(maintenance, /Bersihkan data testing atau kembalikan seluruh dataset/);
  assert.match(trial, /Bersihkan data uji tanpa menghapus master utama/);
  assert.match(full, /Kembalikan aplikasi ke kondisi awal setelah preview dan backup aman/);
  assert.match(settingsStyles, /\.maintenanceCompactIntro\s*\{/);
  assert.match(settingsStyles, /@media \(max-width: 820px\)[\s\S]*\.maintenancePrepLinks\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(resetStyles, /\.resetFlowSteps\s*\{/);
  assert.match(resetStyles, /\.resetImpactCard\s*\{/);
  assert.match(resetStyles, /@media \(max-width: 36rem\)[\s\S]*\.resetFlowPanel > :global\(\[data-ui="button"\]\)[\s\S]*min-height:\s*var\(--mobile-control-height\);/);
});

test("checklist destructive menyimpan nilai checkbox sebelum state updater dan tetap focusable", async () => {
  const [modal, componentsCss] = await Promise.all([
    read("src/components/common/ConfirmationModal.jsx"),
    read("src/styles/components.css"),
  ]);

  assert.match(modal, /const nextChecked = event\.currentTarget\.checked;/);
  assert.match(modal, /itemIndex === index \? nextChecked : Boolean\(current\[itemIndex\]\)/);
  assert.doesNotMatch(modal, /setCheckedItems\(\(current\)[^\n]*event\.target\.checked/);
  assert.doesNotMatch(modal, /role="switch"/);

  const checkboxRule = componentsCss.match(/\.confirmation-checklist__item input \{[^}]+\}/)?.[0] || "";
  assert.match(checkboxRule, /clip-path: inset\(50%\)/);
  assert.doesNotMatch(checkboxRule, /pointer-events:\s*none/);
});
