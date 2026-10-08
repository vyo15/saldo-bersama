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
  assert.match(page, /Mulai catat aset investasi/);
  assert.match(page, /help="Investasi adalah pencatatan manual\. Saldo Bersama tidak terhubung ke broker/);
  assert.match(page, /actions=\{hasInvestmentHistory \? <Button/);
  assert.match(page, /const hasInvestmentHistory = positionCount > 0 \|\| activityCount > 0/);
  assert.match(page, /aria-label="Tambah investasi">Tambah investasi<\/Button>/);
  assert.match(overview, /const total = Number\(values\.market_value \|\| 0\)/);
  assert.match(overview, /Modal aktif/);
  assert.match(overview, /Nilai saat ini/);
  assert.match(overview, /Total investasi tercatat/);
  assert.match(overview, />Aset <span>/);
  assert.match(overview, />Aktivitas /);
  assert.match(overview, />Semua<\/button>/);
  assert.match(overview, />Saham<\/button>/);
  assert.match(overview, />Reksa Dana<\/button>/);
  assert.match(overview, /<strong><Money value=\{holding\.market_value\} \/><\/strong>/);
  assert.match(overview, /<Money value=\{unrealized\} \/>\{returnPercent != null \? ` \(\$\{percentLabel\(returnPercent\)\}\)`/);
  assert.doesNotMatch(overview, /FiChevronRight|holdingMetrics|assetType/);
  assert.match(overview, /Catatan saldo lama tidak dicampurkan di sini/);
  assert.doesNotMatch(`${page}\n${overview}`, /Top up RDN|Tarik RDN|Sumber catatan|Ajaib|Bibit|Indodax|Market Movers|Top Gainers|Top Losers/i);
});

test("route Investasi meneruskan konteks Target ke setup overlay tanpa reference error", async () => {
  const page = await read("src/features/investments/InvestmentsPage.jsx");
  assert.match(page, /const \{ data, goals, user, setupOpen, setupGoalId,/);
  assert.match(page, /initialGoalId=\{setupGoalId\}/);
  assert.match(page, /const page = \{ data, goals, user, setupOpen, setupGoalId,/);
  assert.match(page, /resolveQuickRecordInvestment/);
});

test("aksi Investasi berada pada detail aset dan tetap capability-driven", async () => {
  const [overview, detail, model, presentation] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
    read("src/features/investments/investments.model.js"),
    read("src/features/investments/investmentPresentation.js"),
  ]);
  assert.match(overview, /!portfolio\.can_operate \? <span className="sr-only">Hanya dapat dilihat<\/span>/);
  assert.match(detail, /portfolio\.can_operate \? <Button[\s\S]*?>Perbarui nilai<\/Button>/);
  assert.match(detail, /portfolio\.can_operate \? <Button[\s\S]*?>Beli<\/Button>/);
  assert.match(detail, /canSell \? <Button[\s\S]*?>Jual<\/Button>/);
  assert.match(detail, /Riwayat aset/);
  assert.match(detail, /Posisi selesai/);
  assert.match(detail, /Hasil direalisasi/);
  for (const label of ["Pembelian dicatat", "Penjualan dicatat", "Harga manual", "Nilai manual", "Koreksi dicatat", "Posisi awal dicatat"]) assert.match(`${model}\n${presentation}`, new RegExp(label));
});

test("styling Investasi memakai token tema dan kontrak responsive mobile canonical", async () => {
  const styles = await Promise.all([
    "InvestmentsPage.module.css",
    "InvestmentForm.module.css",
    "InvestmentHero.module.css",
    "HoldingCard.module.css",
    "InvestmentActivity.module.css",
    "InvestmentShared.module.css",
  ].map((name) => read(`src/features/investments/${name}`))).then((parts) => parts.join("\n"));
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.holdingValueBlock \{[\s\S]*?justify-items:\s*end;/);
  assert.match(styles, /\.segment \{[\s\S]*?display:\s*flex;/);
  assert.match(styles, /\.assetFilters/);
  assert.match(styles, /font-size:\s*var\(--mobile-native-control-font-size\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});

test("Tambah investasi membedakan posisi lama dan pembelian RDN baru", async () => {
  const [setup, api, model] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/investments.api.js"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(setup, /title="Tambah investasi"/);
  assert.match(setup, /InvestmentAssetPicker/);
  assert.match(setup, /label=\{mutualFund \? "Jumlah unit" : "Jumlah lot"\}/);
  assert.match(setup, /Harga rata-rata per saham/);
  assert.match(setup, /Harga saham saat ini/);
  assert.match(setup, /Tanggal posisi/);
  assert.match(setup, /Sudah punya/);
  assert.match(setup, /Belum punya/);
  assert.match(setup, /recordInvestmentAssetPurchase\(payload\)/);
  assert.match(setup, /createInvestmentAssetPosition\(payload\)/);
  assert.match(setup, /Saldo RDN tercatat akan berkurang/);
  assert.match(setup, /Tidak memotong RDN/);
  assert.match(setup, /initialGoalId/);
  assert.match(setup, /\.\.\.\(goalId \? \{ goal_id: goalId \} : \{\}\)/);
  assert.match(api, /investments\.assets\.create/);
  assert.match(model, /validateInvestmentAssetPosition/);
  assert.match(api, /investments\.assets\.recordPurchase/);
  assert.match(model, /validateInvestmentAssetPurchase/);
  assert.doesNotMatch(setup, /auto_create_rdn/);
});

test("picker Tambah investasi menggunakan pola pilih rekening dengan katalog saham dan reksa dana", async () => {
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
  assert.match(picker, /InlineSelectionPicker/);
  assert.match(picker, /instrumentOptionVisual\(item\)/);
  assert.match(picker, /placeholder=\{mutualFund \? "Pilih reksa dana" : "Pilih saham"\}/);
  assert.match(picker, /searchable/);
  assert.match(picker, /Reksa Dana/);
  assert.match(picker, /allowedTickers/);
  assert.match(picker, /existingInstruments/);
  for (const ticker of ["BBCA", "BBRI", "BMRI", "TLKM", "ASII", "ICBP", "ANTM"]) assert.match(stockCatalog, new RegExp(`ticker: "${ticker}"`));
  for (const ticker of ["IHAJJ", "CAPFIX"]) assert.match(assetCatalog, new RegExp(`ticker: "${ticker}"`));
  assert.match(assetCatalog, /asset_type: "mutual_fund"/);
  assert.match(visuals, /investmentAssetLogo\(instrument\.ticker\)/);
  assert.match(holding, /<InvestmentAssetLogo ticker=\{holding\.ticker\}/);
  assert.match(pickerStyles, /\.kindSwitch \{/);
  assert.doesNotMatch(pickerStyles, /\.option \{/);
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
  assert.match(overview, /Money value=\{holding\.market_value\}/);
  assert.match(overview, /Money value=\{unrealized\}/);
  assert.match(overview, /percentLabel\(returnPercent\)/);
  assert.doesNotMatch(overview, /holdingMetrics|holdingQuantity|holdingChevron|assetType/);
  assert.match(holdingDetail, /Modal tercatat/);
  assert.match(holdingDetail, /Nilai tercatat/);
  assert.match(holdingDetail, /Hasil belum direalisasi/);
  assert.match(holdingDetail, /Riwayat aset/);
  assert.match(holdingDetail, /Total hasil penjualan/);
  assert.doesNotMatch(`${overview}\n${holdingDetail}`, /Saldo RDN|Top up|Tarik ke rekening/i);
});

test("Buy Sell Investasi menjelaskan perbedaan cash RDN eksplisit dan pencatatan internal", async () => {
  const [page, dialog, detail] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
  ]);
  assert.match(page, /tidak mengirim order beli\/jual/);
  assert.match(page, /RDN eksplisit memperbarui cash RDN tercatat/);
  assert.match(dialog, /Cash RDN tercatat akan berkurang/);
  assert.match(dialog, /Cash RDN tercatat akan bertambah/);
  assert.match(dialog, /rekening internal hanya menambah catatan posisi/);
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

test("form tambah investasi ringkas tanpa mengubah intent dan perhitungan RDN", async () => {
  const [setup, styles, picker, sharedPicker] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentForm.module.css"),
    read("src/features/investments/InvestmentAssetPicker.jsx"),
    read("src/components/common/InlineSelectionPicker.jsx"),
  ]);
  assert.match(setup, /className=\{`\$\{styles\.form\} \$\{styles\.setupForm\}`\}/);
  assert.match(setup, /setupOptional/);
  assert.match(setup, /setupImpact/);
  assert.match(setup, /PurchaseSummary form=\{form\} asset=\{asset\} account=/);
  assert.match(setup, /PositionSummary form=\{form\} asset=\{asset\}/);
  assert.match(picker, /InlineSelectionPicker/);
  assert.match(picker, /existingTickers\.has\(item\.ticker\)/);
  assert.match(picker, /allowedTickerSet\.has\(item\.ticker\)/);
  assert.match(picker, /onSelect\?\.\(selected\)/);
  assert.match(sharedPicker, /role="combobox"/);
  assert.match(sharedPicker, /role="listbox"/);
  assert.match(styles, /\.setupForm \.reviewGrid > div/);
  assert.match(styles, /@media \(min-width: 430px\) and \(max-width: 620px\)/);
});
