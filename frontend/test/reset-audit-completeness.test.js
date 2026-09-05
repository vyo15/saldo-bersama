import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { integrationProviderPresentation } from "../src/features/settings/settingsPresentation.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("reset testing dan full reset menampilkan seluruh kelompok destructive", async () => {
  const [trial, full] = await Promise.all([
    read("src/features/settings/components/TrialResetPanels.jsx"),
    read("src/features/settings/components/FullResetPanels.jsx"),
  ]);

  for (const key of ["investmentTrades", "investmentCorrections", "investmentValuations", "investmentReconciliations"]) {
    assert.equal(trial.includes(`["${key}"`), true, `Trial reset wajib menampilkan ${key}`);
    assert.equal(full.includes(`["${key}"`), true, `Full reset wajib menampilkan ${key}`);
  }

  for (const key of ["masterDataRequests", "transferRequests", "manualReminders"]) {
    assert.equal(trial.includes(`["${key}"`), true, `Trial reset wajib menampilkan ${key}`);
    assert.equal(full.includes(`["${key}"`), true, `Full reset wajib menampilkan ${key}`);
  }

  for (const key of ["investmentPortfolios", "investmentInstruments"]) {
    assert.equal(trial.includes(`["${key}"`), true, `Trial reset wajib menjelaskan ${key} yang dipertahankan`);
    assert.equal(full.includes(`["${key}"`), true, `Full reset wajib menampilkan ${key} yang dihapus`);
  }
});

test("reset testing tidak bergantung pada mode build frontend", async () => {
  const [app, layout, trialPage, maintenance] = await Promise.all([
    read("src/app/App.jsx"),
    read("src/features/settings/SettingsLayout.jsx"),
    read("src/features/settings/ResetDataPage.jsx"),
    read("src/features/settings/MaintenanceDataPage.jsx"),
  ]);

  assert.equal(app.includes("developmentRouteElement"), false);
  assert.equal(app.includes('path="reset-data" element={<Navigate to="/pengaturan/pemeliharaan" replace />}'), true);
  assert.equal(maintenance.includes('<ResetDataPage />'), true);
  assert.equal(layout.includes("developmentOnly"), false);
  assert.equal(layout.includes("import.meta.env.MODE"), false);
  assert.equal(trialPage.includes('useApiResource("system.health"'), true);
  assert.equal(trialPage.includes('databaseEnvironment !== "development"'), true);
  assert.equal(trialPage.includes("Reset data testing hanya tersedia pada database Development"), true);
});

test("reset membuang cache domain yang terdampak", async () => {
  const [trialPage, fullPage] = await Promise.all([
    read("src/features/settings/ResetDataPage.jsx"),
    read("src/features/settings/FullResetPage.jsx"),
  ]);

  for (const action of ["investments.overview", "masterDataRequests.list", "transferRequests.list", "reminders.get"]) {
    assert.equal(trialPage.includes(`"${action}"`), true, `Trial reset wajib invalidate ${action}`);
    assert.equal(fullPage.includes(`"${action}"`), true, `Full reset wajib invalidate ${action}`);
  }
  assert.equal(fullPage.includes('"investments.instruments.list"'), true);
  assert.equal(trialPage.includes('"notifications.status"'), true);
});

test("kesiapan Google Drive fail-closed bila bridge belum diverifikasi", () => {
  const missingBridge = integrationProviderPresentation({ configured: { drive: true } }, "drive");
  assert.equal(missingBridge.ready, false);
  assert.equal(missingBridge.tone, "warning");

  const uncheckedBridge = integrationProviderPresentation({
    configured: { drive: true },
    bridge: { configured: true, checked: false },
  }, "drive");
  assert.equal(uncheckedBridge.ready, false);
  assert.equal(uncheckedBridge.tone, "warning");
});
