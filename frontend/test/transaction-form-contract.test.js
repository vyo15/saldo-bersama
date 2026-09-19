import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => Promise.all([
  "../src/features/transactions/TransactionForm.jsx",
  "../src/features/transactions/transactionFormController.js",
  "../src/features/transactions/transactionImpact.js",
  "../src/features/transactions/transactionFormPresentation.js",
  "../src/features/transactions/components/TransactionFields.jsx",
  "../src/features/transactions/MobileTransactionFields.jsx",
  "../src/features/transactions/MobileTransactionCategoryField.jsx",
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

test("metode pembayaran tetap opsional dan mobile menaruhnya di disclosure catatan", async () => {
  const text = await source();
  assert.match(text, /payment_method: ""/);
  assert.match(text, /\{ value: "", label: "Belum dipilih" \}/);
  assert.match(text, /SelectionControl id="payment-method"[\s\S]*form\.payment_method/);
  assert.match(text, /Catatan & metode pembayaran/);
  assert.match(text, /aria-controls="transaction-additional-details"/);
  assert.match(text, /Berapa yang dikeluarkan\?/);
  assert.match(text, /Masuk ke rekening/);
  assert.match(text, /Dari rekening/);
  assert.match(text, /100_000/);
  assert.match(text, /quickAmountLabel/);
  assert.doesNotMatch(text, /payment_method: "transfer"/);
  assert.doesNotMatch(text, /\{ value: "autodebit", label: "Auto-debit" \}/, "Auto-debit tidak boleh menjadi pilihan transaksi manual baru.");
  assert.match(text, /form\.payment_method === "autodebit"[\s\S]*Auto-debit \(data lama\)[\s\S]*disabled: true/, "Nilai Auto-debit lama tetap harus dapat dibaca tanpa menjadi opsi baru.");
  assert.match(text, /accountDisplayLabel/);
  assert.ok((text.match(/accountDisplayLabel\(item\)/g) || []).length >= 2, "Rekening sumber/tujuan harus memakai label kepemilikan canonical pada presentation yang menampilkan daftar.");
  assert.match(text, /accountDisplayLabel\(item\)/, "Picker rekening mobile dan desktop memakai label rekening canonical yang sama.");
  assert.match(text, /item\.source_account_id === sourceAccount\.account_id && item\.can_record_expense === true/);
  assert.doesNotMatch(text, /filterByAssigneeAccess|canUseAssignedItem/);
  assert.match(text, /transferRouteFor\(data\.transferRoutes, sourceAccount\.account_id, account\.account_id\)/);
  assert.match(text, /envelope\.source_account_id !== nextId/);
  assert.match(text, /sourceAccountPicker/);
  assert.doesNotMatch(text, /Tampilkan semua|Lihat semua|hiddenAccountLabel/);
  assert.match(text, /Belum ada rekening sumber dengan dana yang dapat digunakan/);
  assert.doesNotMatch(text, /Alokasi Dana \(manual\)|Pilih Alokasi manual|orderedEnvelopeOptions/, "Pemilihan Alokasi manual tidak boleh muncul lagi di form transaksi.");
  assert.match(text, /lockPlanningSelection/);
  assert.match(text, /Dipilih dari Alokasi Dana|Dari Alokasi/);
  assert.match(text, /UNALLOCATED_NEED_VALUE/);
  assert.match(text, /allocationCandidates\.length > 1[\s\S]*Pilih Kebutuhan yang dipakai/);
  assert.match(text, /allocationMode !== "manual"/);
  assert.match(text, /Sumber pengurangan dana: Dana Tersedia\. Kebutuhan tidak berubah\./);

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

test("modal transaksi mobile tidak autofocus nominal dan membatasi asset wallet pada presentasi desktop", async () => {
  const text = await source();
  assert.match(text, /src="\/login\/assets\/mobile\/wallet\.webp"/);
  assert.match(text, /draggable="false"/);
  assert.match(text, /initialFocusRef: mobileLayout \? undefined : amountRef/);
  assert.match(text, /modalTitle: mobileLayout \? resolvedTitle : desktopTitle/);
  assert.match(text, /mobileLayout \? submitButton/);
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
  assert.match(page, /onClick=\{openTransactionComposer\}>Catat transaksi/);
  assert.doesNotMatch(page, /formOpen|setFormOpen/, "halaman Transaksi tidak boleh memiliki composer create kedua");
  assert.match(page, /<TransactionForm open=\{Boolean\(editingTransaction\)\} transaction=\{editingTransaction\}/, "form lokal hanya untuk edit transaksi");
  assert.match(page, /"budgets\.list"/, "cancel/restore transaksi juga harus menginvalidasi pemakaian anggaran");
  assert.match(hook, /subscribeToInvalidation\(action/);
  assert.match(composer, /const TransactionForm = lazy\(\(\) => loadActionModule\("transaction"\)\)/, "composer global tetap memuat form transaksi sebagai action chunk lazy");
  assert.match(composer, /composer\.open \? <Suspense fallback=\{<LazyActionFallback surface="modal" title="Catat transaksi" label="Menyiapkan form transaksi\.\.\." \/>\}>/);
  assert.match(composer, /compose/);
  assert.match(composer, /beforeunload/);
  assert.match(composer, /onDirtyChange=\{setComposerDirty\}/);
  assert.match(composer, /planningIntent = composerObject\(source\.planningIntent\)/);
  assert.match(composer, /planningIntent=\{composer\.planningIntent\}/);
  assert.match(composer, /lockType=\{composer\.lockType\}/);
  assert.match(composer, /onBack=\{composer\.onBack\}/);
});


test("pemasukan tetap memakai rekening tujuan tanpa helper gajian permanen", async () => {
  const text = await source();
  assert.match(text, /form\.transaction_type === TRANSACTION_TYPES\.INCOME/);
  assert.match(text, /ImpactPreview/);
  assert.match(text, /const destination = accountById\(accountBalances, form\.destination_account_id\)/);
  assert.match(text, /destinationAfter/);
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
  assert.match(mobileFields, /<InlineSelectionPicker/);
  assert.match(mobileFields, /sourceAccountPicker/);
  assert.match(mobileFields, /compatibleDestinationAccounts/);
  assert.match(mobileFields, /accountDisplayLabel\(account\)/);
  assert.match(mobileFields, /searchable=\{accounts\.length > 8\}/);
  assert.doesNotMatch(mobileFields, /openMobileSelection|<select|type="radio"/, "transfer mobile memakai picker inline canonical, bukan subview atau native dropdown");
  assert.doesNotMatch(mobileFields, /server mengonfirmasi|Saldo dan dana tersedia baru berubah/);
  assert.match(mobileFields, /Tidak ada rekening tujuan yang kompatibel/);
  assert.match(mobileFields, /Dana Tersedia/);
  assert.match(mobileFields, /Setelah transfer/);
  assert.match(mobileFields, /Pemindahan antar rekening operasional tidak mengubah Dana Tersedia keluarga/);
  assert.match(modal, /closeIcon: CloseIcon = FiX/);
  assert.match(modal, /closeLabel = "Tutup dialog"/);
});


test("composer mobile memakai picker inline canonical untuk rekening, kategori, dan Alokasi Dana", async () => {
  const [form, mobile, category, picker, pickerCss, presentation] = await Promise.all([
    readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionFields.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionCategoryField.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/InlineSelectionPicker.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/common/InlineSelectionPicker.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/transactionFormPresentation.js", import.meta.url), "utf8"),
  ]);

  assert.match(form, /MobileTransactionFields/);
  assert.doesNotMatch(form, /MobileTransactionSelectionView|mobileSelection|openMobileSelection|closeMobileSelection/);
  assert.match(form, /closeIcon: FiChevronLeft/);
  assert.match(mobile, /styles\.detailStack/);
  assert.match(mobile, /Catatan & metode pembayaran/);
  assert.match(mobile, /label="Penggunaan dana"/);
  assert.match(mobile, /Pilih penggunaan dana/);
  assert.doesNotMatch(mobile, /Pilih Alokasi manual|Tutup pilihan Alokasi manual|Alokasi Dana · manual/);
  assert.match(mobile, /lockPlanningSelection/);
  assert.match(mobile, /Dari Alokasi/);
  assert.match(mobile, /<strong>Dana Tersedia<\/strong>/);
  assert.match(mobile, /transaksi dicatat tanpa Alokasi/);
  assert.match(mobile, /label: "Dana Tersedia"/);
  assert.match(mobile, /Tanpa Alokasi · Kebutuhan tidak berubah/);
  assert.match(mobile, /placeholder=\{ambiguous \? "Pilih penggunaan dana" : "Pilih Kebutuhan"\}/);

  assert.match(mobile, /<InlineSelectionPicker/);
  assert.match(mobile, /sourceAccountPicker/);
  assert.match(mobile, /compatibleDestinationAccounts/);
  assert.match(mobile, /<MobileTransactionCategoryField/);
  assert.doesNotMatch(mobile, /openMobileSelection|<select/, "composer mobile default tidak memakai subview atau native select");
  assert.match(category, /InlineSelectionPicker/);
  assert.match(category, /groups=\{groups\}/);
  assert.match(category, /frequentCategories/);
  assert.match(category, /const grouped = visibleCategories\.length > 6/);
  assert.match(category, /label: "Sering dipakai"/);
  assert.match(category, /label: "Semua kategori"/);
  assert.match(category, /searchable=\{visibleCategories\.length > 6\}/);
  assert.match(category, /searchPlaceholder="Cari kategori…"/);
  assert.match(picker, /groups = \[\]/);
  assert.match(picker, /filteredGroups/);
  assert.match(picker, /role="group"/);
  assert.match(pickerCss, /max-height:\s*min\(19rem, 44vh\)/);
  assert.match(pickerCss, /@media \(max-width: 820px\)[\s\S]*scrollbar-width:\s*none/);
  assert.match(pickerCss, /\.options::-webkit-scrollbar/);
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
  assert.match(text, /label: "Alokasikan dana"/);
  assert.match(text, /Dana sudah masuk ke rekening\. Anda dapat mengalokasikannya sekarang atau nanti\./);
  assert.doesNotMatch(text, /envelopes\.adjustAllocation|adjustAllocation\(/, "TransactionForm tidak boleh membuat allocation mutation sendiri");
});

test("form transaksi memakai smart rekening, smart Alokasi, warning dini, dan Tambah lagi tanpa auto-submit", async () => {
  const [form, smart] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/transactionFormSmartDefaults.js", import.meta.url), "utf8"),
  ]);
  assert.match(form, /sourceAccountPicker/);
  assert.match(form, /searchable=\{options\.length > 8\}/, "Daftar rekening panjang tetap searchable tanpa memenuhi form saat picker tertutup.");
  assert.match(form, /picker\.map/);
  assert.match(form, /Belum ada rekening sumber dengan dana yang dapat digunakan/);
  assert.match(form, /frequentCategories/);
  assert.match(form, /Sering dipakai/);
  assert.match(form, /smartAllocationCandidates/);
  assert.match(form, /useSmartAllocationSelection/);
  assert.match(form, /shouldApplySmartAllocationSelection/);
  assert.match(form, /disabled: planning\.locked/, "Planning intent harus menonaktifkan smart-selection agar context row Kebutuhan tidak tertimpa pada render pertama.");
  assert.match(smart, /mergeContextualAllocationCandidate/);
  assert.match(form, /earlyFundsWarning/);
  assert.match(form, /Setelah disimpan/);
  assert.doesNotMatch(form, /Lihat dampak lengkap/);
  assert.match(form, /label: "Tambah lagi"/);
  assert.match(form, /idempotencyKeyRef\.current = createTransactionIntentKey\(\)/);
  assert.match(smart, /sourceAccountHasFunds/);
  assert.match(smart, /budget\.category_id !== form\.category_id/);
  assert.match(smart, /envelope\.source_account_id !== form\.source_account_id/);
});

test("detail Alokasi memisahkan aksi umum dari tombol + Kebutuhan agar context tidak dapat hilang", async () => {
  const detail = await readFile(new URL("../src/features/allocations/AllocationPlanningDetail.jsx", import.meta.url), "utf8");
  assert.match(detail, /useTransactionComposer/);
  assert.match(detail, /Catat pengeluaran/);
  assert.match(detail, /canRecordExpense/);
  assert.match(detail, /today >= item\.period_start/);
  assert.match(detail, /const recordAllocationExpense = \(\) =>/);
  assert.match(detail, /const recordNeedExpense = \(budget\) =>/);
  assert.match(detail, /!budget\?\.budget_id \|\| !budget\?\.category_id/);
  assert.match(detail, /initialAllocationContext: \{ budget, envelope: item \}/);
  assert.match(detail, /planningIntent: \{/);
  assert.match(detail, /mode: "locked-need"/);
  assert.match(detail, /budget_id: budget\.budget_id/);
  assert.match(detail, /source_account_id: item\.source_account_id/);
  assert.match(detail, /recordExpense=\{state\.recordNeedExpense\}/);
  assert.doesNotMatch(detail, /const recordExpense = \(budget = null\)/, "Aksi Alokasi dan tombol + Kebutuhan tidak boleh berbagi callback opsional yang ambigu.");
  assert.doesNotMatch(detail, /recordAllocationExpense[\s\S]{0,500}envelope_period_id:/, "Aksi umum tanpa Kebutuhan tidak boleh diam-diam mengikat Alokasi dan menyamar sebagai penggunaan Dana Tersedia.");
  assert.doesNotMatch(detail, /createTransaction|updateTransaction|transactions\.api/, "detail Alokasi hanya boleh membuka composer, bukan menyimpan transaksi sendiri");
});

test("validasi transaksi memfokuskan field wajib dan expense tanpa kandidat memakai Dana Tersedia tanpa konfirmasi kedua", async () => {
  const [form, fields, mobile] = await Promise.all([
    source(),
    readFile(new URL("../src/features/transactions/components/TransactionFields.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/MobileTransactionFields.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(form, /focusFirstTransactionError/);
  assert.match(form, /scrollIntoViewWithMotionPreference\(target, \{ block: "center" \}\)/);
  assert.doesNotMatch(form, /behavior:\s*"smooth"/);
  assert.doesNotMatch(form, /unallocatedConfirmed|setUnallocatedConfirmed|code: "UNALLOCATED_EXPENSE"/);
  assert.match(form, /allocationCandidates\.length > 1[\s\S]*allocationMode !== "manual"/);
  assert.match(fields, /<strong>Dana Tersedia\.<\/strong>/);
  assert.match(mobile, /<strong>Dana Tersedia<\/strong>/);
  assert.match(mobile, /Belum ada Kebutuhan yang cocok · transaksi dicatat tanpa Alokasi/);
  assert.match(fields, /Lengkapi data transaksi yang wajib dipilih/);
  assert.match(fields, /aria-live="assertive"/);
  assert.match(fields, /transaction-date-error/);
  assert.match(fields, /source-account-error/);
  assert.match(fields, /destination-account-error/);
  assert.match(fields, /category-error/);
});
