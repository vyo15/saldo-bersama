import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import * as featherIcons from "react-icons/fi";
import {
  accountCardOwnershipLabel,
  accountCardholderName,
  accountCardNumberGroups,
  accountDisplayLabel,
  accountTypeUsesAutomaticName,
  defaultAccountName,
  accountProviderLabel,
  accountNumberGroups,
  accountOwnershipLabel,
  investmentAccountOwnershipLabel,
  filterAccountsByOwnership,
  detectBankTemplate,
  detectEwalletTemplate,
  formatAccountNumber,
  normalizeAccountNumber,
} from "../src/shared/presentation/account.js";
import { accountTransactionDirection } from "../src/shared/presentation/transactionCore.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const webpSize = async (url) => {
  const buffer = await readFile(url);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8 ") {
    const signature = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    assert.notEqual(signature, -1, "header VP8 tidak ditemukan");
    return {
      width: buffer.readUInt16LE(signature + 3) & 0x3fff,
      height: buffer.readUInt16LE(signature + 5) & 0x3fff,
    };
  }
  throw new Error(`Format WebP ${chunk} belum didukung test`);
};

const webpHasAlpha = async (url) => {
  const buffer = await readFile(url);
  if (buffer.toString("ascii", 12, 16) !== "VP8X") return false;
  return (buffer[20] & 0x10) === 0x10;
};

test("nama rekening otomatis hanya dipakai untuk jenis yang memang tidak perlu nama manual", () => {
  assert.equal(accountTypeUsesAutomaticName("cash"), true);
  assert.equal(accountTypeUsesAutomaticName("ewallet"), true);
  assert.equal(accountTypeUsesAutomaticName("emergency_fund"), true);
  assert.equal(accountTypeUsesAutomaticName("investment"), true);
  assert.equal(accountTypeUsesAutomaticName("bank"), false);
  assert.equal(accountTypeUsesAutomaticName("savings"), false);
  assert.equal(defaultAccountName({ account_type: "cash" }), "Tunai");
  assert.equal(defaultAccountName({ account_type: "emergency_fund" }), "Dana darurat");
  assert.equal(defaultAccountName({ account_type: "investment" }), "Investasi");
  assert.equal(defaultAccountName({ account_type: "ewallet", ewallet_template: "dana" }), "DANA");
  assert.equal(defaultAccountName({ account_type: "ewallet", ewallet_template: "generic" }), "E-wallet lainnya");
});

test("template kartu memakai field bank_template dan fallback nama hanya untuk data legacy", () => {
  assert.equal(detectBankTemplate({ account_type: "bank", bank_template: "bni", name: "Tabungan nikah" }), "bni");
  assert.equal(detectBankTemplate({ account_type: "bank", bank_template: "generic", name: "Tabungan BCA" }), "generic");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Rekening gaji · BNI" }), "bni");
  assert.equal(detectBankTemplate({ account_type: "bank", name: "Tabungan Bank Central Asia" }), "bca");
  assert.equal(detectBankTemplate({ account_type: "cash", bank_template: "bni", name: "Kas BNI" }), "generic");
  assert.equal(detectBankTemplate({ account_type: "bank", bank_template: "tidak-valid", name: "Bank lainnya" }), "generic");
});


test("template e-wallet memprioritaskan ewallet_template dan nama hanya menjadi fallback legacy", () => {
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", ewallet_template: "dana", name: "Belanja harian" }), "dana");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", ewallet_template: "generic", name: "ShopeePay belanja" }), "generic");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", ewallet_template: "tidak-valid", name: "OVO pribadi" }), "generic");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "ShopeePay belanja" }), "shopeepay");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "Dompet DANA" }), "dana");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "Go Pay utama" }), "gopay");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "OVO pribadi" }), "ovo");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "Link Aja kebutuhan" }), "linkaja");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "Dompet digital" }), "generic");
  assert.equal(detectEwalletTemplate({ account_type: "ewallet", name: "Dana darurat" }), "generic");
  assert.equal(detectEwalletTemplate({ account_type: "cash", ewallet_template: "dana", name: "DANA kas" }), "generic");
});

test("nama pemegang kartu membersihkan suffix legacy tanpa menambahkan bank baru", () => {
  assert.equal(accountCardholderName("Vio Yusup Iskandar · BNI"), "Vio Yusup Iskandar");
  assert.equal(accountCardholderName("Vio Yusup Iskandar - BCA"), "Vio Yusup Iskandar");
  assert.equal(accountCardholderName("Tabungan nikah"), "Tabungan nikah");
});

test("nomor rekening dinormalisasi dan dikelompokkan empat digit untuk kartu", () => {
  assert.equal(normalizeAccountNumber("1234-5678 9012 3456"), "1234567890123456");
  assert.deepEqual(accountNumberGroups("1234567890123456"), ["1234", "5678", "9012", "3456"]);
  assert.deepEqual(accountNumberGroups(""), ["••••", "••••", "••••", "••••"]);
  assert.deepEqual(accountNumberGroups("", { placeholder: false }), []);
  assert.equal(formatAccountNumber("1234567890123456", { placeholder: false }), "1234 5678 9012 3456");
  assert.deepEqual(accountCardNumberGroups("123456789012345678901234"), ["••••", "3456", "7890", "1234"]);
});

test("label kepemilikan rekening menampilkan Bersama atau nama pengguna, bukan role internal", () => {
  assert.equal(accountOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(accountOwnershipLabel({ owner_scope: "personal", owner_name: "Puput" }), "Puput");
  assert.equal(accountDisplayLabel({ name: "BTN", account_type: "bank", owner_scope: "personal", owner_name: "Puput" }), "BTN · Puput");
  assert.equal(accountDisplayLabel({ name: "DANA · Belanja", account_type: "ewallet", ewallet_template: "dana", owner_scope: "shared" }), "DANA · Belanja");
});

test("filter rekening membedakan milik saya, pasangan, dan bersama tanpa mengubah data rekening", () => {
  const accounts = [
    { account_id: "self", owner_scope: "personal", owner_user_id: "u-1", owner_name: "Vio Yusup" },
    { account_id: "partner", owner_scope: "personal", owner_user_id: "u-2", owner_name: "Fuji Astuti" },
    { account_id: "shared", owner_scope: "shared" },
  ];
  const currentUser = { user_id: "u-1", name: "Vio Yusup" };
  assert.deepEqual(filterAccountsByOwnership(accounts, "self", currentUser).map((item) => item.account_id), ["self"]);
  assert.deepEqual(filterAccountsByOwnership(accounts, "partner", currentUser).map((item) => item.account_id), ["partner"]);
  assert.deepEqual(filterAccountsByOwnership(accounts, "shared", currentUser).map((item) => item.account_id), ["shared"]);
  assert.equal(filterAccountsByOwnership(accounts, "all", currentUser), accounts);
});

test("arah transaksi rekening konsisten untuk desktop dan mobile", () => {
  assert.deepEqual(accountTransactionDirection({ transaction_type: "expense", status: "active" }, "acc-1"), { prefix: "−", tone: "negative" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "income", status: "active" }, "acc-1"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "refund", status: "active" }, "acc-1"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "transfer", status: "active", source_account_id: "acc-1", destination_account_id: "acc-2" }, "acc-1"), { prefix: "−", tone: "negative" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "transfer", status: "active", source_account_id: "acc-1", destination_account_id: "acc-2" }, "acc-2"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "expense", status: "cancelled" }, "acc-1"), { prefix: "", tone: "neutral" });
});

test("halaman rekening menjaga workspace desktop dan mobile tetap ringkas dengan analitik di Riwayat", async () => {
  const [page, accountSheets, mobileExperience, mobileActivity, mobileTransfer, accountEditors, desktopWorkspace, desktopStyles, card, accountStyleSources, cardStyles, categoryPage, reconciliationPage, transactionPresentation] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/MobileAccountSheets.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.jsx"),
    read("src/features/accounts/components/MobileAccountActivity.jsx"),
    read("src/features/accounts/components/MobileAccountTransferAction.jsx"),
    read("src/features/accounts/components/AccountEditorDialogs.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    Promise.all([
      read("src/features/accounts/AccountsPage.module.css"),
      read("src/features/accounts/components/AccountEditorDialogs.module.css"),
      read("src/features/accounts/components/MobileAccountActivity.module.css"),
      read("src/features/accounts/components/MobileAccountsExperience.module.css"),
      read("src/features/accounts/components/MobileAccountTransferAction.module.css"),
    ]).then(([accountsPageStyles, accountEditorStyles, mobileActivityStyles, mobileExperienceStyles, mobileTransferStyles]) => ({
      accountsPageStyles,
      accountEditorStyles,
      mobileActivityStyles,
      mobileExperienceStyles,
      mobileTransferStyles,
      combined: [accountsPageStyles, accountEditorStyles, mobileActivityStyles, mobileExperienceStyles, mobileTransferStyles].join("\n"),
    })),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
    read("src/features/categories/CategoriesPage.jsx"),
    Promise.all([
      read("src/features/reconciliations/ReconciliationsPage.jsx"),
      read("src/features/reconciliations/components/ReconciliationForm.jsx"),
      read("src/features/reconciliations/components/ReconciliationHistory.jsx"),
    ]).then((parts) => parts.join("\n")),
    read("src/shared/presentation/transaction.js"),
  ]);
  const [mobileTransferFields, transactionForm] = await Promise.all([
    read("src/features/transactions/MobileTransferFields.jsx"),
    read("src/features/transactions/TransactionForm.jsx"),
  ]);
  assert.match(accountEditors, /mobileColumns=\{2\}/);
  assert.match(accountEditors, /Butuh lebih dari satu\? Tambah nama pembeda/);
  assert.match(accountEditors, /Nama pembeda \(opsional\)/);
  assert.match(page, /\[automaticName, qualifier\]\.filter\(Boolean\)\.join\(" · "\)/);
  const accountPageSource = `${page}
${accountSheets}
${mobileExperience}
${mobileActivity}
${mobileTransfer}
${accountEditors}`;
  const {
    accountsPageStyles,
    accountEditorStyles,
    mobileActivityStyles,
    mobileExperienceStyles,
    mobileTransferStyles,
    combined: pageStyles,
  } = accountStyleSources;
  const accountsApi = await read("src/features/accounts/accounts.api.js");
  const brandAssets = await read("src/shared/presentation/accountBrandAssets.js");
  const financialSuccessStyles = await read("src/components/feedback/FinancialSuccessOverlay.module.css");

  assert.match(accountPageSource, /title="Rekening"/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/MobileAccountSheets\.jsx"\)\)/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/MobileAccountsExperience\.jsx"\)\)/);
  assert.match(mobileExperience, /lazy\(\(\) => import\("\.\/MobileAccountActivity\.jsx"\)\)/);
  assert.match(mobileExperience, /return useMemo\(\(\) => \(\{/);
  assert.match(mobileExperience, /cancelMobileStackAnimation/);
  assert.match(mobileExperience, /refs\.animatingRef\.current = false/);
  assert.match(mobileExperience, /refs\.animationTokenRef\.current \+= 1/);
  assert.match(mobileExperience, /useEffect\(\(\) => \(\) => cancelMobileStackAnimation\(\), \[cancelMobileStackAnimation\]\)/);
  assert.match(mobileExperience, /MOBILE_SYNTHETIC_CLICK_GUARD_MS = 500/);
  assert.match(mobileExperience, /performance\.now\(\) < gesture\.suppressClickUntil/);
  assert.doesNotMatch(mobileExperience, /setTimeout\(\(\) => \{ refs\.gestureRef\.current\.suppressClick = false;/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/AccountEditorDialogs\.jsx"\)\)/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/DesktopAccountsWorkspace\.jsx"\)\)/);
  assert.doesNotMatch(page, /import DesktopAccountsWorkspace from "\.\/components\/DesktopAccountsWorkspace\.jsx";/);
  assert.match(page, /\(createDialogOpen \|\| editAccount\) \? \(/);
  assert.doesNotMatch(accountSheets, /title="Daftar rekening"/);
  assert.match(accountPageSource, /aria-label="Tambah rekening"/);
  assert.match(accountPageSource, /title="Tambah rekening"/);
  assert.match(accountPageSource, /create-account-form/);
  assert.doesNotMatch(accountPageSource, /create-category-form|categories\.list|Kategori transaksi/);
  assert.match(accountPageSource, /account_number/);
  assert.match(cardStyles, /\.accountNumber \{[^}]*justify-content:\s*flex-start;[^}]*gap:\s*clamp\(/s);
  assert.match(accountPageSource, /bank_template/);
  assert.match(accountPageSource, /ewallet_template/);
  assert.match(accountPageSource, /Provider E-wallet/);
  assert.doesNotMatch(accountPageSource, /initialFocusRef=\{createNameInputRef\}|createNameInputRef/);
  assert.match(accountPageSource, /const BankTemplateField =/);
  assert.match(accountPageSource, /Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening/);
  assert.match(accountPageSource, /accountForm\.account_type === "bank" \? <BankTemplateField/);
  assert.doesNotMatch(accountPageSource, /applyBankTemplateToName/);
  assert.match(accountPageSource, /<span>No rekening \*<\/span>/);
  assert.match(accountPageSource, /useApiResource\("users\.list"/);
  assert.match(accountPageSource, /owner_user_id/);
  assert.match(accountPageSource, /legend="Kepemilikan \*"/);
  assert.match(accountPageSource, /name="account-ownership"/);
  assert.match(accountPageSource, /options=\{options\}[\s\S]*required/);
  assert.doesNotMatch(accountPageSource, /userOptionLabel/);
  assert.match(accountPageSource, /member\.is_current \? "Saya"/);
  assert.doesNotMatch(accountPageSource, /<span>Pemilik rekening \*<\/span>/);
  assert.match(accountPageSource, /Promise\.allSettled\(\[accountsResource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(accountPageSource, /accountsResult\.status === "rejected"/);
  assert.match(accountPageSource, /selectedAccountId/);
  assert.match(page, /DesktopAccountsWorkspace/);
  assert.match(page, /import \{ APP_MEDIA \} from "\.\.\/\.\.\/config\/layout\.js";/);
  assert.match(page, /useMobileAccountsLayout = \(\) => useMediaQuery\(APP_MEDIA\.mobile\)/);
  assert.match(page, /mobileLayout[\s\S]*\? <Suspense fallback=\{null\}><MobileAccountsExperience[\s\S]*: <Suspense fallback=\{null\}><DesktopAccountsWorkspace/);
  assert.match(page, /mobileLayout \? <AccountSheets/);
  assert.match(page, /selectedAccount=\{selectedAccount\}/);
  assert.match(page, /onSelectAccount=\{setSelectedAccountId\}/);
  assert.doesNotMatch(page, /mobileDetailOpen|detailColumnOpen|useFocusTrap/);
  assert.match(desktopWorkspace, /useApiResource\("transactions\.list"/);
  assert.match(desktopWorkspace, /useApiResource\("reports\.monthly"/);
  assert.match(desktopWorkspace, /import \{ APP_MEDIA \} from "\.\.\/\.\.\/\.\.\/config\/layout\.js";/);
  assert.match(desktopWorkspace, /useDesktopWorkspaceEnabled = \(\) => useMediaQuery\(APP_MEDIA\.desktop, \{ fallback: true \}\)/);
  const featherImportBlock = desktopWorkspace.match(/import\s*\{([\s\S]*?)\}\s*from "react-icons\/fi";/)?.[1] || "";
  const featherIconNames = [...featherImportBlock.matchAll(/\b(Fi[A-Za-z0-9]+)\b/g)].map((match) => match[1]);
  assert.ok(featherIconNames.length > 0, "Concept A harus mendeklarasikan icon Feather yang dipakai.");
  for (const iconName of featherIconNames) {
    assert.equal(typeof featherIcons[iconName], "function", `${iconName} harus merupakan export react-icons/fi yang valid.`);
  }
  assert.match(desktopWorkspace, /enabled: desktopEnabled && Boolean\(selectedId\)/);
  assert.match(desktopWorkspace, /if \(!desktopEnabled \|\| !selectedAccount\) return null;/);
  assert.match(desktopWorkspace, /<AccountVisual account=\{account\} carousel \/>/);
  assert.match(transactionPresentation, /accountTransactionDirection,[\s\S]*from "\.\/transactionCore\.js"/);
  assert.match(desktopWorkspace, /accountTransactionDirection\(item, selectedAccountId\)/);
  assert.match(mobileActivity, /accountTransactionDirection\(item, selectedAccountId\)/);
  assert.doesNotMatch(desktopWorkspace, /const transactionDirection/);
  assert.doesNotMatch(mobileActivity, /const transactionDirection/);
  assert.match(desktopWorkspace, /Rekening terpilih/);
  assert.match(desktopWorkspace, /Dana tersedia/);
  assert.match(desktopWorkspace, /Dialokasikan/);
  assert.match(desktopWorkspace, /ACCOUNT_AVAILABLE_BALANCE_HINT/);
  assert.match(desktopWorkspace, /ACCOUNT_ALLOCATED_BALANCE_HINT/);
  assert.match(desktopWorkspace, /account\.available_balance \?\? account\.balance/);
  assert.match(mobileExperience, /investment \? "Saldo RDN" : "Dana tersedia"/);
  assert.match(mobileExperience, /account\.allocated_remaining/);
  assert.doesNotMatch(mobileExperience, /<span>Tersedia<\/span>/);
  assert.doesNotMatch(mobileExperience, /<span>Saldo RDN<\/span><\/div>/);
  assert.doesNotMatch(mobileExperience, /<span>Kelola<\/span>|<span>Detail<\/span>/);
  assert.match(mobileExperience, /<span>Riwayat<\/span>/);
  assert.match(mobileExperience, /<MobileAccountTransferAction/);
  assert.match(card, /label="Dana tersedia"/);
  assert.match(card, /label="Dialokasikan"/);
  assert.match(card, /ACCOUNT_AVAILABLE_BALANCE_HINT/);
  assert.match(card, /ACCOUNT_ALLOCATED_BALANCE_HINT/);
  assert.match(card, /account.account_type === "investment"/);
  assert.match(card, /label="Tujuan dana"/);
  assert.match(desktopWorkspace, /Saldo RDN · detail aset tersedia di catatan Investasi/);
  assert.match(mobileExperience, /investment \? "Saldo RDN" : "Dana tersedia"/);
  assert.match(desktopWorkspace, /const AccountCarousel =/);
  assert.match(desktopWorkspace, /Pilih rekening/);
  assert.match(desktopWorkspace, /Filter kepemilikan rekening/);
  assert.match(desktopWorkspace, /\["self", "Saya"\]/);
  assert.match(desktopWorkspace, /\["partner", "Pasangan"\]/);
  assert.match(desktopWorkspace, /\["shared", "Bersama"\]/);
  assert.match(desktopWorkspace, /Rekening sebelumnya/);
  assert.match(desktopWorkspace, /Rekening berikutnya/);
  assert.match(desktopWorkspace, /event\.key === "ArrowLeft"/);
  assert.match(desktopWorkspace, /event\.key === "ArrowRight"/);
  assert.match(desktopWorkspace, /CAROUSEL_SWIPE_MIN_DISTANCE = 42/);
  assert.match(desktopWorkspace, /onPointerDown=\{handlePointerDown\}/);
  assert.match(desktopWorkspace, /onPointerUp=\{handlePointerEnd\}/);
  assert.match(desktopWorkspace, /aria-pressed=\{index === selectedIndex\}/);
  assert.doesNotMatch(desktopWorkspace, /OtherAccountsPanel|AccountSelectorCard|Rekening lain/);
  assert.match(desktopWorkspace, /const RecentTransactionsPanel =/);
  assert.match(desktopWorkspace, /Saldo rekening/);
  assert.match(desktopWorkspace, /Tren saldo utama/);
  assert.match(desktopWorkspace, /const AccountInsights =/);
  assert.match(desktopWorkspace, /distributionProgress/);
  assert.doesNotMatch(desktopWorkspace, /className=\{styles\.distributionRow\} aria-pressed|onSelect=\{onSelectAccount\}/);
  assert.doesNotMatch(desktopStyles, /\.distributionRow\[aria-pressed="true"\]|\.distributionRow:hover/);
  assert.match(desktopWorkspace, /onEditAccount\(account\)/);
  assert.match(desktopWorkspace, /onArchiveAccount\(account\)/);
  assert.match(desktopWorkspace, /onClick=\{\(\) => onViewTransactions\(selectedAccount\)\}/);
  assert.match(page, /onViewTransactions=\{\(item\) => navigate\("\/transaksi", \{ state: \{ accountId: item\.account_id \} \}\)\}/);
  assert.match(desktopStyles, /grid-template-columns: minmax\(0, 1\.55fr\) minmax\(20rem, \.72fr\)/);
  assert.match(desktopStyles, /position: sticky/);
  assert.match(desktopStyles, /@media \(max-width: 820px\) \{[^}]*\.desktopWorkspace \{ display: none; \}/s);
  assert.match(desktopStyles, /accountCarousel/);
  assert.match(desktopStyles, /carouselStage/);
  assert.match(desktopStyles, /carouselDots/);
  assert.doesNotMatch(desktopStyles, /accountSelectorGrid|accountSelectorMeta|miniVisual/);
  assert.match(desktopStyles, /transactionList/);
  assert.match(desktopStyles, /distributionList/);
  assert.match(desktopWorkspace, /<progress className=\{styles\.distributionProgress\}/);
  assert.match(desktopStyles, /\.ownershipFilters \{[^}]*overflow-x:\s*auto;/s);
  assert.doesNotMatch(desktopStyles, /scroll-snap-type/);
  const referencedDesktopClasses = new Set([...desktopWorkspace.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  const declaredDesktopClasses = new Set([...desktopStyles.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
  for (const className of referencedDesktopClasses) {
    assert.equal(declaredDesktopClasses.has(className), true, `DesktopAccountsWorkspace memakai styles.${className} tetapi CSS Module tidak mendeklarasikannya.`);
  }
  assert.match(accountPageSource, /mobileAccountSheet/);
  assert.doesNotMatch(mobileExperience, />Beranda<|FiArrowLeft/);
  assert.match(mobileExperience, /mobileStackHeaderTitle}>Rekening/);
  assert.match(mobileActivity, /Transaksi terbaru/);
  assert.doesNotMatch(mobileActivity, /Grafik pengeluaran|TREND_OPTIONS|chartOpen|loadAccountExpenseTrend/);
  assert.doesNotMatch(mobileActivity, /role="tab"|tabIndex=\{activeTab/);
  assert.doesNotMatch(mobileActivity, /MobileAccountTransferAction/);
  assert.match(mobileExperience, /MobileAccountTransferAction/);
  assert.match(mobileExperience, /<MobileAccountTransferAction bootstrap=\{bootstrap\} selectedAccount=\{account\}/);
  assert.doesNotMatch(mobileExperience, /placement="header"/);
  assert.match(mobileTransfer, /Transfer/);
  assert.match(mobileTransfer, /lazy\(\(\) => import\("\.\.\/\.\.\/transactions\/TransactionForm\.jsx"\)\)/);
  assert.match(mobileTransfer, /TransactionForm/);
  assert.match(mobileTransfer, /initialType=\{TRANSACTION_TYPES\.TRANSFER\}/);
  assert.match(mobileTransfer, /initialSourceAccountId=\{selectedAccount\?\.account_id \|\| ""\}/);
  assert.match(mobileTransfer, /canRepresentAccountTransfer/);
  assert.doesNotMatch(mobileTransfer, /filterByOwnership/);
  assert.match(mobileTransfer, /lockType/);
  assert.match(mobileTransfer, /notifyOnSuccess=\{false\}/);
  assert.match(mobileTransfer, /presentation="mobile-transfer"/);
  assert.match(transactionForm, /presentation = "default"/);
  assert.match(transactionForm, /isMobileTransferPresentation\(\{ presentation, isTransfer, transaction, mobileLayout \}\)/);
  assert.match(transactionForm, /<MobileTransferFields \{\.\.\.fields\} \/>/);
  assert.match(mobileTransferFields, /Dari rekening/);
  assert.match(mobileTransferFields, /Ke rekening/);
  assert.match(mobileTransferFields, /Setelah transfer/);
  assert.match(mobileTransferFields, /Total aset tetap/);
  assert.doesNotMatch(mobileTransferFields, /createTransaction|updateTransaction|transactions\.create|apiClient/);
  assert.match(mobileTransfer, /pendingSavedRef/);
  assert.match(mobileTransfer, /onTransferSaved/);
  assert.match(mobileTransfer, /Transfer memerlukan rekening sumber aktif/);
  assert.match(mobileTransfer, /FinancialSuccessOverlay/);
  assert.doesNotMatch(mobileTransfer, /createTransaction|transactions\.create/);
  assert.match(mobileActivity, /useApiResource\("transactions\.list"/);
  assert.match(mobileActivity, /account_id: selectedAccountId \|\| "all"/);
  assert.match(mobileActivity, /enabled: mobileEnabled && Boolean\(selectedAccountId\)/);
  assert.doesNotMatch(accountsApi, /loadAccountExpenseTrend|reports\.monthly|accountExpenseTrend/);
  assert.doesNotMatch(accountPageSource, /paymentHistoryPeriod|paymentHistoryResource|sheet === "history"/);
  assert.match(accountPageSource, /mobileStackCardRefs/);
  assert.match(accountPageSource, /carouselStyleAtDifference/);
  assert.match(mobileExperienceStyles, /\.mobileOwnershipFilters[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(mobileExperience, /PageInfoButton title="Tentang Rekening" label="Tentang Rekening"/);
  assert.equal((mobileExperience.match(/<PageInfoButton/g) || []).length, 1, "Satu surface mobile Rekening hanya boleh memiliki satu trigger bantuan edukatif.");
  assert.doesNotMatch(mobileExperience, /PageInfoButton title="Tentang saldo rekening"/);
  assert.doesNotMatch(mobileExperience, /Kelola semua rekening Anda/);
  assert.match(accountPageSource, /shortestCircularDifference/);
  assert.match(accountPageSource, /onPointerDown=\{handleMobileStackPointerDown\}/);
  assert.match(accountPageSource, /onPointerMove=\{handleMobileStackPointerMove\}/);
  assert.match(accountPageSource, /const progress = clamp\(-deltaX \/ swipeDistance/);
  assert.match(accountPageSource, /velocityX/);
  assert.doesNotMatch(accountPageSource, /velocityY|handleMobileStackWheel|onWheel=\{/);
  assert.match(accountPageSource, /event\.key === "ArrowLeft"/);
  assert.match(accountPageSource, /event\.key === "ArrowRight"/);
  assert.match(mobileExperience, /useReducedMotion/);
  assert.match(mobileExperience, /semanticMotionDurationMs\("emphasized"\)/);
  assert.doesNotMatch(mobileExperience, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(accountPageSource, /Geser kartu ke kiri atau kanan untuk mengganti rekening/);
  assert.match(accountPageSource, /gunakan tombol panah kiri dan kanan, atau indikator posisi/);
  assert.doesNotMatch(mobileExperience, /setMobileAccountSheet\("picker"\)|tombol Pilih rekening/);
  assert.doesNotMatch(accountSheets, /title="Pilih rekening"|MobileAccountPicker|onSelectAccount/);
  assert.match(mobileExperience, /if \(reducedMotion\) \{[\s\S]*refs\.positionRef\.current = normalizedTarget;[\s\S]*finish\(\);[\s\S]*return;/);
  assert.match(mobileExperience, /willChange = enabled \? "transform, opacity"/);
  assert.doesNotMatch(mobileExperience, /willChange = enabled \? "[^"]*(?:filter|box-shadow)/);
  assert.match(accountPageSource, /<AccountVisual account=\{account\} carousel stack \/>/);
  assert.match(cardStyles, /\.stackShadow \{[^}]*filter:\s*drop-shadow/s);
  assert.match(cardStyles, /\.stackClip \{[^}]*overflow:\s*hidden;[^}]*border-radius:\s*1\.2rem;/s);
  assert.match(cardStyles, /\.stackVisual\[data-visual-kind="ewallet"\] \.cardImage \{[^}]*inset:\s*-1\.25%;[^}]*width:\s*102\.5%;[^}]*height:\s*102\.5%;/s);
  assert.match(cardStyles, /\.stackVisual\[data-visual-kind="ewallet"\]::after \{[^}]*background:\s*none;/s);
  assert.match(cardStyles, /\.stackVisual \.cardImage \{[^}]*clip-path:\s*none;/s);
  assert.match(mobileExperience, /MobileBalanceSummary/);
  assert.match(mobileExperience, /Sembunyikan nominal rekening/);
  assert.match(mobileExperience, /<span>Dialokasikan<\/span>/);
  assert.match(mobileExperience, /Filter kepemilikan rekening/);
  for (const className of ["mobileOwnershipFilters", "mobileOwnershipFilter", "mobileCarouselDots", "mobileBalanceSummary", "mobileBalanceStats", "mobileQuickActions", "mobileQuickAction"]) {
    assert.match(mobileExperience, new RegExp(String.raw`styles\.${className}\b`));
    assert.match(mobileExperienceStyles, new RegExp(String.raw`\.${className}\b`));
  }
  assert.doesNotMatch(page, /account\.owner_scope === "shared" \? "Bersama" : "Pribadi"/);
  assert.match(accountPageSource, /setMobileAccountSheet\("detail"\)/);
  assert.doesNotMatch(accountPageSource, /title="Pembayaran keluar"|>Pembayaran keluar</);
  assert.doesNotMatch(accountPageSource, /title="Daftar rekening"/);
  assert.match(mobileExperience, /<MobileAccountActivity/);
  assert.match(mobileExperience, /state: \{ accountId: item\.account_id, period \}/);
  assert.match(accountPageSource, /state: \{ accountId:/);
  assert.match(page, /onTransferSaved=\{reloadAccounts\}/);
  assert.match(mobileExperience, /onTransferSaved=\{onTransferSaved\}/);
  assert.match(accountPageSource, /variant="mobileDetail"/);
  assert.match(accountPageSource, /embedded/);
  assert.doesNotMatch(accountPageSource, /ref=\{mobileDetailRef\}/);
  assert.doesNotMatch(accountPageSource, /setInterval\(/);
  assert.match(mobileExperience, /mobileCarouselDots/);
  assert.doesNotMatch(accountPageSource, /aria-label="Baca penjelasan rekonsiliasi"/);
  assert.doesNotMatch(accountPageSource, /title="Tentang rekonsiliasi"/);
  assert.match(reconciliationPage, /PageHeader title="Cocokkan Saldo"/);
  assert.match(reconciliationPage, /account\.can_reconcile === true/);
  assert.match(reconciliationPage, /account\.account_type !== "investment"/);
  assert.match(reconciliationPage, /reconciliations\.list/);
  assert.match(reconciliationPage, /createReconciliation/);
  assert.doesNotMatch(accountsApi, /reconciliations\.create/, "Rekonsiliasi hanya boleh dimiliki feature reconciliations.");
  assert.match(reconciliationPage, /styles\.guardLine/);
  assert.match(reconciliationPage, /Saldo tidak diubah otomatis/);
  assert.doesNotMatch(pageStyles, /reconciliationInfoButton|reconciliationToggle|reconciliationPanel/);
  assert.match(pageStyles, /mobileStackPanel/);
  assert.match(pageStyles, /mobileAccountActivity/);
  assert.doesNotMatch(pageStyles, /mobileTransferHeaderAction/);
  assert.match(pageStyles, /mobileTransferQuickAction/);
  assert.match(pageStyles, /mobileRecentActivity/);
  assert.doesNotMatch(pageStyles, /mobileChartToggle|mobileExpenseChart|mobileChartPanel/);
  assert.match(financialSuccessStyles, /brandCheckBadge/);
  assert.match(pageStyles, /mobileTransactionList/);
  assert.match(pageStyles, /\.mobileBalanceSummary \{[^}]*border:\s*1px solid[^}]*border-radius:\s*1\.2rem;[^}]*background:/s);
  assert.doesNotMatch(pageStyles, /paymentHistoryList|paymentHistoryItem/);
  assert.match(pageStyles, /perspective: 68\.75rem/);
  assert.match(pageStyles, /transform-style: preserve-3d/);
  assert.match(pageStyles, /\.mobileStackStage[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.match(pageStyles, /\.mobileStackCard[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.doesNotMatch(pageStyles, /touch-action: none/);
  assert.match(mobileExperienceStyles, /\.mobileStackCard[^{]*\{[^}]*width:\s*min\(79vw, 21\.85rem\);/s);
  assert.match(pageStyles, /mobileCarouselDot/);
  assert.doesNotMatch(pageStyles, /scroll-snap-type/);
  const mobileBreakpointCount = (styles) => (styles.match(/@media \(max-width: 820px\)/g) || []).length;
  assert.equal(mobileBreakpointCount(accountsPageStyles), 1, "AccountsPage harus memiliki satu breakpoint mobile canonical 820px.");
  assert.equal(mobileBreakpointCount(accountEditorStyles), 0, "AccountEditorDialogs tidak membutuhkan breakpoint mobile 820px.");
  assert.equal(mobileBreakpointCount(mobileActivityStyles), 1, "MobileAccountActivity harus memiliki satu breakpoint mobile canonical 820px.");
  assert.equal(mobileBreakpointCount(mobileExperienceStyles), 1, "MobileAccountsExperience harus memiliki satu breakpoint mobile canonical 820px.");
  assert.equal(mobileBreakpointCount(mobileTransferStyles), 1, "MobileAccountTransferAction harus memiliki satu breakpoint mobile canonical 820px.");
  assert.doesNotMatch(pageStyles, /47\.99rem|51\.25rem/, "CSS rekening tidak boleh kembali ke breakpoint mobile legacy sekitar 768/820px.");
  assert.match(mobileExperienceStyles, /mobileStackPanel/);
  assert.match(mobileActivityStyles, /mobileAccountActivity/);
  assert.match(mobileActivityStyles, /mobileRecentActivity/);
  assert.doesNotMatch(mobileActivityStyles, /mobileExpenseChart|mobileChartPanel|mobileChartToggle/);
  assert.doesNotMatch(mobileTransferStyles, /mobileTransferHeaderAction/);
  assert.match(mobileTransferStyles, /mobileTransferQuickAction/);
  assert.match(mobileExperience, /className=\{`\$\{styles\.mobileStackHeaderButton\} \$\{styles\.mobileStackHeaderButtonPrimary\}`\}[\s\S]*aria-label="Tambah rekening"[\s\S]*<span>Tambah<\/span>/);
  assert.match(mobileTransferStyles, /\.mobileTransferQuickAction \{[^}]*min-height:\s*3\.7rem;[^}]*flex-direction:\s*column;/s);
  assert.match(accountsPageStyles, /impactSummary/);
  assert.match(pageStyles, /\.mobileRecentHeading h2 \{[^}]*font-size:\s*1\.04rem;/s);
  assert.match(pageStyles, /\.impactSummary \{[^}]*border:\s*1px solid var\(--border\);[^}]*background:\s*var\(--surface-soft\);/s);
  assert.match(pageStyles, /\.impactSummary strong \{ color:\s*var\(--text\);/);
  assert.match(pageStyles, /mobileAccountExperience[\s\S]*background:/);
  assert.match(pageStyles, /mobileBalanceSummary[\s\S]*mobileAccountSummarySheen/);
  assert.doesNotMatch(pageStyles, /mobileStackBalance|mobileStackOwnership/);
  assert.doesNotMatch(pageStyles, /var\(--(?:border-subtle|surface-muted|text-primary)\)/);

  for (const asset of ["bca", "bni", "btn", "mandiri", "permata", "shopeepay", "dana", "gopay", "ovo", "linkaja"]) assert.match(brandAssets, new RegExp(`${asset}\\.webp`));
  for (const asset of ["cash", "investment", "savings"]) assert.match(card, new RegExp(`${asset}\\.webp`));
  for (const retiredAsset of ["emergency_fund", "sinking_fund", "other"]) assert.doesNotMatch(card, new RegExp(`${retiredAsset}\.webp`));
  assert.match(card, /detectEwalletTemplate/);
  assert.match(card, /data-visual-kind/);
  assert.match(card, /ewalletOwnership/);
  assert.match(card, /model\.isBank && model\.image/);
  assert.match(card, /accountOwnershipLabel/);
  assert.match(card, /accountProviderLabel/);
  assert.doesNotMatch(card, /const BANK_LABELS/);
  assert.match(cardStyles, /\.genericCard \{[^}]*background:\s*var\(--primary-deep\);/s);
  assert.match(cardStyles, /\.visual\[data-bank-template="generic"\]::after,/);
  assert.match(cardStyles, /\.visual\[data-has-image="false"\]::after\s*\{\s*background:\s*none;/s);
  assert.match(cardStyles, /\.visual\[data-visual-kind="ewallet"\]::after/);
  assert.match(cardStyles, /\.ewalletOwnership/);
  const genericCardBlock = cardStyles.match(/\.genericCard \{[^}]*\}/s)?.[0] || "";
  assert.doesNotMatch(genericCardBlock, /gradient\(/);
  assert.doesNotMatch(card, /account\.can_reconcile/);
  assert.match(card, /onViewTransactions/);
  assert.match(card, /account\.can_manage/);
  assert.match(card, /account\.read_only/);
  assert.match(card, /navigator\.clipboard\.writeText\(account\.account_number\)/);
  assert.match(card, /data-ewallet-template/);
  assert.match(card, /templateOverride \|\| detectEwalletTemplate\(account\)/);
  assert.match(cardStyles, /aspect-ratio: 1024 \/ 645/);
  assert.match(cardStyles, /object-fit: contain/);
  assert.match(cardStyles, /width: min\(100%, 26\.5rem\)/);
  assert.match(cardStyles, /font-family: var\(--font-mono\)/);
  assert.match(card, /stack = false/);
  assert.match(card, /embedded = false/);
  assert.match(card, /embedded \? \(/);
  assert.match(card, /readOnly \? <div className=\{styles\.mobileDetailBadges\}><span className=\{styles\.readOnlyBadge\}><FiEye aria-hidden="true" \/>Hanya lihat<\/span><\/div> : null/);
  assert.match(card, /aria-label=\{`Detail rekening \$\{account\.name\}`\}/);
  assert.match(cardStyles, /stackVisual/);
  assert.match(cardStyles, /\.stackVisual \{[^}]*background:\s*transparent;/s);
  assert.match(cardStyles, /\.stackVisual::after \{[^}]*background:\s*none;/s);
  assert.match(cardStyles, /\.visual\[data-has-image="true"\] \{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s);
  assert.match(cardStyles, /\.visual\[data-visual-kind="bank"\]::after \{[^}]*background:\s*none;/s);
  assert.doesNotMatch(cardStyles, /\.visual\[data-visual-kind="bank"\] \.cardImage \{/);
  assert.doesNotMatch(cardStyles, /106%|inset:\s*-3%/);
  assert.match(card, /data-account-type=\{account\.account_type\}/);
  assert.match(cardStyles, /data-account-type="investment"/);
  assert.match(card, /investmentCard/);
  assert.match(card, /hasInvestmentArtwork/);
  assert.match(cardStyles, /\.visual\[data-account-type="investment"\]\[data-has-image="true"\]::after \{[^}]*background:\s*none;/s);
  assert.doesNotMatch(cardStyles, /--account-card-surface/);
  assert.doesNotMatch(mobileExperience, /boxShadow = `0 1\.75rem 3\.9rem/);
  assert.match(cardStyles, /\.mobileSecondaryActions \.mobileDangerAction \{[^}]*color:\s*var\(--negative\);/s);
  assert.doesNotMatch(cardStyles, /var\(--danger\)/);
  assert.match(categoryPage, /PageHeader title="Kategori"/);
  assert.match(categoryPage, /categories\.list/);
  assert.doesNotMatch(categoryPage, /accounts\.list/);
});

test("label rekening memprioritaskan provider dan tetap membedakan pemilik personal", () => {
  assert.equal(accountProviderLabel({ account_type: "bank", bank_template: "bca", name: "Tabungan bulanan" }), "BCA");
  assert.equal(accountProviderLabel({ account_type: "bank", bank_template: "generic", name: "Rekening BNI" }), "BNI");
  assert.equal(accountProviderLabel({ account_type: "ewallet", ewallet_template: "dana", name: "Belanja harian" }), "DANA");
  assert.equal(accountProviderLabel({ account_type: "ewallet", ewallet_template: "generic", name: "DANA belanja" }), "E-wallet");
  assert.equal(accountProviderLabel({ account_type: "ewallet", name: "DANA belanja" }), "DANA");
  assert.equal(accountProviderLabel({ account_type: "ewallet", name: "Dompet digital" }), "E-wallet");
  assert.equal(accountDisplayLabel({ account_type: "bank", bank_template: "bca", name: "Tabungan bulanan", owner_scope: "shared" }), "BCA · Tabungan bulanan");
  assert.equal(accountDisplayLabel({ account_type: "ewallet", ewallet_template: "dana", name: "Belanja harian", owner_scope: "shared" }), "DANA · Belanja harian");
  assert.equal(accountDisplayLabel({ account_type: "cash", name: "Dompet", owner_scope: "personal", owner_name: "Vio" }), "Tunai · Dompet · Vio");
});

test("label kepemilikan kartu tetap ringkas dan nama pemilik tersedia terpisah", () => {
  assert.equal(accountOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(accountOwnershipLabel({ owner_scope: "personal", owner_name: "Vio Yusup" }), "Vio Yusup");
  assert.equal(accountOwnershipLabel({ owner_scope: "personal" }), "Pribadi");
  assert.equal(accountCardOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(accountCardOwnershipLabel({ owner_scope: "personal", owner_name: "Fuji Astuti Dwiyanti" }), "Fuji");
  assert.equal(accountCardOwnershipLabel({ owner_scope: "personal" }), "Pribadi");
});

test("rekening Investasi memakai nama internal otomatis dan kartu cukup membedakan Pribadi Pasangan atau Bersama", () => {
  assert.equal(investmentAccountOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(investmentAccountOwnershipLabel({ owner_scope: "personal", is_owned_by_actor: true }), "Pribadi");
  assert.equal(investmentAccountOwnershipLabel({ owner_scope: "personal", is_owned_by_actor: false }), "Pasangan");
  assert.equal(accountDisplayLabel({ account_type: "investment", name: "Investasi", owner_scope: "personal", is_owned_by_actor: true }), "Investasi · Pribadi");
  assert.equal(accountDisplayLabel({ account_type: "investment", name: "Investasi", owner_scope: "personal", is_owned_by_actor: false }), "Investasi · Pasangan");
  assert.equal(accountDisplayLabel({ account_type: "investment", name: "Investasi", owner_scope: "shared" }), "Investasi · Bersama");
});

test("semua asset kartu rekening aktif memakai kanvas dan rasio yang sama", async () => {
  const assets = [
    ...["bca", "bni", "btn", "mandiri", "permata"].map((name) => ["bank-cards", name]),
    ...["shopeepay", "dana", "gopay", "ovo", "linkaja"].map((name) => ["ewallet-cards", name]),
    ...["cash", "investment", "savings"].map((name) => ["account-cards", name]),
  ];
  for (const [directory, name] of assets) {
    const url = new URL(`../src/assets/${directory}/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const [info, dimensions] = await Promise.all([stat(file), webpSize(file)]);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 100_000, `${name}.webp terlalu besar untuk kartu responsif (${info.size} byte)`);
    assert.deepEqual(dimensions, { width: 1024, height: 645 }, `${name}.webp harus memakai kanvas 1024x645`);
    if (["bank-cards", "ewallet-cards"].includes(directory) || name === "investment") assert.equal(await webpHasAlpha(file), true, `${name}.webp harus mempertahankan alpha di luar siluet kartu`);
  }
});


test("logo compact rekening bank dan e-wallet memakai asset persegi transparan terpisah dari artwork kartu", async () => {
  const assets = [
    ...["bca", "bni", "btn", "mandiri", "permata"].map((name) => ["bank-logos", name]),
    ...["shopeepay", "dana", "gopay", "ovo", "linkaja"].map((name) => ["ewallet-logos", name]),
  ];
  for (const [directory, name] of assets) {
    const url = new URL(`../src/assets/${directory}/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const [info, dimensions] = await Promise.all([stat(file), webpSize(file)]);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 30_000, `${name}.webp terlalu besar untuk logo compact (${info.size} byte)`);
    assert.deepEqual(dimensions, { width: 256, height: 256 }, `${name}.webp harus persegi 256x256`);
    assert.equal(await webpHasAlpha(file), true, `${name}.webp harus mempertahankan background transparan`);
  }

  const assetsSource = await read("src/shared/presentation/accountBrandAssets.js");
  assert.match(assetsSource, /BANK_BRAND_LOGOS/);
  assert.match(assetsSource, /EWALLET_BRAND_LOGOS/);
  assert.match(assetsSource, /accountBrandLogo/);
  assert.match(assetsSource, /bank-cards\/bca\.webp/);
  assert.match(assetsSource, /bank-logos\/bca\.webp/);
});

test("dashboard rekening desktop mempertahankan AccountVisual, sementara mobile memakai shortcut ringkas", async () => {
  const [dashboard, mobileDashboard, dashboardStyles] = await Promise.all([
    read("src/features/dashboard/components/DesktopFinanceDashboard.jsx"),
    read("src/features/dashboard/components/MobileFinanceDashboard.jsx"),
    read("src/features/dashboard/DashboardPage.module.css"),
  ]);
  assert.match(dashboardStyles, /\.shared-account-carousel \{[^}]*display:\s*grid;[^}]*grid-auto-flow:\s*column;[^}]*grid-auto-columns:\s*calc\(\(100% - 24px\) \/ 3\);[^}]*overflow-x:\s*auto;/s);
  assert.match(dashboardStyles, /\.shared-account-card \{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(dashboardStyles, /\.shared-account-card\.is-selected\s*>\s*div:first-child \{[^}]*box-shadow:/s);
  assert.doesNotMatch(dashboardStyles, /\.shared-account-card\.is-selected \{[^}]*background:/s);
  assert.match(dashboardStyles, /@media \(max-width: 940px\) and \(min-width: 821px\)[\s\S]*\.shared-account-carousel \{ grid-auto-columns:\s*calc\(\(100% - 12px\) \/ 2\); \}/);
  assert.doesNotMatch(dashboardStyles, /\.shared-account-card \{[^}]*flex:\s*0 0/s);
  assert.match(dashboard, /<AccountVisual account=\{cleanAccount\} carousel \/>/);
  assert.match(dashboard, /scrollIntoViewWithMotionPreference/);
  assert.match(dashboard, /inline:\s*"nearest"/);
  assert.match(mobileDashboard, /\{ to: "\/rekening", label: "Rekening", icon: AccountIcon, tone: "account" \}/);
  assert.doesNotMatch(mobileDashboard, /AccountVisual|mobile-account-preview|mobile-account-scroller/);
  assert.doesNotMatch(dashboardStyles, /\.mobile-account-preview|\.mobile-account-scroller/);
});

test("pencocokan saldo mobile memakai feedback lokal tanpa toast ganda dan celebration tetap aksesibel", async () => {
  const [page, pageStyles, feedback, result, resultStyles, successOverlay, successStyles, alertList, alertStyles] = await Promise.all([
    Promise.all([
      read("src/features/reconciliations/ReconciliationsPage.jsx"),
      read("src/features/reconciliations/components/ReconciliationForm.jsx"),
      read("src/features/reconciliations/components/ReconciliationHistory.jsx"),
    ]).then((parts) => parts.join("\n")),
    read("src/features/reconciliations/ReconciliationsPage.module.css"),
    read("src/components/feedback/FeedbackProvider.jsx"),
    read("src/features/reconciliations/components/ReconciliationFeedback.jsx"),
    read("src/features/reconciliations/components/ReconciliationFeedback.module.css"),
    read("src/components/feedback/FinancialSuccessOverlay.jsx"),
    read("src/components/feedback/FinancialSuccessOverlay.module.css"),
    read("src/features/dashboard/components/FinancialAlertList.jsx"),
    read("src/features/dashboard/components/FinancialAlertList.module.css"),
  ]);

  assert.match(page, /ReconciliationSubmitProgress/);
  assert.match(page, /ReconciliationResultOverlay/);
  assert.match(page, /status: "syncing"/);
  assert.match(page, /status: "completed"/);
  assert.match(page, /finishReconciliation = \(\) => navigate\(attentionFromNotification \? "\/notifikasi" : "\/"\)/);
  assert.match(page, /reviewReconciliationTransactions/);
  assert.match(page, /onReviewTransactions/);
  assert.match(page, /refreshOutcomes = await Promise\.allSettled/);
  assert.match(page, /actual_balance: "", notes: ""/);
  assert.match(page, /setForm\(\{ account_id: attentionAccountId, actual_balance: "", notes: "" \}\)/);
  assert.match(page, /onConfirmSystemBalance/);
  assert.match(page, /Ya, saldonya sama/);
  assert.match(page, /Tidak, berbeda/);
  assert.match(page, /Saldo tercatat di aplikasi/);
  assert.match(page, /Saldo aktual di bank/);
  assert.match(page, /Pastikan catatan aplikasi sama dengan saldo yang benar-benar Anda lihat\./);
  assert.match(page, /Dipilih otomatis/);
  assert.match(page, /styles\.differencePreview/);
  assert.match(page, /styles\.mobileHistoryDifference/);
  assert.match(pageStyles, /\.systemBalanceCard\s*\{/);
  assert.match(pageStyles, /\.systemBalanceCard[\s\S]*font-size:\s*clamp\(1\.9rem/);
  assert.match(page, /<SelectionField[\s\S]*label="Rekening"/);
  assert.match(page, /searchable=\{accounts\.length > 8\}/);
  assert.match(pageStyles, /\.differencePreview\[data-state="matched"\]/);
  assert.match(pageStyles, /\.mobileHistoryDifference/);
  assert.doesNotMatch(page, /<details className=\{styles\.helpDetails\}/);
  assert.doesNotMatch(page, /notify\(/, "Pencocokan saldo tidak boleh menampilkan toast kedua setelah result overlay.");
  const localProcessActions = feedback.match(/const LOCAL_PROCESS_ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
  assert.match(localProcessActions, /"reconciliations\.create"/);
  assert.match(localProcessActions, /"transactions\.create"/);
  assert.match(feedback, /LOCAL_PROCESS_ACTIONS\.has\(visible\.action\)/);
  assert.match(result, /FinancialSuccessOverlay/);
  assert.match(result, /ReconciliationDifferenceOverlay/);
  assert.match(result, /Lihat transaksi rekening/);
  assert.match(result, /onReviewTransactions/);
  assert.match(result, /refreshIncomplete/);
  assert.match(successOverlay, /MONEY_COUNT = 10/);
  assert.match(successOverlay, /MoneyRainCelebration/);
  assert.match(successOverlay, /saldo-bersama-mark\.png/);
  assert.match(successOverlay, /brandCheckPath/);
  assert.match(successOverlay, /role="dialog"/);
  assert.match(successOverlay, /useFocusTrap/);
  assert.doesNotMatch(successOverlay, /FiX|aria-label="Tutup/);
  assert.match(successStyles, /@media \(max-width: 820px\)[\s\S]*height: 100dvh/);
  assert.match(successStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(successStyles, /success-money-fall/);
  assert.match(successStyles, /animation: success-money-fall var\(--motion-celebration\)[^;]*1 both/);
  assert.doesNotMatch(successStyles, /success-money-fall[^;]*infinite/);
  assert.doesNotMatch(successStyles, /\.content h2 \{[^}]*opacity:\s*0|\.amount[^}]*opacity:\s*0/s);
  assert.match(resultStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(pageStyles, /guidePanel|guideLead|snapshotBadge|eyebrowPill|actualBalanceCard|editBalanceButton|previewDifferenceBox/, "Style rekonsiliasi lama yang tidak terpakai harus dibersihkan.");
  assert.match(pageStyles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(alertList, /className=\{styles\.mobileGuidance\}/);
  assert.doesNotMatch(alertList, /mobile-attention-instruction/);
  assert.match(alertStyles, /\.mobileGuidance\s*\{/);
});
