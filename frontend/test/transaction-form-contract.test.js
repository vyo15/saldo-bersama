import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8");

test("form transaksi tidak menduplikasi pilihan jenis dan menandai kategori wajib sesuai validator", async () => {
  const text = await source();
  const expenseOptions = text.match(/\{ value: TRANSACTION_TYPES\.EXPENSE, label: "Pengeluaran"/g) || [];
  assert.equal(expenseOptions.length, 1);
  assert.equal((text.match(/name="transaction_type"/g) || []).length, 1, "Jenis transaksi harus memiliki satu selector canonical.");
  assert.match(text, /legend="Jenis transaksi"/);
  assert.match(text, /!\[TRANSACTION_TYPES\.TRANSFER, TRANSACTION_TYPES\.ADJUSTMENT\]\.includes\(form\.transaction_type\)/);
  assert.match(text, /form\.transaction_type === "refund" && item\.transaction_type === "expense"/);
});

test("metode pembayaran tidak diasumsikan ketika detail tambahan belum dipilih", async () => {
  const text = await source();
  assert.match(text, /payment_method: ""/);
  assert.match(text, /\{ value: "", label: "Belum dipilih", icon: OtherIcon \}/);
  assert.match(text, /legend="Metode pembayaran"[\s\S]*name="payment_method"/);
  assert.doesNotMatch(text, /payment_method: "transfer"/);
  assert.match(text, /accountDisplayLabel/);
  assert.equal((text.match(/accountDisplayLabel\(item\)/g) || []).length, 2, "Rekening sumber dan tujuan harus memakai label kepemilikan yang konsisten.");
  assert.doesNotMatch(text, /includeOwner: false/);
  assert.match(text, /data\.envelopes\.filter\(\(item\) => item\.source_account_id === sourceAccount\.account_id\)/);
  assert.match(text, /filterByAssigneeAccess\(accountEnvelopes, bootstrap\?\.user \|\| user\)/);
  assert.match(text, /envelope\.source_account_id !== nextId/);
  assert.match(text, /tersedia \$\{formatRupiah\(item\.available_balance \?\? item\.balance \?\? 0\)\}/);
  assert.match(text, /envelopeOptionLabel/);
});


test("quick transfer dapat mengunci jenis, mengisi rekening sumber, dan menyegarkan saldo rekening", async () => {
  const text = await source();
  assert.match(text, /initialSourceAccountId = ""/);
  assert.match(text, /source_account_id: initialSourceAccountId/);
  assert.match(text, /lockType = false/);
  assert.match(text, /p\.lockType \? null : <TypeSelector/);
  assert.match(text, /submitLabel/);
  assert.match(text, /submittingLabel/);
  assert.match(text, /notifyOnSuccess = true/);
  assert.match(text, /"transactions\.list", "accounts\.list", "envelopes\.list", "budgets\.list", "reports\.monthly", "dashboard\.overview", "app\.initialState"/);
});


test("quick add memakai composer global dan invalidation transaksi mencakup resource finansial turunan", async () => {
  const [form, page, hook] = await Promise.all([
    readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/TransactionsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useApiResource.js", import.meta.url), "utf8"),
  ]);
  assert.match(form, /invalidate\(\["transactions\.list", "accounts\.list", "envelopes\.list", "budgets\.list", "reports\.monthly"/);
  assert.match(page, /useTransactionComposer/);
  assert.match(page, /onClick=\{openTransactionComposer\}>Tambah transaksi/);
  assert.doesNotMatch(page, /formOpen|setFormOpen/, "halaman Transaksi tidak boleh memiliki composer create kedua");
  assert.match(page, /<TransactionForm open=\{Boolean\(editingTransaction\)\} transaction=\{editingTransaction\}/, "form lokal hanya untuk edit transaksi");
  assert.match(page, /"budgets\.list"/, "cancel/restore transaksi juga harus menginvalidasi pemakaian anggaran");
  assert.match(hook, /subscribeToInvalidation\(action/);
});


test("pemasukan tetap memakai rekening tujuan tanpa helper gajian permanen", async () => {
  const text = await source();
  assert.match(text, /form\.transaction_type === TRANSACTION_TYPES\.INCOME/);
  assert.match(text, /ImpactPreview/);
  assert.match(text, /impact\.destination/);
  assert.doesNotMatch(text, /Contoh gajian:/);
  assert.doesNotMatch(text, /rekening bank yang menerima gaji sebagai rekening tujuan/);
});

test("presentasi transfer mobile tetap memakai mutation, idempotency, dan validator canonical", async () => {
  const [form, mobileFields, action, modal] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/MobileTransferFields.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/accounts/components/MobileAccountTransferAction.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/Modal.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(action, /presentation="mobile-transfer"/);
  assert.match(form, /presentation = "default"/);
  assert.match(form, /validateTransactionInput\(transactionPreparedInput/);
  assert.match(form, /createIdempotencyKey\(\)/);
  assert.match(form, /const saveTransaction = transaction \? updateTransaction : createTransaction/);
  assert.match(form, /destination\.account_id === nextId/);
  assert.match(form, /compatibleDestinationAccounts\[0\]\.account_id/);
  assert.match(form, /<MobileTransferFields \{\.\.\.fields\} \/>/);
  assert.doesNotMatch(mobileFields, /createTransaction|updateTransaction|createIdempotencyKey|transactions\.api|apiClient/);
  assert.match(mobileFields, /type="submit"/);
  assert.match(mobileFields, /Saldo dan dana tersedia baru berubah setelah server mengonfirmasi transfer/);
  assert.match(mobileFields, /Transfer memakai dana yang belum dialokasikan/);
  assert.match(form, /Dana tersedia \{impact\.source\.name\}/);
  assert.match(modal, /closeIcon: CloseIcon = FiX/);
  assert.match(modal, /closeLabel = "Tutup dialog"/);
});

