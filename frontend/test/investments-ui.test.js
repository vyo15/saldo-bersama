import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("UI Investasi memakai summary canonical dan tidak mengarang discovery atau market history", async () => {
  const [page, overview] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
  ]);

  assert.match(page, /useApiResource\("investments\.overview"\)/);
  assert.match(page, /InvestmentOverview/);
  assert.match(overview, /summary\?\.portfolio_value/);
  assert.match(overview, /summary\?\.rdn_cash/);
  assert.match(overview, /summary\?\.market_value/);
  assert.match(overview, /summary\?\.unrealized_pl/);
  assert.match(overview, /ProgressBar/);
  assert.doesNotMatch(`${page}\n${overview}`, /Market Movers|Top Gainers|Top Losers|Popular Investment|market history|market API/i);
});

test("aksi Investasi tetap capability-driven dan koreksi tetap Administrator-only pada presentasi", async () => {
  const overview = await read("src/features/investments/InvestmentOverview.jsx");
  assert.match(overview, /if \(!portfolio\.can_operate\)/);
  assert.match(overview, /owner \? <Button[^>]*Koreksi|owner \? <Button[\s\S]*?>Koreksi/);
  assert.match(overview, /RDN keluar/);
  assert.match(overview, /RDN masuk/);
});

test("styling Investasi memakai token tema dan kontrak responsive mobile canonical", async () => {
  const styles = await read("src/features/investments/InvestmentsPage.module.css");
  assert.match(styles, /@media \(max-width: 820px\)/);
  assert.match(styles, /\.quickAction \{[\s\S]*?min-height:\s*5\.25rem;/);
  assert.match(styles, /font-size:\s*var\(--mobile-native-control-font-size\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});


test("setup Investasi mendukung broker canonical dan mencegah dead-end tanpa rekening RDN", async () => {
  const [setup, dialog] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
  ]);
  assert.match(setup, /option value="ajaib">Ajaib/);
  assert.match(setup, /option value="other">Broker lain/);
  assert.match(setup, /disabled=\{!canSubmit\}/);
  assert.match(setup, /Belum ada rekening Investasi aktif/);
  assert.match(dialog, /portfolio\.broker === "ajaib" \? "Cocokkan Ajaib" : "Cocokkan broker"/);
});
