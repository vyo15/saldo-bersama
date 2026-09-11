import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("UI Investasi asset-centric memakai nilai aset canonical tanpa hierarchy broker atau RDN", async () => {
  const [page, overview] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
  ]);

  assert.match(page, /useApiResource\("investments\.overview"\)/);
  assert.match(page, /Catat saham dan reksa dana langsung sebagai aset/);
  assert.match(page, /aria-label="Tambah investasi">Tambah investasi<\/Button>/);
  assert.match(overview, /const total = Number\(values\.market_value \|\| 0\)/);
  assert.match(overview, /Modal tercatat/);
  assert.match(overview, /Nilai saat ini/);
  assert.match(overview, /Total investasi tercatat/);
  assert.match(overview, />Aset <span>/);
  assert.match(overview, />Aktivitas /);
  assert.match(overview, />Semua<\/button>/);
  assert.match(overview, />Saham<\/button>/);
  assert.match(overview, />Reksa Dana<\/button>/);
  assert.match(overview, /<Money value=\{holding\.price_per_share\} \/> \/ \{mutualFund \? "unit" : "saham"\}/);
  assert.match(overview, /Harga belum dicatat/);
  assert.doesNotMatch(overview, /className=\{holdingStyles\.assetType\}/);
  assert.doesNotMatch(`${page}\n${overview}`, /Top up RDN|Tarik RDN|Sumber catatan|Ajaib|Bibit|Indodax|Market Movers|Top Gainers|Top Losers/i);
});

test("Perbarui nilai massal membedakan harga saham dan NAB tanpa mengubah jumlah kepemilikan", async () => {
  const [page, dialog, api] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentValuationDialog.jsx"),
    read("src/features/investments/investments.api.js"),
  ]);
  assert.match(page, /aria-label="Perbarui nilai investasi">Perbarui nilai<\/Button>/);
  assert.match(page, /operableAssetCount > 0/);
  assert.match(dialog, /title="Perbarui nilai investasi"/);
  assert.match(dialog, /NAB per unit/);
  assert.match(dialog, /Harga per lembar/);
  assert.match(dialog, /Jumlah kepemilikan tidak berubah/);
  assert.match(dialog, /bulkUpdateInvestmentValuations/);
  assert.match(dialog, /row_version: portfolio\.row_version/);
  assert.match(api, /investments\.valuations\.bulkUpdate/);
});

test("aksi Investasi berada pada detail aset dan tetap capability-driven", async () => {
  const [overview, detail, model] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(overview, /!portfolio\.can_operate \? <span className="sr-only">Hanya dapat dilihat<\/span>/);
  assert.match(detail, /portfolio\.can_operate \? <Button[\s\S]*?>Perbarui nilai<\/Button>/);
  assert.match(detail, /portfolio\.can_operate \? <Button[\s\S]*?>Beli<\/Button>/);
  assert.match(detail, /canSell \? <Button[\s\S]*?>Jual<\/Button>/);
  assert.match(detail, /Aktivitas investasi terbaru/);
  for (const label of ["Pembelian dicatat", "Penjualan dicatat", "Harga/lembar diperbarui", "NAB/unit diperbarui", "Koreksi dicatat", "Posisi awal dicatat"]) assert.match(model, new RegExp(label));
});

test("styling Investasi memakai token tema dan kontrak responsive mobile canonical", async () => {
  const styles = await Promise.all([
    "InvestmentsPage.module.css",
    "InvestmentForm.module.css",
    "InvestmentHero.module.css",
    "HoldingCard.module.css",
    "InvestmentActivity.module.css",
    "InvestmentShared.module.css",
    "InvestmentValuationDialog.module.css",
  ].map((name) => read(`src/features/investments/${name}`))).then((parts) => parts.join("\n"));
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.holdingMetrics \{[\s\S]*?display:\s*none;/);
  assert.match(styles, /\.unitPrice \{\s*display:\s*none;[\s\S]*?@media \(max-width: 620px\) \{[\s\S]*?\.unitPrice \{\s*display:\s*block;/);
  assert.doesNotMatch(styles, /\.assetType\s*\{/);
  assert.match(styles, /\.segment \{[\s\S]*?display:\s*flex;/);
  assert.match(styles, /\.assetFilters/);
  assert.match(styles, /font-size:\s*var\(--mobile-native-control-font-size\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});

test("Tambah investasi mencatat posisi aset langsung tanpa membuat broker atau RDN dari UI", async () => {
  const [setup, api, model] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/investments.api.js"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(setup, /title="Tambah investasi"/);
  assert.match(setup, /InvestmentAssetPicker/);
  assert.match(setup, /label=\{mutualFund \? "Jumlah unit" : "Jumlah lot"\}/);
  assert.match(setup, /Harga rata-rata per lembar/);
  assert.match(setup, /Harga per lembar saat ini/);
  assert.match(setup, /Tanggal posisi/);
  assert.match(setup, /Tidak ada saldo rekening yang dipindahkan dan tidak ada order yang dikirim ke broker/);
  assert.match(setup, /createInvestmentAssetPosition\(payload\)/);
  assert.match(api, /investments\.assets\.create/);
  assert.match(model, /validateInvestmentAssetPosition/);
  assert.doesNotMatch(setup, /Rekening RDN|Buat RDN|source_label|auto_create_rdn/i);
});

test("picker Tambah investasi memakai katalog saham LQ45 dan reksa dana dengan identitas visual", async () => {
  const [setup, picker, stockCatalog, assetCatalog, visuals, holding, pickerStyles] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentAssetPicker.jsx"),
    read("src/shared/presentation/investmentStocks.js"),
    read("src/shared/presentation/investmentAssets.js"),
    read("src/components/common/selectionOptionVisuals.js"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentAssetPicker.module.css"),
  ]);
  assert.match(setup, /InvestmentAssetPicker/);
  assert.doesNotMatch(setup, /label="Ticker"|label="Bursa"|label="Nama saham"|label="Lembar per lot"/);
  assert.match(picker, /Saham LQ45/);
  assert.match(picker, /Reksa Dana/);
  assert.match(picker, /allowedTickers/);
  assert.match(picker, /existingInstruments/);
  for (const ticker of ["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "ICBP", "ANTM"]) assert.match(stockCatalog, new RegExp(`ticker: "${ticker}"`));
  for (const ticker of ["IHAJJ", "CAPFIX"]) assert.match(assetCatalog, new RegExp(`ticker: "${ticker}"`));
  assert.match(assetCatalog, /asset_type: "mutual_fund"/);
  assert.match(visuals, /investmentAssetLogo\(instrument\.ticker\)/);
  assert.match(holding, /<InvestmentAssetLogo ticker=\{holding\.ticker\}/);
  assert.match(pickerStyles, /\.option \{[\s\S]*?min-height:\s*4\.25rem;/);
});

test("Member tidak mendapat dead-end: katalog dibatasi ke instrumen aktif yang sudah terdaftar", async () => {
  const [setup, picker] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentAssetPicker.jsx"),
  ]);
  assert.match(setup, /owner \? null : instruments\.filter\(\(item\) => item\.status === "active"\)/);
  assert.match(picker, /allowedTickers/);
  assert.match(picker, /allowedTickerSet\.has\(item\.ticker\)/);
  assert.match(setup, /heldAssetEntries\(portfolios\)/);
});

test("detail aset memakai modal, cost basis, nilai manual, dan aktivitas tanpa konteks RDN", async () => {
  const [page, overview, holdingDetail] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
  ]);
  assert.match(page, /InvestmentHoldingDetail = lazy/);
  assert.match(overview, /Kepemilikan/);
  assert.match(overview, /Modal tercatat/);
  assert.match(holdingDetail, /Modal tercatat/);
  assert.match(holdingDetail, /Nilai tercatat/);
  assert.match(holdingDetail, /Hasil belum direalisasi/);
  assert.match(holdingDetail, /Aktivitas investasi terbaru/);
  assert.doesNotMatch(`${overview}\n${holdingDetail}`, /Saldo RDN|Top up|Tarik ke rekening/i);
});

test("Buy Sell Investasi adalah pencatatan manual dan tidak memindahkan saldo rekening", async () => {
  const [page, dialog, detail] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
  ]);
  assert.match(page, /tidak mengirim order beli\/jual, tidak memindahkan saldo rekening/);
  assert.match(dialog, /Ini hanya pencatatan\. Saldo Bersama tidak mengirim order ke broker dan tidak memindahkan saldo rekening\./);
  assert.match(dialog, /Catat pembelian/);
  assert.match(dialog, /Catat penjualan/);
  assert.match(dialog, /Perbarui nilai/);
  assert.match(detail, />Beli<\/Button>/);
  assert.match(detail, />Jual<\/Button>/);
  assert.doesNotMatch(`${page}\n${dialog}\n${detail}`, /fundRdn|Top up RDN|Kembali ke pembelian|Tarik ke rekening/i);
});

test("setup dan aksi Investasi mengunci intent ketika outcome mutation belum pasti", async () => {
  const [setup, dialog] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
  ]);
  for (const source of [setup, dialog]) {
    assert.match(source, /isOutcomeUnknownError/);
    assert.match(source, /Coba lagi data yang sama/);
    assert.match(source, /intentGuard/);
  }
  assert.match(setup, /disabled=\{outcomeUnknown\}/);
  assert.match(dialog, /disabled=\{state\.outcomeUnknown\}/);
});
