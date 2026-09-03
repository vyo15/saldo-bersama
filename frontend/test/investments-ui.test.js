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
  assert.match(page, /const InvestmentOverview = lazy\(\(\) => import\("\.\/InvestmentOverview\.jsx"\)\)/);
  assert.match(page, /Menyiapkan rincian investasi/);
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
  assert.match(overview, /owner \? <div className=\{styles\.advancedActions\}>[\s\S]*Koreksi pencatatan/);
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


test("setup Investasi fokus pada catatan RDN tanpa pilihan jenis atau broker yang redundant", async () => {
  const [setup, page, accountsPage, accountEditor, accountCard, accountPresentation] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/AccountEditorDialogs.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/shared/presentation/account.js"),
  ]);
  assert.doesNotMatch(setup, /Yang ingin ditambahkan/);
  assert.doesNotMatch(setup, /label="Broker"|option value="ajaib"|option value="other"/);
  assert.match(setup, /PORTFOLIO_DEFAULTS = Object\.freeze\(\{ name: "Catatan investasi", broker: "other" \}\)/);
  assert.match(setup, /Sumber catatan \(opsional\)/);
  assert.match(setup, /placeholder="Contoh: Ajaib"/);
  assert.match(setup, /Tidak ada koneksi atau sinkronisasi ke aplikasi investasi/);
  assert.match(setup, /source_label/);
  assert.match(setup, /accountPrefill: \{ account_type: "investment" \}/);
  assert.match(setup, /const state = needsRepair \? \{ returnTo: "\/investasi" \} : \{ accountPrefill:/);
  assert.match(page, /onSetup=\{\(mode = "portfolio"\) => setSetupMode\(mode\)\}/);
  assert.match(accountsPage, /accountPrefill\?\.account_type === "investment"/);
  assert.match(accountsPage, /initialCreateOpen: investmentPrefill/);
  assert.match(accountEditor, /Rekening Investasi tidak memerlukan nama manual/);
  assert.match(accountEditor, /tidak mengizinkan saldo negatif/);
  assert.match(accountPresentation, /ACCOUNT_TYPES\.INVESTMENT/);
  assert.match(accountPresentation, /return account\.is_owned_by_actor === false \? "Pasangan" : "Pribadi"/);
  assert.match(accountCard, /account\.account_type === "investment" \? investmentAccountOwnershipLabel\(account\)/);
  assert.match(accountCard, /showCarouselMeta = carousel && !model\.hasEwalletImage && account\.account_type !== "investment"/);
  assert.match(accountEditor, /existingInvestmentForOwnership/);
  assert.match(accountEditor, /description: "Sudah ada"/);
  assert.match(accountEditor, /disabled=\{submitting \|\| Boolean\(duplicateInvestment\)\}/);
  assert.match(accountEditor, /belum bisa dipakai sebagai RDN karena izin saldo negatif masih aktif/);
  assert.match(page, /negative: activeInvestmentAccounts\.filter/);
  assert.match(page, /linked: activeInvestmentAccounts\.filter/);
  assert.match(setup, /Buka Rekening dan perbaiki RDN/);
});


test("Investasi menjelaskan pencatatan manual dan tidak menyerupai broker atau market feed", async () => {
  const [page, overview, setup, dialog] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
  ]);
  const source = `${page}\n${overview}\n${setup}\n${dialog}`;
  assert.match(page, /tidak terhubung ke aplikasi investasi, tidak mengambil harga live, dan tidak mengirim order beli\/jual/);
  assert.match(page, /Catat saham yang benar-benar Anda miliki dan transaksi yang sudah dilakukan di aplikasi investasi/);
  assert.match(dialog, /Catat transaksi yang sudah Anda lakukan di aplikasi investasi/);
  assert.match(dialog, /Harga tidak diperbarui otomatis/);
  assert.match(overview, /bukan harga pasar live/);
  assert.match(overview, />Catat beli<\/Button>/);
  assert.match(overview, />Catat jual<\/Button>/);
  assert.match(overview, />Perbarui harga<\/Button>/);
  assert.doesNotMatch(source, /Login Ajaib|Connect broker|Hubungkan akun broker|Sinkron otomatis|Top Gainers|Top Losers|Market Movers|Auto trading/i);
});

test("prerequisite Investasi tidak memberi dead-end Member dan lot correction tidak dibulatkan turun", async () => {
  const overview = await read("src/features/investments/InvestmentOverview.jsx");
  assert.match(overview, /!hasBuyInstrument && owner \? <Button[^>]*onClick=\{\(\) => onSetup\("instrument"\)\}[^>]*>Tambah instrumen<\/Button>/);
  assert.match(overview, /Instrumen baru dikelola Administrator/);
  assert.match(overview, /const lots = lotSize > 0 \? shares \/ lotSize : 0/);
  assert.match(overview, /const hasPriceInstrument = instruments\.some\(\(item\) => heldIds\.has\(item\.instrument_id\)\)/);
  assert.match(overview, /const hasSellableHolding = portfolio\.holdings\.some/);
  assert.match(overview, /disabled=\{!hasSellableHolding\}/);
  assert.match(overview, />Catat jual<\/Button>/);
  assert.match(overview, /Saham tercatat kurang dari 1 lot/);
  assert.doesNotMatch(overview, /Math\.floor\(Number\(holding\.shares/);
  const dialog = await read("src/features/investments/InvestmentDialog.jsx");
  assert.match(dialog, /selectInvestmentInstruments\(instruments, portfolio\.holdings, "price"\)/);
  assert.match(dialog, /price: <PriceFields[^>]*instruments=\{priceInstruments\}/);
  assert.match(dialog, /formatLotCount\(holding\.shares, lotSize\)/);
  assert.doesNotMatch(dialog, /Math\.floor\(holding\.shares \/ lotSize\)/);
});

test("rekening Investasi menjadi pintu ke detail saham aktual tanpa menduplikasi broker", async () => {
  const [page, overview, holdingDetail, accountCard, desktopAccounts, accountsPage] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
  ]);
  assert.match(page, /InvestmentHoldingDetail = lazy/);
  assert.match(page, /rdnAccountId/);
  assert.match(overview, /Saham yang dimiliki/);
  assert.match(overview, /Sumber catatan/);
  assert.match(overview, /Harga rata-rata/);
  assert.match(overview, /Modal tersisa/);
  assert.match(overview, /Rincian & aktivitas/);
  assert.match(holdingDetail, /Aktivitas saham terbaru/);
  assert.match(holdingDetail, /Pembelian dicatat/);
  assert.match(holdingDetail, /Penjualan dicatat/);
  assert.match(holdingDetail, /Harga manual diperbarui/);
  assert.match(accountCard, /Lihat aset & saham/);
  assert.match(accountCard, /Cash RDN/);
  assert.match(desktopAccounts, /Lihat aset & saham/);
  assert.match(desktopAccounts, /Transfer RDN terbaru/);
  assert.match(accountsPage, /navigate\("\/investasi", \{ state: \{ rdnAccountId: item\.account_id, ensureSetup: true \} \}\)/);
  assert.match(accountsPage, /createdAccount\?\.account_type === "investment" \? \{ rdnAccountId: createdAccount\.account_id, ensureSetup: true \}/);
  assert.match(page, /else if \(intent\.ensureSetup\)/);
  assert.match(page, /setPreferredRdnAccountId\(intent\.rdnAccountId\)/);
  const setup = await read("src/features/investments/InvestmentSetupDialog.jsx");
  assert.match(setup, /preferredRdnAccountId/);
  assert.match(setup, /accounts\.some\(\(item\) => item\.account_id === preferredRdnAccountId\)/);
});

test("Bank ke RDN dan RDN ke Bank memakai Transfer composer serta menawarkan continuation ke catatan saham", async () => {
  const [page, postSave] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/transactions/components/TransactionPostSaveModal.jsx"),
  ]);
  assert.match(page, /initialType: TRANSACTION_TYPES\.TRANSFER/);
  assert.match(page, /destination_account_id: deposit \? rdnAccountId : ""/);
  assert.match(page, /source_account_id: deposit \? "" : rdnAccountId/);
  const overview = await read("src/features/investments/InvestmentOverview.jsx");
  assert.match(overview, /Transfer internal tidak menjadi pemasukan atau pengeluaran/);
  assert.match(postSave, /Transfer ke\/dari RDN tetap netral terhadap pemasukan dan pengeluaran/);
  assert.match(postSave, /label: destinationIsInvestment \? "Catat pembelian" : "Buka investasi"/);
  assert.match(postSave, /ensureSetup: true/);
  assert.match(postSave, /openAction: "buy"/);
});
