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
  for (const field of ["portfolio_value", "rdn_cash", "market_value", "realized_pl", "unrealized_pl"]) assert.match(overview, new RegExp(`summary\\?\\.${field}`));
  assert.match(overview, /Total portfolio = nilai saham \+ Cash RDN/);
  assert.match(overview, /ProgressBar/);
  assert.doesNotMatch(`${page}\n${overview}`, /Market Movers|Top Gainers|Top Losers|Popular Investment|market history|market API/i);
});

test("aksi Investasi capability-driven, koreksi Administrator-only, dan activity memakai event eksplisit", async () => {
  const [overview, model] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(overview, /if \(!portfolio\.can_operate\)/);
  assert.match(overview, /owner \? <SheetAction icon=\{FiEdit3\} title="Koreksi catatan"/);
  assert.match(overview, /Cash RDN keluar/);
  assert.match(overview, /Cash RDN masuk/);
  assert.match(overview, /Aktivitas saham terbaru/);
  for (const label of ["Pembelian dicatat", "Penjualan dicatat", "Harga manual diperbarui", "Koreksi dicatat", "Posisi awal dicatat"]) assert.match(model, new RegExp(label));
});

test("styling Investasi memakai token tema dan kontrak responsive mobile canonical", async () => {
  const styles = await Promise.all([
    "InvestmentsPage.module.css",
    "PortfolioCard.module.css",
    "InvestmentForm.module.css",
    "InvestmentHero.module.css",
    "HoldingCard.module.css",
    "InvestmentActivity.module.css",
    "InvestmentShared.module.css",
  ].map((name) => read(`src/features/investments/${name}`))).then((parts) => parts.join("\n"));
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.quickAction \{[\s\S]*?min-height:\s*3\.25rem;/);
  assert.match(styles, /\.holdingMetrics \{[\s\S]*?display:\s*none;/);
  assert.match(styles, /\.segment \{[\s\S]*?display:\s*flex;/);
  assert.match(styles, /font-size:\s*var\(--mobile-native-control-font-size\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
});

test("first-time setup RDN kembali otomatis ke Investasi dan kompatibilitas accountPrefill tetap dibaca", async () => {
  const [setup, accountsPage, continuation, accountEditor, accountPresentation] = await Promise.all([
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/shared/workflows/investmentContinuation.js"),
    read("src/features/accounts/components/AccountEditorDialogs.jsx"),
    read("src/shared/presentation/account.js"),
  ]);
  assert.match(setup, /investmentRdnAccountSetupState/);
  assert.match(continuation, /accountPrefill: \{ account_type: "investment" \}/);
  assert.match(continuation, /state\.accountPrefill\?\.account_type === "investment"/);
  assert.match(continuation, /state\.workflowSource === "accounts" && state\.workflowAction === "setup-portfolio"/);
  assert.match(continuation, /!path\.startsWith\("\/\/"\)/);
  assert.match(accountsPage, /initialCreateOpen: investmentRdnFlow/);
  assert.match(accountsPage, /action: "setup-portfolio"/);
  assert.match(accountsPage, /rdnAccountId: accountId/);
  assert.match(accountEditor, /Nama pembeda RDN/);
  assert.match(accountEditor, /BCA ••••1234/);
  assert.match(accountEditor, /Nama pembeda RDN \(opsional\)/);
  assert.match(accountEditor, /existingAccounts/);
  assert.match(accountPresentation, /investmentRdnDisplayLabel/);
  assert.match(accountPresentation, /Pribadi/);
  assert.match(accountPresentation, /Bersama/);
  assert.match(accountPresentation, /Pasangan/);
});

test("Investasi menjelaskan pencatatan manual dan memakai terminologi pencatatan, bukan order trading", async () => {
  const [page, overview, setup, dialog, detail] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
  ]);
  const source = `${page}\n${overview}\n${setup}\n${dialog}\n${detail}`;
  assert.match(page, /tidak terhubung ke aplikasi investasi, tidak mengambil harga live, dan tidak mengirim order beli\/jual/);
  assert.match(dialog, /Catat transaksi yang sudah Anda lakukan di aplikasi investasi/);
  assert.match(dialog, /Harga tidak diperbarui otomatis/);
  assert.match(overview, /bukan harga pasar live/);
  assert.match(overview, /aria-label="Catat pembelian">Catat beli<\/Button>/);
  assert.match(overview, /aria-label="Catat penjualan">Catat jual<\/Button>/);
  assert.match(overview, />Lainnya<\/span>/);
  assert.match(overview, /title="Perbarui harga"/);
  assert.match(detail, />Catat penjualan<\/Button>/);
  assert.doesNotMatch(source, /Login Ajaib|Connect broker|Hubungkan akun broker|Sinkron otomatis|Top Gainers|Top Losers|Market Movers|Auto trading|Place order/i);
});

test("prerequisite Investasi tidak memberi dead-end Member dan lot correction tidak dibulatkan turun", async () => {
  const [overview, dialog] = await Promise.all([
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
  ]);
  assert.match(overview, /!state\.hasBuyInstrument/);
  assert.match(overview, />Tambah instrumen<\/Button>/);
  assert.match(overview, /Instrumen baru dikelola Administrator/);
  assert.match(overview, /const lots = lotSize > 0 \? shares \/ lotSize : 0/);
  assert.match(overview, /const hasPriceInstrument = instruments\.some\(\(item\) => heldIds\.has\(item\.instrument_id\)\)/);
  assert.match(overview, /const hasSellableHolding = portfolio\.holdings\.some/);
  assert.match(overview, /disabled=\{!state\.hasSellableHolding\}/);
  assert.match(overview, /Holding tercatat kurang dari 1 lot/);
  assert.doesNotMatch(overview, /Math\.floor\(Number\(holding\.shares/);
  assert.match(dialog, /selectInvestmentInstruments\(instruments, portfolio\.holdings, "price"\)/);
  assert.match(dialog, /formatLotCount\(holding\.shares, lotSize\)/);
  assert.doesNotMatch(dialog, /Math\.floor\(holding\.shares \/ lotSize\)/);
});

test("rekening Investasi menjadi pintu ke holding aktual dan portfolio selalu menyebut Cash RDN yang terikat", async () => {
  const [page, overview, holdingDetail, accountCard, desktopAccounts, setup] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/investments/InvestmentHoldingDetail.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/investments/InvestmentSetupDialog.jsx"),
  ]);
  assert.match(page, /InvestmentHoldingDetail = lazy/);
  assert.match(overview, /Sumber catatan/);
  assert.match(overview, /Satu portfolio ini selalu menggunakan Cash RDN dari rekening di atas/);
  assert.match(overview, /Average cost/);
  assert.match(holdingDetail, /Modal tercatat/);
  assert.match(holdingDetail, /Aktivitas saham terbaru/);
  assert.match(accountCard, /Lihat aset & saham/);
  assert.match(accountCard, /Cash RDN/);
  assert.match(desktopAccounts, /Lihat aset & saham/);
  assert.match(desktopAccounts, /Transfer RDN terbaru/);
  assert.match(setup, /investmentRdnDisplayLabel\(item\)/);
  assert.match(setup, /initialRdnAccountId/);
});

test("Bank ↔ RDN memakai Transfer composer, prefill arah/nominal, lalu kembali ke konteks Investasi", async () => {
  const [page, overview, postSave, composer, continuation, transactionForm] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentOverview.jsx"),
    read("src/features/transactions/components/TransactionPostSaveModal.jsx"),
    read("src/app/TransactionComposerContext.jsx"),
    read("src/shared/workflows/investmentContinuation.js"),
    Promise.all([read("src/features/transactions/TransactionForm.jsx"), read("src/features/transactions/transactionFormController.js")]).then((parts) => parts.join("\n")),
  ]);
  assert.match(page, /initialType: TRANSACTION_TYPES\.TRANSFER/);
  assert.match(page, /destination_account_id: deposit \? rdnAccountId : ""/);
  assert.match(page, /source_account_id: deposit \? "" : rdnAccountId/);
  assert.match(page, /amount: suggestedAmount > 0 \? String\(suggestedAmount\) : ""/);
  assert.match(page, /transaction_date: suggestedDate/);
  assert.match(page, /draft\?\.trade_date/);
  assert.match(overview, /Tambah dana ke RDN/);
  assert.match(overview, /Tarik dana dari RDN/);
  assert.match(composer, /continuation/);
  assert.match(postSave, /Kembali ke pembelian/);
  assert.match(postSave, /doneLabel/);
  assert.match(postSave, /closeAction/);
  assert.match(postSave, /investmentContinuationState/);
  assert.match(transactionForm, /transaction_date: String\(source\.transaction_date \|\| base\.transaction_date\)/);
  assert.match(continuation, /source: INVESTMENT_SOURCE/);
  assert.match(continuation, /returnTo/);
  assert.match(continuation, /payload/);
});

test("draft pembelian dipertahankan saat Cash RDN kurang dan dipulihkan setelah transfer", async () => {
  const [dialog, page, continuation] = await Promise.all([
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/shared/workflows/investmentContinuation.js"),
  ]);
  assert.match(dialog, /Draft pembelian akan dipertahankan setelah Transfer selesai/);
  assert.match(dialog, /onFundRdn\(portfolio, shortage, buyDraft\(form\)\)/);
  assert.match(dialog, /instrument_id: form\.instrument_id/);
  assert.match(dialog, /lots: form\.lots/);
  assert.match(dialog, /price_per_share: form\.price_per_share/);
  assert.match(dialog, /fee_amount: form\.fee_amount/);
  assert.match(dialog, /trade_date: form\.trade_date/);
  assert.match(dialog, /notes: form\.notes/);
  assert.match(page, /initialDraft: continuation\.payload\.draft \|\| null/);
  assert.match(page, /action: "buy"/);
  assert.match(page, /draft: draft \|\| \{\}/);
  assert.match(continuation, /continue-after-rdn-funding/);
});

test("onboarding existing investment memakai opening_position, Cash RDN awal, dan bukan fake buy", async () => {
  const [page, dialog, api, model] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/investments.api.js"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(page, /Portfolio siap\. Saya mau mulai dari:/);
  assert.match(page, /Mulai mencatat transaksi baru/);
  assert.match(page, /Saya sudah punya saham/);
  assert.match(page, /Tambah posisi awal lain/);
  assert.match(dialog, /opening_position: createOpeningPosition/);
  assert.match(dialog, /Jumlah lembar/);
  assert.match(dialog, /Total modal \/ cost basis/);
  assert.match(dialog, /Average cost tercatat/);
  assert.match(dialog, /Harga referensi saat ini/);
  assert.match(dialog, /Cash RDN awal/);
  assert.match(dialog, /tidak ada transfer atau pemasukan\/pengeluaran yang dibuat otomatis/);
  assert.match(api, /investments\.openingPositions\.create/);
  assert.match(model, /opening_position/);
});

test("penjualan selesai di Cash RDN; rekonsiliasi menampilkan semua perbandingan dan koreksi tetap eksplisit", async () => {
  const [page, dialog] = await Promise.all([
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/investments/InvestmentDialog.jsx"),
  ]);
  assert.match(page, /Penjualan saham selesai dicatat/);
  assert.match(page, /sudah menjadi Cash RDN/);
  assert.match(page, /<Button type="button" variant="primary" onClick=\{onDismiss\}>Selesai<\/Button>/);
  assert.match(page, />Tarik ke rekening<\/Button>/);
  assert.match(page, />Catat pembelian lain<\/Button>/);
  assert.match(dialog, /holding_comparisons \|\| result\?\.holding_differences/);
  assert.match(dialog, /Tercatat/);
  assert.match(dialog, /aktual/);
  assert.match(dialog, /selisih/);
  assert.match(dialog, />Periksa histori<\/Button>/);
  assert.match(dialog, />Catat koreksi<\/Button>/);
  assert.match(dialog, /tidak menyesuaikan portfolio secara otomatis/);
});
