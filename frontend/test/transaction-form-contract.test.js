import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => Promise.all([
  "../src/features/transactions/TransactionForm.jsx",
  "../src/features/transactions/transactionFormController.js",
  "../src/features/transactions/transactionFormPresentation.js",
  "../src/features/transactions/components/TransactionFields.jsx",
  "../src/features/transactions/MobileTransactionFields.jsx",
  "../src/features/transactions/MobileTransactionSelectionView.jsx",
  "../src/features/transactions/components/TransactionImpactPreview.jsx",
  "../src/features/transactions/components/TransactionPostSaveModal.jsx",
].map((relative) => readFile(new URL(relative, import.meta.url), "utf8"))).then((parts) => parts.join("\n"));

test("form transaksi tidak menduplikasi pilihan jenis dan menandai kategori wajib sesuai validator", async () => {
  const text = await source();
  const expenseOptions = text.match(/\{ value: TRANSACTION_TYPES\.EXPENSE, label: "Pengeluaran"/g) || [];
  assert.equal(expenseOptions.length, 1);
  assert.equal((text.match(/name="transaction_type"/g) || []).length, 2, "Desktop dan mobile boleh memiliki presentation selector terpisah, tetapi keduanya harus memakai opsi canonical yang sama.");
  assert.match(text, /TRANSACTION_TYPE_OPTIONS/);
  assert.match(text, /legend="Jenis transaksi"/);
  assert.match(text, /!\[TRANSACTION_TYPES\.TRANSFER, TRANSACTION_TYPES\.ADJUSTMENT\]\.includes\(form\.transaction_type\)/);
  assert.match(text, /form\.transaction_type === "refund" && item\.transaction_type === "expense"/);
});

test("metode pembayaran tetap opsional dan tampil langsung tanpa panel detail tambahan", async () => {
  const text = await source();
  assert.match(text, /payment_method: ""/);
  assert.match(text, /\{ value: "", label: "Belum dipilih" \}/);
  assert.match(text, /SelectionControl id="payment-method"[\s\S]*form\.payment_method/);
  assert.doesNotMatch(text, /Detail tambahan|optional-fields__toggle/);
  assert.match(text, /100_000/);
  assert.match(text, /quickAmountLabel/);
  assert.doesNotMatch(text, /payment_method: "transfer"/);
  assert.doesNotMatch(text, /\{ value: "autodebit", label: "Auto-debit" \}/, "Auto-debit tidak boleh menjadi pilihan transaksi manual baru.");
  assert.match(text, /form\.payment_method === "autodebit"[\s\S]*Auto-debit \(data lama\)[\s\S]*disabled: true/, "Nilai Auto-debit lama tetap harus dapat dibaca tanpa menjadi opsi baru.");
  assert.match(text, /accountDisplayLabel/);
  assert.ok((text.match(/accountDisplayLabel\(item\)/g) || []).length >= 2, "Rekening sumber/tujuan harus memakai label kepemilikan canonical pada presentation yang menampilkan daftar.");
  assert.doesNotMatch(text, /includeOwner: false/);
  assert.match(text, /item\.source_account_id === sourceAccount\.account_id && item\.can_record_expense === true/);
  assert.doesNotMatch(text, /filterByAssigneeAccess|canUseAssignedItem/);
  assert.match(text, /transferRouteFor\(data\.transferRoutes, sourceAccount\.account_id, account\.account_id\)/);
  assert.match(text, /envelope\.source_account_id !== nextId/);
  assert.match(text, /sourceAccountPicker/);
  assert.doesNotMatch(text, /Tampilkan semua|Lihat semua|hiddenAccountLabel/);
  assert.match(text, /Belum ada rekening sumber dengan dana yang dapat digunakan/);
  assert.match(text, /envelopeOptionLabel/);
  assert.match(text, /mobileColumns=\{4\}/, "jenis transaksi mobile harus tetap satu baris empat opsi pada lebar normal");
  assert.match(text, /styles\.typeSelector/);
});

test("form tambah transaksi mobile memakai Catatan sebagai satu-satunya detail teks dan menjaga guard overspend", async () => {
  const text = await source();
  assert.doesNotMatch(text, /Merchant \/ penerima/);
  assert.doesNotMatch(text, /id="merchant"/);
  assert.doesNotMatch(text, /Alasan jika melebihi dana alokasi/);
  assert.doesNotMatch(text, /id="overspend-reason"/);
  assert.match(text, /htmlFor="description"><span>Catatan<\/span>/);
  assert.match(text, /overspend_reason: overspendNoteRequired \? String\(form\.description \|\| form\.overspend_reason/);
  assert.match(text, /OVERSPEND_REASON_REQUIRED/);
  assert.match(text, /errors\.description/);
  assert.match(text, /merchant: ""/);
});

test("modal transaksi mobile tidak autofocus nominal dan memakai asset wallet project", async () => {
  const text = await source();
  assert.match(text, /src="\/login\/assets\/mobile\/wallet\.webp"/);
  assert.match(text, /draggable="false"/);
  assert.match(text, /initialFocusRef: mobileLayout \? undefined : amountRef/);
  assert.doesNotMatch(text, /transaction-wallet\.svg/);
  assert.match(text, /FinancialSuccessOverlay/);
  assert.doesNotMatch(text, /postSaveSuccess/);
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
  assert.match(text, /"transactions\.list", "accounts\.list", "envelopes\.list", "budgets\.list", "reports\.monthly", "dashboard\.overview", "investments\.overview", "app\.initialState"/);
});


test("quick add memakai composer global dan invalidation transaksi mencakup resource finansial turunan", async () => {
  const [form, page, hook, composer] = await Promise.all([
    Promise.all([
      readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8"),
      readFile(new URL("../src/features/transactions/transactionFormController.js", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile(new URL("../src/features/transactions/TransactionsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/hooks/useApiResource.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/TransactionComposerContext.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /invalidate\(\["transactions\.list", "accounts\.list", "envelopes\.list", "budgets\.list", "reports\.monthly"/);
  assert.match(page, /useTransactionComposer/);
  assert.match(page, /onClick=\{openTransactionComposer\}>Tambah transaksi/);
  assert.doesNotMatch(page, /formOpen|setFormOpen/, "halaman Transaksi tidak boleh memiliki composer create kedua");
  assert.match(page, /<TransactionForm open=\{Boolean\(editingTransaction\)\} transaction=\{editingTransaction\}/, "form lokal hanya untuk edit transaksi");
  assert.match(page, /"budgets\.list"/, "cancel/restore transaksi juga harus menginvalidasi pemakaian anggaran");
  assert.match(hook, /subscribeToInvalidation\(action/);
  assert.match(composer, /lazy\(\(\) => import\("\.\.\/features\/transactions\/TransactionForm\.jsx"\)\)/, "composer global tidak boleh memaksa form transaksi masuk main bundle");
  assert.match(composer, /composer\.open \? <Suspense fallback=\{null\}>/);
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
  const [form, mobileFields, mobileSelection, action, modal] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/MobileTransferFields.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionSelectionView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/accounts/components/MobileAccountTransferAction.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/Modal.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(action, /presentation="mobile-transfer"/);
  assert.match(form, /presentation = "default"/);
  assert.match(form, /useMediaQuery\(APP_MEDIA\.mobile\)/);
  assert.match(form, /APP_MEDIA/);
  assert.match(form, /!transaction && isTransfer && \(presentation === "mobile-transfer" \|\| mobileLayout\)/);
  assert.match(form, /mobileSwipeToClose: true/);
  assert.match(form, /const preparedInput = transactionPreparedInput/);
  assert.match(form, /validateTransactionInput\(preparedInput\)/);
  assert.match(form, /createIdempotencyKey\(\)/);
  assert.match(form, /const saveTransaction = transaction \? updateTransaction : createTransaction/);
  assert.match(form, /destination\.account_id === nextId/);
  assert.match(form, /canRepresentAccountTransfer\(nextAccount, destination\)/);
  assert.match(form, /clearTransactionFieldErrors/);
  assert.match(form, /compatibleDestinationAccounts\[0\]\.account_id/);
  assert.match(form, /<MobileTransferFields \{\.\.\.fields\} \/>/);
  assert.doesNotMatch(mobileFields, /createTransaction|updateTransaction|createIdempotencyKey|transactions\.api|apiClient/);
  assert.match(mobileFields, /type="submit"/);
  assert.match(mobileFields, /openMobileSelection\("source-account"\)/);
  assert.match(mobileFields, /openMobileSelection\("destination-account"\)/);
  assert.doesNotMatch(mobileFields, /<select|type="radio"/, "transfer mobile tidak boleh kembali ke native dropdown/horizontal radio account picker");
  assert.match(mobileSelection, /sourceAccountPicker/);
  assert.match(mobileSelection, /compatibleDestinationAccounts/);
  assert.match(mobileFields, /Saldo dan dana tersedia baru berubah setelah server mengonfirmasi transfer/);
  assert.match(mobileFields, /Transfer memakai dana yang belum dialokasikan/);
  assert.match(mobileFields, /Setelah transfer/);
  assert.match(mobileFields, /Total aset tetap\. Transfer memakai dana yang belum dialokasikan/);
  assert.match(modal, /closeIcon: CloseIcon = FiX/);
  assert.match(modal, /closeLabel = "Tutup dialog"/);
});


test("composer mobile memakai grouped metadata dan same-sheet selection tanpa nested dropdown", async () => {
  const [form, mobile, selection, presentation] = await Promise.all([
    readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionFields.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionSelectionView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/transactionFormPresentation.js", import.meta.url), "utf8"),
  ]);

  assert.match(form, /MobileTransactionFields/);
  assert.match(form, /MobileTransactionSelectionView/);
  assert.match(form, /mobileSelection/);
  assert.match(form, /requestModalClose = mobileSelection \? closeMobileSelection : onClose/);
  assert.match(form, /closeIcon: FiChevronLeft/);
  assert.match(mobile, /styles\.detailGroup/);
  assert.match(mobile, /openMobileSelection\(p\.isIncome \? "destination-account" : "source-account"\)/);
  assert.match(mobile, /openMobileSelection\("category"\)/);
  assert.match(mobile, /openMobileSelection\("envelope"\)/);
  assert.doesNotMatch(mobile, /<select/, "composer mobile default tidak memakai native select");
  assert.match(selection, /id="mobile-category-search"/);
  assert.match(selection, /frequentCategories/);
  assert.match(selection, /sourceAccountPicker/);
  assert.doesNotMatch(selection, /showAll|Cari rekening|query:/);
  assert.match(presentation, /\{ value: "", label: "Belum dipilih" \}/);
  assert.match(presentation, /Auto-debit \(data lama\)/);
  assert.match(mobile, /Math\.min\(event\.currentTarget\.scrollHeight, 130\)/);
});


test("Pakai lagi memakai composer canonical sebagai prefill aman dan tetap menunggu Simpan", async () => {
  const [form, page, composer] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/TransactionsPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/TransactionComposerContext.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Pakai lagi/);
  assert.match(page, /canRepeatTransaction\(target\)/, "detail mobile tetap menampilkan footer Pakai lagi walau transaksi lama tidak editable");
  assert.match(page, /initialDraft: repeatDraftFromTransaction\(item\)/);
  assert.match(composer, /initialDraft/);
  assert.match(form, /initialTransactionForm/);
  assert.match(form, /todayInJakarta\(\)/);
  assert.doesNotMatch(page, /initialDraft:[\s\S]{0,300}(transaction_id|row_version|idempotency_key)/);
  assert.match(form, /type="submit"/);
});

test("income sukses menawarkan Alokasi Dana hanya setelah mutation sukses tanpa auto-submit alokasi", async () => {
  const text = await source();
  assert.match(text, /form\.transaction_type === TRANSACTION_TYPES\.INCOME \? "income" : "created"/);
  assert.match(text, /TRANSACTION_TYPES\.REFUND/);
  assert.match(text, /workflowSource: "transaction-income"/);
  assert.match(text, /workflowAction: "fund"/);
  assert.match(text, /label: "Bagi ke Alokasi Dana"/);
  assert.match(text, /Anda dapat membagi sebagian atau seluruh dana tersedia ke Alokasi Dana tanpa membuat transaksi baru/);
  assert.doesNotMatch(text, /envelopes\.adjustAllocation|adjustAllocation\(/, "TransactionForm tidak boleh membuat allocation mutation sendiri");
});

test("form transaksi memakai smart rekening, smart Alokasi, warning dini, dan Tambah lagi tanpa auto-submit", async () => {
  const [form, smart] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/transactionFormSmartDefaults.js", import.meta.url), "utf8"),
  ]);
  assert.match(form, /sourceAccountPicker/);
  assert.doesNotMatch(form, /placeholder="Cari rekening"|Cari rekening|Lihat semua/, "Rekening sumber tidak lagi memakai search/show-all yang memenuhi form.");
  assert.match(form, /picker\.map/);
  assert.match(form, /Belum ada rekening sumber dengan dana yang dapat digunakan/);
  assert.match(form, /frequentCategories/);
  assert.match(form, /Sering dipakai/);
  assert.match(form, /smartAllocationCandidates/);
  assert.match(form, /useSmartAllocationSelection/);
  assert.match(form, /allocationMode !== "auto"/);
  assert.match(smart, /Dipilih dari Kebutuhan/);
  assert.match(form, /earlyFundsWarning/);
  assert.match(form, /Setelah transaksi/);
  assert.doesNotMatch(form, /Lihat dampak lengkap/);
  assert.match(form, /label: "Tambah lagi"/);
  assert.match(form, /idempotencyKeyRef\.current = createTransactionIntentKey\(\)/);
  assert.match(smart, /sourceAccountHasFunds/);
  assert.match(smart, /budget\.category_id !== form\.category_id/);
  assert.match(smart, /envelope\.source_account_id !== form\.source_account_id/);
});

test("detail Alokasi Dana membuka composer canonical dengan rekening, Alokasi, dan Kebutuhan sebagai prefill", async () => {
  const detail = await readFile(new URL("../src/features/allocations/AllocationPlanningDetail.jsx", import.meta.url), "utf8");
  assert.match(detail, /useTransactionComposer/);
  assert.match(detail, /Catat pengeluaran/);
  assert.match(detail, /canRecordExpense/);
  assert.match(detail, /today >= item\.period_start/);
  assert.match(detail, /category_id: budget\?\.category_id \|\| ""/);
  assert.match(detail, /envelope_period_id: item\.envelope_period_id/);
  assert.doesNotMatch(detail, /createTransaction|updateTransaction|transactions\.api/, "detail Alokasi hanya boleh membuka composer, bukan menyimpan transaksi sendiri");
});

test("validasi transaksi memfokuskan field wajib dan expense tanpa Alokasi meminta konfirmasi eksplisit", async () => {
  const [form, fields] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/components/TransactionFields.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /focusFirstTransactionError/);
  assert.match(form, /scrollIntoViewWithMotionPreference\(target, \{ block: "center" \}\)/);
  assert.doesNotMatch(form, /behavior:\s*"smooth"/);
  assert.match(form, /form\.transaction_type === TRANSACTION_TYPES\.EXPENSE && !form\.envelope_period_id && !unallocatedConfirmed/);
  assert.match(form, /code: "UNALLOCATED_EXPENSE"/);
  assert.match(form, /Pengeluaran Belum Dialokasikan/);
  assert.match(fields, /Lengkapi data transaksi yang wajib dipilih/);
  assert.match(fields, /aria-live="assertive"/);
  assert.match(fields, /transaction-date-error/);
  assert.match(fields, /source-account-error/);
  assert.match(fields, /destination-account-error/);
  assert.match(fields, /category-error/);
});
