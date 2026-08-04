import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  accountCardholderName,
  accountCardNumberGroups,
  accountNumberGroups,
  accountOwnershipLabel,
  detectBankTemplate,
  formatAccountNumber,
  normalizeAccountNumber,
} from "../src/features/accounts/accountPresentation.js";

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

test("halaman rekening fokus pada rekening, detail besar, capability, dan form nomor rekening", async () => {
  const [page, card, pageStyles, cardStyles, categoryPage] = await Promise.all([
    read("src/features/accounts/AccountsPage.jsx"),
    read("src/features/accounts/components/AccountFinancialCard.jsx"),
    read("src/features/accounts/AccountsPage.module.css"),
    read("src/features/accounts/components/AccountFinancialCard.module.css"),
    read("src/features/categories/CategoriesPage.jsx"),
  ]);

  assert.match(page, /title="Rekening"/);
  assert.match(page, /aria-label="Tambah rekening"/);
  assert.match(page, /title="Tambah rekening"/);
  assert.match(page, /create-account-form/);
  assert.doesNotMatch(page, /create-category-form|categories\.list|Kategori transaksi/);
  assert.match(page, /account_number/);
  assert.match(page, /bank_template/);
  assert.match(page, /initialFocusRef=\{createNameInputRef\}/);
  assert.match(page, /Nama bank dipilih terpisah melalui template kartu/);
  assert.doesNotMatch(page, /applyBankTemplateToName/);
  assert.match(page, /<span>No rekening \*<\/span>/);
  assert.match(page, /useApiResource\("users\.list"/);
  assert.match(page, /owner_user_id/);
  assert.match(page, /<span>Pemilik rekening \*<\/span>/);
  assert.match(page, /Daftar anggota belum dapat dimuat/);
  assert.match(page, /Promise\.allSettled\(\[accountsResource\.reload\(\), refreshAll\(\)\]\)/);
  assert.doesNotMatch(page, /accountsResult\.status === "rejected"/);
  assert.match(page, /selectedAccountId/);
  assert.match(page, /mobileDetailOpen/);
  assert.match(page, /mobileAccountSheet/);
  assert.match(page, /paymentHistoryPeriod/);
  assert.match(page, /useApiResource\("transactions\.list"/);
  assert.match(page, /enabled: mobileAccountSheet === "history"/);
  assert.match(page, /account_id: selectedAccountId \|\| "all"/);
  assert.match(page, /mobileStackCardRefs/);
  assert.match(page, /MOBILE_STACK_SLOT_STYLES/);
  assert.match(page, /shortestCircularDifference/);
  assert.match(page, /onPointerDown=\{handleMobileStackPointerDown\}/);
  assert.match(page, /onPointerMove=\{handleMobileStackPointerMove\}/);
  assert.match(page, /onWheel=\{handleMobileStackWheel\}/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /aria-label="Geser ke atas atau bawah untuk mengganti rekening"/);
  assert.match(page, /<AccountVisual account=\{account\} stack \/>/);
  assert.match(page, /setMobileAccountSheet\("detail"\)/);
  assert.match(page, /title="Riwayat pembayaran"/);
  assert.match(page, /Pembayaran keluar yang menggunakan/);
  assert.match(page, />Bayar tagihan</);
  assert.match(page, />Riwayat</);
  assert.match(page, /variant="mobileDetail"/);
  assert.match(page, /embedded/);
  assert.doesNotMatch(page, /ref=\{mobileDetailRef\}/);
  assert.doesNotMatch(page, /mobilePagination|mobileCarousel|setInterval\(/);
  assert.match(page, /buttonRef=/);
  assert.match(page, /useFocusTrap/);
  assert.match(page, /closeButtonRef=\{detailCloseRef\}/);
  assert.match(page, /bodyClassName: "modal-open"/);
  assert.match(page, /aria-modal=\{mobileDetailOpen \|\| undefined\}/);
  assert.match(page, /variant="detail"/);
  assert.match(page, /aria-label="Baca penjelasan rekonsiliasi"/);
  assert.match(page, /title="Tentang rekonsiliasi"/);
  assert.match(page, /Buka riwayat untuk melihat hasil pencocokan terakhir/);
  assert.match(page, /Aksi rekonsiliasi, edit, dan arsip hanya tersedia/);
  assert.doesNotMatch(page, /Rekonsiliasi disarankan setiap bulan\.<\/strong>/);
  assert.doesNotMatch(page, /Riwayat dimuat hanya saat dibuka agar halaman rekening tetap ringan/);
  assert.match(pageStyles, /reconciliationInfoButton/);
  assert.match(pageStyles, /reconciliationToggle/);
  assert.match(pageStyles, /grid-template-columns: minmax\(32rem, 1fr\) minmax\(28rem, 32rem\)/);
  assert.match(pageStyles, /position: sticky/);
  assert.match(pageStyles, /detailColumnOpen/);
  assert.match(pageStyles, /mobileStackPanel/);
  assert.match(pageStyles, /mobileQuickActions/);
  assert.match(pageStyles, /paymentHistoryList/);
  assert.match(pageStyles, /paymentHistoryItem/);
  assert.match(pageStyles, /perspective: 93\.75rem/);
  assert.match(pageStyles, /transform-style: preserve-3d/);
  assert.match(pageStyles, /touch-action: none/);
  assert.match(pageStyles, /width: min\(78vw, 19\.1rem\)/);
  assert.doesNotMatch(pageStyles, /mobilePagination|scroll-snap-type/);

  for (const asset of ["bca", "bni", "btn", "mandiri", "permata"]) assert.match(card, new RegExp(`${asset}\.webp`));
  assert.match(card, /accountOwnershipLabel/);
  assert.match(card, /account\.can_reconcile/);
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
  assert.match(categoryPage, /title="Kategori transaksi"/);
  assert.match(categoryPage, /categories\.list/);
  assert.doesNotMatch(categoryPage, /accounts\.list/);
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
