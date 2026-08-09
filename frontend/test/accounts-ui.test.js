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
  formatAccountNumber,
  normalizeAccountNumber,
} from "../src/shared/presentation/account.js";

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

test("halaman rekening desktop memakai Concept A tanpa mengubah pengalaman mobile", async () => {
  const [page, accountSheets, accountEditors, desktopWorkspace, desktopStyles, card, pageStyles, cardStyles, categoryPage, reconciliationPage] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/MobileAccountSheets.jsx"),
    read("src/features/accounts/components/AccountEditorDialogs.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.jsx"),
    read("src/features/accounts/components/DesktopAccountsWorkspace.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
    read("src/features/categories/CategoriesPage.jsx"),
    read("src/features/reconciliations/ReconciliationsPage.jsx"),
  ]);
  const accountPageSource = `${page}
${accountSheets}
${accountEditors}`;
  const accountsApi = await read("src/features/accounts/accounts.api.js");

  assert.match(accountPageSource, /title="Rekening"/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/MobileAccountSheets\.jsx"\)\)/);
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
  assert.match(accountPageSource, /bank_template/);
  assert.match(accountPageSource, /initialFocusRef=\{createNameInputRef\}/);
  assert.match(accountPageSource, /Nama bank dipilih terpisah melalui template kartu/);
  assert.doesNotMatch(accountPageSource, /applyBankTemplateToName/);
  assert.match(accountPageSource, /<span>No rekening \*<\/span>/);
  assert.match(accountPageSource, /useApiResource\("users\.list"/);
  assert.match(accountPageSource, /owner_user_id/);
  assert.match(accountPageSource, /<span>Pemilik rekening \*<\/span>/);
  assert.match(accountPageSource, /Daftar anggota belum dapat dimuat/);
  assert.match(accountPageSource, /Promise\.allSettled\(\[accountsResource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(accountPageSource, /accountsResult\.status === "rejected"/);
  assert.match(accountPageSource, /selectedAccountId/);
  assert.match(page, /DesktopAccountsWorkspace/);
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
  assert.match(desktopWorkspace, /<AccountVisual account=\{account\} carousel \/>/);
  assert.match(desktopWorkspace, /Rekening utama/);
  assert.match(desktopWorkspace, /Rekening lain/);
  assert.match(desktopWorkspace, /Belum ada rekening lain untuk dipilih/);
  assert.match(desktopWorkspace, /Transaksi terbaru bulan ini/);
  assert.match(desktopWorkspace, /Total saldo/);
  assert.match(desktopWorkspace, /Tren saldo/);
  assert.match(desktopWorkspace, /Distribusi rekening/);
  assert.match(desktopWorkspace, /magnitudo saldo/);
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
  assert.match(accountPageSource, /paymentHistoryPeriod/);
  assert.match(accountPageSource, /useApiResource\("transactions\.list"/);
  assert.match(accountPageSource, /enabled: mobileAccountSheet === "history"/);
  assert.match(accountPageSource, /account_id: selectedAccountId \|\| "all"/);
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
  assert.match(accountPageSource, /setMobileAccountSheet\("detail"\)/);
  assert.match(accountPageSource, /title="Pembayaran keluar"/);
  assert.match(accountPageSource, /Pengeluaran dan transfer keluar yang menggunakan/);
  assert.doesNotMatch(accountPageSource, />Bayar tagihan</);
  assert.match(accountPageSource, />Pembayaran keluar</);
  assert.match(accountPageSource, /title="Daftar rekening"/);
  assert.match(accountPageSource, /state: \{ accountId:/);
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
  assert.match(reconciliationPage, /Sistem tidak membuat transaksi penyesuaian secara otomatis/);
  assert.doesNotMatch(pageStyles, /reconciliationInfoButton|reconciliationToggle|reconciliationPanel/);
  assert.match(pageStyles, /mobileStackPanel/);
  assert.match(pageStyles, /mobileQuickActions/);
  assert.match(pageStyles, /\.mobileStackSummary \{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;/s);
  assert.match(pageStyles, /\.mobileQuickActions \{[^}]*border-top:\s*0;/s);
  assert.match(pageStyles, /paymentHistoryList/);
  assert.match(pageStyles, /paymentHistoryItem/);
  assert.match(pageStyles, /perspective: 93\.75rem/);
  assert.match(pageStyles, /transform-style: preserve-3d/);
  assert.match(pageStyles, /\.mobileStackStage[^{]*\{[^}]*touch-action: pan-y pinch-zoom;/s);
  assert.match(pageStyles, /\.mobileStackCard\[aria-pressed="true"\][^{]*\{[^}]*touch-action: pan-x pinch-zoom;/s);
  assert.doesNotMatch(pageStyles, /touch-action: none/);
  assert.match(pageStyles, /width: min\(78vw, 19\.1rem\)/);
  assert.doesNotMatch(pageStyles, /mobilePagination|scroll-snap-type/);
  assert.equal((pageStyles.match(/@media \(max-width: 820px\)/g) || []).length, 1);
  assert.match(pageStyles, /\.paymentHistoryToolbar input \{[^}]*font-size:\s*var\(--font-size-body\);/s);
  assert.match(pageStyles, /\.impactSummary \{[^}]*border:\s*1px solid var\(--border\);[^}]*background:\s*var\(--surface-soft\);/s);
  assert.match(pageStyles, /\.impactSummary strong \{ color:\s*var\(--text\);/);
  assert.doesNotMatch(pageStyles, /var\(--(?:border-subtle|surface-muted|text-primary)\)/);

  for (const asset of ["bca", "bni", "btn", "mandiri", "permata"]) assert.match(card, new RegExp(`${asset}\.webp`));
  assert.match(card, /accountOwnershipLabel/);
  assert.match(card, /accountProviderLabel/);
  assert.doesNotMatch(card, /const BANK_LABELS/);
  assert.match(cardStyles, /\.genericCard \{[^}]*background:\s*var\(--primary-deep\);/s);
  assert.match(cardStyles, /\.visual\[data-bank-template="generic"\]::after \{ background:\s*none; \}/);
  const genericCardBlock = cardStyles.match(/\.genericCard \{[^}]*\}/s)?.[0] || "";
  assert.doesNotMatch(genericCardBlock, /gradient\(/);
  assert.doesNotMatch(card, /account\.can_reconcile/);
  assert.match(card, /onViewTransactions/);
  assert.match(card, /account\.can_manage/);
  assert.match(card, /account\.read_only/);
  assert.match(card, /navigator\.clipboard\.writeText\(account\.account_number\)/);
  assert.match(cardStyles, /aspect-ratio: 1\.586 \/ 1/);
  assert.match(cardStyles, /object-fit: cover/);
  assert.match(cardStyles, /width: min\(100%, 26\.5rem\)/);
  assert.match(cardStyles, /font-family: var\(--font-mono\)/);
  assert.match(card, /stack = false/);
  assert.match(card, /embedded = false/);
  assert.match(card, /embedded \? <h2/);
  assert.match(card, /aria-label=\{`Detail rekening \$\{account\.name\}`\}/);
  assert.match(cardStyles, /stackVisual/);
  assert.match(cardStyles, /\.mobileSecondaryActions \.mobileDangerAction \{[^}]*color:\s*var\(--negative\);/s);
  assert.doesNotMatch(cardStyles, /var\(--danger\)/);
  assert.match(categoryPage, /title="Kategori transaksi"/);
  assert.match(categoryPage, /categories\.list/);
  assert.doesNotMatch(categoryPage, /accounts\.list/);
});

test("label rekening memprioritaskan provider dan tetap membedakan pemilik personal", () => {
  assert.equal(accountProviderLabel({ account_type: "bank", bank_template: "bca", name: "Tabungan bulanan" }), "BCA");
  assert.equal(accountProviderLabel({ account_type: "bank", bank_template: "generic", name: "Rekening BNI" }), "BNI");
  assert.equal(accountDisplayLabel({ account_type: "bank", bank_template: "bca", name: "Tabungan bulanan", owner_scope: "shared" }), "BCA · Tabungan bulanan");
  assert.equal(accountDisplayLabel({ account_type: "cash", name: "Dompet", owner_scope: "personal", owner_name: "Vio" }), "Tunai · Dompet · Vio");
});

test("label kepemilikan rekening personal selalu menyebut pemilik", () => {
  assert.equal(accountOwnershipLabel({ owner_scope: "shared" }), "Bersama");
  assert.equal(accountOwnershipLabel({ owner_scope: "personal", owner_name: "Vio Yusup" }), "Pribadi · Vio Yusup");
  assert.equal(accountOwnershipLabel({ owner_scope: "personal" }), "Pribadi");
});

test("semua asset kartu bank memakai kanvas dan rasio yang sama", async () => {
  for (const name of ["bca", "bni", "btn", "mandiri", "permata"]) {
    const url = new URL(`../src/assets/bank-cards/${name}.webp`, import.meta.url);
    const file = await access(url).then(() => url);
    const [info, dimensions] = await Promise.all([stat(file), webpSize(file)]);
    assert.ok(file, `${name}.webp harus tersedia`);
    assert.ok(info.size <= 160_000, `${name}.webp terlalu besar untuk kartu responsif (${info.size} byte)`);
    assert.deepEqual(dimensions, { width: 768, height: 484 }, `${name}.webp harus memakai kanvas 768x484`);
  }
});
