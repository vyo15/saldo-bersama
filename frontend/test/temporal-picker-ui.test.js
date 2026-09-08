import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("temporal picker canonical menyediakan date month time dan same-modal subview", async () => {
  const [picker, modal, context, css] = await Promise.all([
    read("src/components/common/TemporalPickerField.jsx"),
    read("src/components/common/Modal.jsx"),
    read("src/components/common/ModalSubviewContext.js"),
    read("src/components/common/TemporalPickerField.module.css"),
  ]);

  assert.match(picker, /const CalendarPanel/);
  assert.match(picker, /const MonthPanel/);
  assert.match(picker, /const TimePanel/);
  assert.match(picker, /Array\.from\(\{ length: 24 \}/);
  assert.match(picker, /Array\.from\(\{ length: 60 \}/);
  assert.match(picker, /00:00–23:59/);
  assert.match(picker, /inputMode="numeric"/);
  assert.match(picker, /maxLength=\{2\}/);
  assert.match(picker, /withinBounds/);
  assert.match(picker, /Hari ini/);
  assert.match(picker, /Kemarin/);
  assert.match(picker, /\+30 menit/);
  assert.match(picker, /useModalSubview/);
  assert.match(context, /openSubview|ModalSubviewContext/);
  assert.match(modal, /subview\?\.content/);
  assert.match(modal, /FiArrowLeft/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /min-height:\s*2\.75rem/);
});

test("semua temporal field feature memakai adapter canonical", async () => {
  const sources = await Promise.all([
    "src/features/transactions/TransactionsPage.jsx",
    "src/features/transactions/MobileTransactionFields.jsx",
    "src/features/transactions/MobileTransferFields.jsx",
    "src/features/transactions/components/TransactionFields.jsx",
    "src/features/recurring/RecurringPage.jsx",
    "src/features/recurring/RecurringDialogs.jsx",
    "src/features/reminders/ManualReminderModal.jsx",
    "src/features/reports/ReportsPage.jsx",
    "src/features/budgets/BudgetDialogLayer.jsx",
    "src/features/allocations/AllocationDialogLayer.jsx",
    "src/features/goals/components/GoalDialogs.jsx",
    "src/features/accounts/components/AccountEditorDialogs.jsx",
    "src/features/investments/InvestmentDialog.jsx",
    "src/features/settings/PeriodControlPage.jsx",
    "src/features/settings/components/MemberActivityPanel.jsx",
  ].map(read));
  const joined = sources.join("\n");
  assert.equal((joined.match(/<TemporalInput\b/g) || []).length, 27);
  assert.doesNotMatch(joined, /<input\b[^>]*\btype=["'](?:date|month|time)["']/s);
});

test("target baru mempertahankan validasi wajib setelah native date input dipensiunkan", async () => {
  const source = await read("src/features/goals/GoalsPage.jsx");
  assert.match(source, /if \(!form\.target_date\)/);
  assert.match(source, /Tanggal target wajib dipilih\./);
});
