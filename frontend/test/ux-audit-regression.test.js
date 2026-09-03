import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Dashboard menampilkan ringkasan Investasi dari contract overview yang benar", async () => {
  const page = await read("src/features/dashboard/DashboardPage.jsx");
  assert.match(page, /investments\.data\?\.portfolios\?\.length \? investments\.data\.summary : null/);
  assert.doesNotMatch(page, /summary\?\.portfolio_count/);
  assert.match(page, /RefreshWarning error=\{investments\.error \|\| investments\.refreshError\}/);
  assert.match(page, /onRetry=\{investments\.reload\}/);
});

test("form Investasi memakai inline validation, focus error, dan next-step RDN yang aksesibel", async () => {
  const [dialog, setup, field, model] = await Promise.all([
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/features/investments/InvestmentSetupDialog.jsx"),
    read("src/features/investments/InvestmentFormField.jsx"),
    read("src/features/investments/investments.model.js"),
  ]);
  assert.match(dialog, /validateInvestmentOperation/);
  assert.match(dialog, /querySelector\('\[aria-invalid="true"\]'\)/);
  assert.match(dialog, /noValidate/);
  assert.match(setup, /validateInvestmentSetup/);
  assert.match(setup, /isOutcomeUnknownError/);
  assert.match(setup, /Coba lagi data yang sama/);
  assert.match(setup, /const SetupFields = \(\{[^}]*mode[^}]*disabled[^}]*\}\) => <fieldset className=\{styles\.intentFieldset\} disabled=\{disabled\}>/);
  assert.match(setup, /<SetupFields[^>]*mode=\{resolvedMode\}[^>]*disabled=\{outcomeUnknown\}/);
  assert.match(setup, /dismissible=\{!busy && !outcomeUnknown\}/);
  assert.match(setup, /aria-disabled="true">\{label\}<\/span>/);
  assert.match(setup, /<Link className=\{styles\.setupLink\} to="\/rekening"/);
  assert.match(setup, /locked=\{disabled\}/);
  assert.match(setup, /Buka Rekening dan buat RDN/);
  assert.match(setup, /to="\/rekening"/);
  assert.match(setup, /accountPrefill: \{ account_type: "investment" \}/);
  assert.match(field, /aria-invalid/);
  assert.match(field, /aria-describedby/);
  assert.match(model, /tidak boleh di masa depan/);
});

test("feedback mutasi baru tidak jatuh ke label generik atau menghasilkan success ganda", async () => {
  const [feedback, investments, transferReview, masterReview, transferPanel, masterPanel] = await Promise.all([
    read("src/components/feedback/FeedbackProvider.jsx"),
    read("src/features/investments/InvestmentsPage.jsx"),
    read("src/features/transactions/useTransferRequestReview.js"),
    read("src/hooks/useMasterDataRequestReview.js"),
    read("src/features/transactions/TransferRequestsPanel.jsx"),
    read("src/features/masterData/MasterDataRequestsPanel.jsx"),
  ]);
  for (const moduleName of ["investments", "masterDataRequests", "reminders", "transferRequests"]) {
    assert.match(feedback, new RegExp(`${moduleName}:`));
  }
  for (const action of ["investments.trades.buy", "investments.reconciliations.create", "reminders.upsert", "masterDataRequests.review", "transferRequests.review"]) {
    assert.match(feedback, new RegExp(action.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(investments, /setNotice|notice--success/);
  assert.match(investments, /useFeedback/);
  assert.match(transferReview, /isOutcomeUnknownError/);
  assert.match(transferReview, /unresolvedIntent/);
  assert.match(transferReview, /retryUnresolvedIntent/);
  assert.match(transferReview, /Pengajuan transfer disetujui/);
  assert.match(transferReview, /tone: "danger"/);
  assert.match(masterReview, /isOutcomeUnknownError/);
  assert.match(masterReview, /retryUnresolvedIntent/);
  assert.match(transferPanel, /Coba lagi keputusan yang sama/);
  assert.match(transferPanel, /locked=\{Boolean\(unresolvedIntent\)\}/);
  assert.match(masterPanel, /Coba lagi keputusan yang sama/);
  assert.match(masterPanel, /Boolean\(unresolvedIntent\)/);
});

test("dialog Target dipisah lazy agar route mempunyai headroom bundle yang sehat", async () => {
  const [page, layer] = await Promise.all([
    read("src/features/goals/GoalsPage.jsx"),
    read("src/features/goals/components/GoalDialogLayer.jsx"),
  ]);
  assert.match(page, /const GoalDialogLayer = lazy\(\(\) => import\("\.\/components\/GoalDialogLayer\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{null\}>/);
  assert.doesNotMatch(page, /from "\.\/components\/GoalDialogs\.jsx"/);
  assert.doesNotMatch(page, /from "\.\.\/reminders\/ManualReminderModal\.jsx"/);
  assert.match(layer, /GoalConfirmations/);
  assert.match(layer, /ManualReminderModal/);
});

test("dialog Investasi dimuat lazy agar route mempunyai headroom build budget", async () => {
  const page = await read("src/features/investments/InvestmentsPage.jsx");
  assert.match(page, /const InvestmentDialog = lazy\(\(\) => import\("\.\/InvestmentDialog\.jsx"\)\)/);
  assert.match(page, /const InvestmentSetupDialog = lazy\(\(\) => import\("\.\/InvestmentSetupDialog\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{null\}>/);
  assert.doesNotMatch(page, /import InvestmentDialog from "\.\/InvestmentDialog\.jsx"/);
  assert.doesNotMatch(page, /import InvestmentSetupDialog from "\.\/InvestmentSetupDialog\.jsx"/);
});

test("Investasi mengunci intent ketika outcome write belum pasti dan hanya mengizinkan retry payload yang sama", async () => {
  const [dialog, feedback] = await Promise.all([
    read("src/features/investments/InvestmentDialog.jsx"),
    read("src/components/feedback/FeedbackProvider.jsx"),
  ]);
  assert.match(dialog, /isOutcomeUnknownError/);
  assert.match(dialog, /const \[outcomeUnknown, setOutcomeUnknown\] = useState\(false\)/);
  assert.match(dialog, /Coba lagi data yang sama/);
  assert.match(dialog, /fieldset className=\{styles\.intentFieldset\} disabled=\{outcomeUnknown\}/);
  assert.match(dialog, /dismissible=\{!busy && !outcomeUnknown\}/);
  assert.match(feedback, /visible\.status !== "unknown"/);
  assert.match(feedback, /\["idle", "submitting", "unknown"\]\.includes\(activity\.status\)/);
});

test("tab Planning dan Persetujuan memakai roving focus dan keyboard navigation lengkap", async () => {
  const [planning, approval] = await Promise.all([
    read("src/features/planning/PlanningPage.jsx"),
    read("src/features/approvals/ApprovalCenterPage.jsx"),
  ]);
  for (const source of [planning, approval]) {
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) assert.match(source, new RegExp(key));
    assert.match(source, /role="tab"/);
    assert.match(source, /aria-controls=/);
    assert.match(source, /tabIndex=\{/);
    assert.match(source, /role="tabpanel"/);
    assert.match(source, /aria-labelledby=/);
  }
});



test("tanggal pengajuan transfer ditampilkan sebagai tanggal Indonesia, bukan raw ISO", async () => {
  const panel = await read("src/features/transactions/TransferRequestsPanel.jsx");
  assert.match(panel, /formatDateLongIndonesia/);
  assert.match(panel, /formatDateLongIndonesia\(payload\.transaction_date\)/);
});
