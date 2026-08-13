import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import * as featherIcons from "react-icons/fi";
import {
  accountCardholderName,
  accountCardNumberGroups,
  accountDisplayLabel,
  accountProviderLabel,
  accountNumberGroups,
  accountOwnershipLabel,
  detectBankTemplate,
  detectEwalletTemplate,
  formatAccountNumber,
  normalizeAccountNumber,
} from "../src/shared/presentation/account.js";
import { accountTransactionDirection } from "../src/shared/presentation/transaction.js";

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
});

test("arah transaksi rekening konsisten untuk desktop dan mobile", () => {
  assert.deepEqual(accountTransactionDirection({ transaction_type: "expense", status: "active" }, "acc-1"), { prefix: "−", tone: "negative" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "income", status: "active" }, "acc-1"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "refund", status: "active" }, "acc-1"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "transfer", status: "active", source_account_id: "acc-1", destination_account_id: "acc-2" }, "acc-1"), { prefix: "−", tone: "negative" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "transfer", status: "active", source_account_id: "acc-1", destination_account_id: "acc-2" }, "acc-2"), { prefix: "+", tone: "positive" });
  assert.deepEqual(accountTransactionDirection({ transaction_type: "expense", status: "cancelled" }, "acc-1"), { prefix: "", tone: "neutral" });
});

test("halaman rekening menjaga workspace desktop dan menyediakan riwayat serta grafik pada mobile", async () => {
  const [page, accountSheets, mobileExperience, mobileActivity, mobileTransfer, accountEditors, desktopWorkspace, desktopStyles, card, pageStyles, cardStyles, categoryPage, reconciliationPage, transactionPresentation] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/MobileAccountSheets.jsx"),
    read("src/features/accounts/components/MobileAccountsExperience.jsx"),
    read("src/features/accounts/components/MobileAccountActivity.jsx"),
    read("src/features/accounts/components/MobileAccountTransferAction.jsx"),
    read("src/features/accounts/components/AccountEditorDialogs.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
    read("src/shared/presentation/transaction.js"),
  ]);
  const accountPageSource = `${page}
${accountSheets}
${mobileExperience}
${mobileActivity}
${mobileTransfer}
${accountEditors}`;
  const accountsApi = await read("src/features/accounts/accounts.api.js");

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
  assert.match(accountSheets, /title="Daftar rekening"/);
  assert.match(accountPageSource, /aria-label="Tambah rekening"/);
  assert.match(accountPageSource, /title="Tambah rekening"/);
  assert.match(accountPageSource, /create-account-form/);
  assert.doesNotMatch(accountPageSource, /create-category-form|categories\.list|Kategori transaksi/);
  assert.match(accountPageSource, /account_number/);
  assert.match(cardStyles, /\.accountNumber \{[^}]*justify-content:\s*flex-start;[^}]*gap:\s*clamp\(/s);
  assert.match(accountPageSource, /bank_template/);
  assert.match(accountPageSource, /ewallet_template/);
  assert.match(accountPageSource, /Provider E-wallet/);
  assert.match(accountPageSource, /initialFocusRef=\{createNameInputRef\}/);
  assert.match(accountPageSource, /const BankTemplateField =/);
  assert.match(accountPageSource, /Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening/);
  assert.match(accountPageSource, /accountForm\.account_type === "bank" \? <BankTemplateField/);
  assert.doesNotMatch(accountPageSource, /applyBankTemplateToName/);
  assert.match(accountPageSource, /<span>No rekening \*<\/span>/);
  assert.match(accountPageSource, /useApiResource\("users\.list"/);
  assert.match(accountPageSource, /owner_user_id/);
  assert.match(accountPageSource, /<span>Kepemilikan \*<\/span>/);
  assert.match(accountPageSource, /userOptionLabel/);
  assert.match(accountPageSource, /Administrator/);
  assert.doesNotMatch(accountPageSource, /<span>Pemilik rekening \*<\/span>/);
  assert.match(accountPageSource, /Promise\.allSettled\(\[accountsResource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(accountPageSource, /accountsResult\.status === "rejected"/);
  assert.match(accountPageSource, /selectedAccountId/);
  assert.match(page, /DesktopAccountsWorkspace/);
  assert.match(page, /MOBILE_ACCOUNTS_QUERY = "\(max-width: 820px\)"/);
  assert.match(page, /mobileLayout[\s\S]*\? <Suspense fallback=\{null\}><MobileAccountsExperience[\s\S]*: <Suspense fallback=\{null\}><DesktopAccountsWorkspace/);
  assert.match(page, /mobileLayout \? <AccountSheets/);
  assert.match(page, /selectedAccount=\{selectedAccount\}/);
  assert.match(page, /onSelectAccount=\{setSelectedAccountId\}/);
  assert.doesNotMatch(page, /mobileDetailOpen|detailColumnOpen|useFocusTrap/);
  assert.match(desktopWorkspace, /useApiResource\("transactions\.list"/);
  assert.match(desktopWorkspace, /useApiResource\("reports\.monthly"/);
  assert.match(desktopWorkspace, /DESKTOP_QUERY = "\(min-width: 821px\)"/);
  const featherImportBlock = desktopWorkspace.match(/import\s*\{([\s\S]*?)\}\s*from "react-icons\/fi";/)?.[1] || "";
  const featherIconNames = [...featherImportBlock.matchAll(/\b(Fi[A-Za-z0-9]+)\b/g)].map((match) => match[1]);
  assert.ok(featherIconNames.length > 0, "Concept A harus mendeklarasikan icon Feather yang dipakai.");
  for (const iconName of featherIconNames) {
    assert.equal(typeof featherIcons[iconName], "function", `${iconName} harus merupakan export react-icons/fi yang valid.`);
  }
  assert.match(desktopWorkspace, /enabled: desktopEnabled && Boolean\(selectedId\)/);
  assert.match(desktopWorkspace, /if \(!desktopEnabled \|\| !selectedAccount\) return null;/);
  assert.match(desktopWorkspace, /<AccountVisual account=\{account\} carousel \/>/);
  assert.match(transactionPresentation, /export const accountTransactionDirection/);
  assert.match(desktopWorkspace, /accountTransactionDirection\(item, selectedAccountId\)/);
  assert.match(mobileActivity, /accountTransactionDirection\(item, selectedAccountId\)/);
  assert.doesNotMatch(desktopWorkspace, /const transactionDirection/);
  assert.doesNotMatch(mobileActivity, /const transactionDirection/);
  assert.match(desktopWorkspace, /Rekening utama/);
  assert.match(desktopWorkspace, /Rekening lain/);
  assert.match(desktopWorkspace, /Belum ada rekening lain untuk dipilih/);
  assert.match(desktopWorkspace, /const RecentTransactionsPanel =/);
  assert.match(desktopWorkspace, /Total saldo/);
  assert.match(desktopWorkspace, /Tren saldo/);
  assert.match(desktopWorkspace, /const AccountInsights =/);
  assert.match(desktopWorkspace, /distributionProgress/);
  assert.match(desktopWorkspace, /onEditAccount\(account\)/);
  assert.match(desktopWorkspace, /onArchiveAccount\(account\)/);
  assert.match(desktopWorkspace, /onViewTransactions\(account\)/);
  assert.match(desktopStyles, /grid-template-columns: minmax\(0, 1\.55fr\) minmax\(20rem, \.72fr\)/);
  assert.match(desktopStyles, /position: sticky/);
  assert.match(desktopStyles, /@media \(max-width: 820px\) \{[^}]*\.desktopWorkspace \{ display: none; \}/s);
  assert.match(desktopStyles, /accountSelectorGrid/);
  assert.match(desktopStyles, /transactionList/);
  assert.match(desktopStyles, /distributionList/);
  assert.match(desktopWorkspace, /<progress className=\{styles\.distributionProgress\}/);
  assert.doesNotMatch(desktopStyles, /overflow-x:\s*auto|scroll-snap-type/);
  const referencedDesktopClasses = new Set([...desktopWorkspace.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  const declaredDesktopClasses = new Set([...desktopStyles.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
  for (const className of referencedDesktopClasses) {
    assert.equal(declaredDesktopClasses.has(className), true, `DesktopAccountsWorkspace memakai styles.${className} tetapi CSS Module tidak mendeklarasikannya.`);
  }
  assert.match(accountPageSource, /mobileAccountSheet/);
  assert.match(mobileActivity, /role="tab"/);
  assert.match(mobileActivity, /tabIndex=\{activeTab === "history" \? 0 : -1\}/);
  assert.match(mobileActivity, /event\.key === "Home"/);
  assert.match(mobileActivity, /event\.key === "End"/);
  assert.match(mobileActivity, /requestAnimationFrame/);
  assert.match(mobileActivity, /<span>Riwayat<\/span>/);
  assert.match(mobileActivity, /<span>Grafik<\/span>/);
  assert.match(mobileActivity, /MobileAccountTransferAction/);
  assert.match(mobileTransfer, /Transfer/);
  assert.match(mobileTransfer, /lazy\(\(\) => import\("\.\.\/\.\.\/transactions\/TransactionForm\.jsx"\)\)/);
  assert.match(mobileTransfer, /TransactionForm/);
  assert.match(mobileTransfer, /initialType=\{TRANSACTION_TYPES\.TRANSFER\}/);
  assert.match(mobileTransfer, /initialSourceAccountId=\{selectedAccount\?\.account_id \|\| ""\}/);
  assert.match(mobileTransfer, /lockType/);
  assert.match(mobileTransfer, /notifyOnSuccess=\{false\}/);
  assert.match(mobileTransfer, /pendingSavedRef/);
  assert.match(mobileTransfer, /onTransferSaved/);
  assert.match(mobileTransfer, /Transfer memerlukan rekening sumber aktif/);
  assert.match(mobileTransfer, /mobileTransferSuccess/);
  assert.doesNotMatch(mobileTransfer, /createTransaction|transactions\.create/);
  assert.match(mobileActivity, /TREND_OPTIONS = Object\.freeze\(\[3, 6, 12\]\)/);
  assert.match(mobileActivity, /useApiResource\("transactions\.list"/);
  assert.match(mobileActivity, /account_id: selectedAccountId \|\| "all"/);
  assert.match(mobileActivity, /enabled: mobileEnabled && activeTab === "history"/);
  assert.match(mobileActivity, /Transfer antar rekening tidak dihitung sebagai pengeluaran/);
  assert.match(accountsApi, /loadAccountExpenseTrend/);
  assert.match(accountsApi, /apiClient\.request\("reports\.monthly"/);
  assert.match(accountsApi, /period: endPeriod/);
  assert.match(accountsApi, /trend_months: months/);
  assert.match(accountsApi, /account_id: accountId/);
  assert.match(accountsApi, /report\?\.accountExpenseTrend\?\.items/);
  assert.doesNotMatch(accountsApi, /transaction_type: "expense"|limit: 200|hasMore/);
  assert.doesNotMatch(accountPageSource, /paymentHistoryPeriod|paymentHistoryResource|sheet === "history"/);
  assert.match(accountPageSource, /mobileStackCardRefs/);
  assert.match(accountPageSource, /MOBILE_STACK_SLOT_STYLES/);
  assert.match(accountPageSource, /shortestCircularDifference/);
  assert.match(accountPageSource, /onPointerDown=\{handleMobileStackPointerDown\}/);
  assert.match(accountPageSource, /onPointerMove=\{handleMobileStackPointerMove\}/);
  assert.match(accountPageSource, /const progress = clamp\(-deltaY \/ 154/);
  assert.doesNotMatch(accountPageSource, /const progress = clamp\(-deltaX \/ 154/);
  assert.match(accountPageSource, /velocityY/);
  assert.doesNotMatch(accountPageSource, /velocityX|handleMobileStackWheel|onWheel=\{/);
  assert.match(accountPageSource, /event\.key === "ArrowUp"/);
  assert.match(accountPageSource, /event\.key === "ArrowDown"/);
  assert.match(accountPageSource, /prefers-reduced-motion: reduce/);
  assert.match(accountPageSource, /aria-label="Geser ke atas atau bawah untuk mengganti rekening"/);
  assert.match(accountPageSource, /Geser kartu aktif ke atas atau bawah/);
  assert.match(accountPageSource, /<AccountVisual account=\{account\} stack \/>/);
  assert.match(mobileExperience, /accountOwnershipLabel\(account\)/);
  assert.doesNotMatch(page, /account\.owner_scope === "shared" \? "Bersama" : "Pribadi"/);
  assert.match(accountPageSource, /setMobileAccountSheet\("detail"\)/);
  assert.doesNotMatch(accountPageSource, /title="Pembayaran keluar"|>Pembayaran keluar</);
  assert.match(accountPageSource, /title="Daftar rekening"/);
  assert.match(mobileExperience, /<MobileAccountActivity/);
  assert.match(mobileExperience, /state: \{ accountId: item\.account_id, period \}/);
  assert.match(accountPageSource, /state: \{ accountId:/);
  assert.match(page, /onTransferSaved=\{reloadAccounts\}/);
  assert.match(mobileExperience, /onTransferSaved=\{onTransferSaved\}/);
  assert.match(accountPageSource, /variant="mobileDetail"/);
  assert.match(accountPageSource, /embedded/);
  assert.doesNotMatch(accountPageSource, /ref=\{mobileDetailRef\}/);
  assert.doesNotMatch(accountPageSource, /mobilePagination|mobileCarousel|setInterval\(/);
  assert.doesNotMatch(accountPageSource, /aria-label="Baca penjelasan rekonsiliasi"/);
  assert.doesNotMatch(accountPageSource, /title="Tentang rekonsiliasi"/);
  assert.match(reconciliationPage, /title="Rekonsiliasi"/);
  assert.match(reconciliationPage, /account\.can_reconcile === true/);
  assert.match(reconciliationPage, /reconciliations\.list/);
  assert.match(reconciliationPage, /createReconciliation/);
  assert.doesNotMatch(accountsApi, /reconciliations\.create/, "Rekonsiliasi hanya boleh dimiliki feature reconciliations.");
  assert.match(reconciliationPage, /styles\.guardNotice/);
  assert.match(reconciliationPage, /Tidak mengubah saldo secara otomatis/);
  assert.doesNotMatch(pageStyles, /reconciliationInfoButton|reconciliationToggle|reconciliationPanel/);
  assert.match(pageStyles, /mobileStackPanel/);
  assert.match(pageStyles, /mobileAccountActivity/);
  assert.match(pageStyles, /mobileTransferQuickAction/);
  assert.match(pageStyles, /mobileActivityTabs/);
  assert.match(pageStyles, /mobileActivityTabIcon/);
  assert.match(pageStyles, /mobileTransferSuccessCheck/);
  assert.match(pageStyles, /mobileTransactionList/);
  assert.match(pageStyles, /mobileExpenseChart/);
  assert.match(pageStyles, /\.mobileStackSummary \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;/s);
  assert.doesNotMatch(pageStyles, /paymentHistoryList|paymentHistoryItem/);
  assert.match(pageStyles, /perspective: 93\.75rem/);
  assert.match(pageStyles, /transform-style: preserve-3d/);
  assert.match(pageStyles, /\.mobileStackStage[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.match(pageStyles, /\.mobileStackCard\[aria-pressed="true"\][^{]*\{[^}]*touch-action: pan-x pinch-zoom;/s);
  assert.doesNotMatch(pageStyles, /touch-action: none/);
  assert.match(pageStyles, /width: min\(78vw, 19\.1rem\)/);
  assert.doesNotMatch(pageStyles, /mobilePagination|scroll-snap-type/);
  assert.equal((pageStyles.match(/@media \(max-width: 820px\)/g) || []).length, 1);
  assert.match(pageStyles, /\.mobileHistoryPeriodControl input \{[^}]*padding:\s*0;[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(pageStyles, /\.impactSummary \{[^}]*border:\s*1px solid var\(--border\);[^}]*background:\s*var\(--surface-soft\);/s);
  assert.match(pageStyles, /\.impactSummary strong \{ color:\s*var\(--text\);/);
  assert.match(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileAccountExperience/);
  assert.match(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileStackPanel/);
  assert.match(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileHistoryPeriodControl input[\s\S]*color-scheme:\s*light/);
  assert.doesNotMatch(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileStackCard/);
  assert.doesNotMatch(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileStackBalance/);
  assert.doesNotMatch(pageStyles, /:global\(:root\[data-theme="light"\]\) \.mobileStackOwnership/);
  assert.doesNotMatch(pageStyles, /var\(--(?:border-subtle|surface-muted|text-primary)\)/);

  for (const asset of ["bca", "bni", "btn", "mandiri", "permata", "shopeepay", "dana", "gopay", "ovo", "linkaja", "cash", "savings", "emergency_fund", "sinking_fund", "investment", "other"]) assert.match(card, new RegExp(`${asset}\.webp`));
  assert.match(card, /detectEwalletTemplate/);
  assert.match(card, /data-visual-kind/);
  assert.match(card, /ewalletOwnership/);
  assert.match(card, /model\.isBank && model\.image/);
  assert.match(card, /accountOwnershipLabel/);
  assert.match(card, /accountProviderLabel/);
  assert.doesNotMatch(card, /const BANK_LABELS/);
  assert.match(cardStyles, /\.genericCard \{[^}]*background:\s*var\(--primary-deep\);/s);
  assert.match(cardStyles, /\.visual\[data-bank-template="generic"\]::after,/);
  assert.match(cardStyles, /\.visual\[data-has-image="false"\]::after \{ background:\s*none; \}/);
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
  assert.match(cardStyles, /aspect-ratio: 1\.586 \/ 1/);
  assert.match(cardStyles, /object-fit: cover/);
  assert.match(cardStyles, /width: min\(100%, 26\.5rem\)/);
  assert.match(cardStyles, /font-family: var\(--font-mono\)/);
  assert.match(card, /stack = false/);
  assert.match(card, /embedded = false/);
  assert.match(card, /embedded \? \(/);
  assert.match(card, /readOnly \? <div className=\{styles\.mobileDetailBadges\}><span className=\{styles\.readOnlyBadge\}><FiEye aria-hidden="true" \/>Hanya lihat<\/span><\/div> : null/);
  assert.match(card, /aria-label=\{`Detail rekening \$\{account\.name\}`\}/);
  assert.match(cardStyles, /stackVisual/);
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
});

test("semua asset kartu rekening memakai kanvas dan rasio yang sama", async () => {
  const assets = [
    ...["bca", "bni", "btn", "mandiri", "permata"].map((name) => ["bank-cards", name]),
    ...["shopeepay", "dana", "gopay", "ovo", "linkaja"].map((name) => ["ewallet-cards", name]),
    ...["cash", "savings", "emergency_fund", "sinking_fund", "investment", "other"].map((name) => ["account-cards", name]),
  ];
  for (const [directory, name] of assets) {
    const url = new URL(`../src/assets/${directory}/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const [info, dimensions] = await Promise.all([stat(file), webpSize(file)]);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 160_000, `${name}.webp terlalu besar untuk kartu responsif (${info.size} byte)`);
    assert.deepEqual(dimensions, { width: 1536, height: 968 }, `${name}.webp harus memakai kanvas 1536x968`);
  }
});
