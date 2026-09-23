import { useEffect, useMemo, useState } from "react";
import { FiArchive, FiCheckCircle, FiEdit2, FiHome, FiMoreHorizontal, FiPlus, FiUsers } from "react-icons/fi";
import { useLocation } from "react-router";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { accountOptionVisual, categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { assertPositiveRupiah, formatRupiah } from "../../domain/money.js";
import { currentMonthBoundsInJakarta, currentMonthInJakarta, formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { planningNeedSelectionPatch } from "../../shared/workflows/planningBudgetLinks.js";
import { scrollIntoViewWithMotionPreference } from "../../shared/motion.js";
import { archiveCommitment, createCommitment, updateCommitment } from "./commitments.api.js";
import { applyFlatEstimate, flatLoanEstimate, inferFlatAnnualRate, isDebtCommitment } from "./commitmentModel.js";
import styles from "./CommitmentsPage.module.css";

const TYPES = [
  { value: "mortgage", label: "KPR", description: "Kredit rumah yang dilunasi bertahap" },
  { value: "installment", label: "Cicilan", description: "Kendaraan atau barang" },
  { value: "loan", label: "Pinjaman", description: "Bank, koperasi, atau pribadi" },
  { value: "arisan", label: "Arisan", description: "Setoran berkala sampai selesai" },
  { value: "other", label: "Lainnya", description: "Kewajiban berkala lainnya" },
];
const emptyForm = () => ({ commitment_type: "mortgage", name: "", provider: "", original_amount: "", current_balance: "", installment_amount: "", total_installments: "", installments_paid: "", next_installment: "", flat_interest_rate: "0", default_account_id: "", category_id: "", budget_id: "", due_day: "10", start_date: "", end_date: "" });
const refreshKeys = ["commitments.list", "recurring.list", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "app.initialState"];
const typeLabel = (type) => TYPES.find((item) => item.value === type)?.label || "Kewajiban";

const ProgressBar = ({ value, label, meta }) => <div className={styles.progressWrap}>
  {(label || meta) ? <div className={styles.progressMeta}><strong>{label}</strong><span>{meta}</span></div> : null}
  <div className={styles.progress} aria-label={`Progress ${value}%`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
</div>;

const installmentProgress = (item) => {
  const total = Math.max(0, Number(item.total_installments || 0));
  const paid = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Number(item.installments_paid || 0)));
  const remaining = total ? Math.max(0, total - paid) : 0;
  const next = total ? Math.min(total, paid + 1) : paid + 1;
  const percent = total ? Math.round(paid / total * 100) : 0;
  return { total, paid, remaining, next, percent };
};

const nextDueLabel = (item) => {
  if (!item.next_due_date) return item.status === "completed" ? "Selesai" : `Tanggal ${item.due_day}`;
  const today = todayInJakarta();
  if (item.next_due_date < today) return `Terlambat · ${formatDateLongIndonesia(item.next_due_date)}`;
  if (item.next_due_date === today) return "Jatuh tempo hari ini";
  return formatDateLongIndonesia(item.next_due_date);
};

const CommitmentSummary = ({ items }) => {
  const active = items.filter((item) => item.status === "active");
  const remaining = active.filter((item) => item.commitment_type !== "arisan").reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  const monthEnd = currentMonthBoundsInJakarta().end;
  const dueThisMonth = active.reduce((sum, item) => item.next_due_date && item.next_due_date <= monthEnd ? sum + Number(item.next_due_remaining || 0) : sum, 0);
  return <section className={styles.summary}>
    <div><span>Sisa kewajiban</span><strong>{formatRupiah(remaining)}</strong><small>{active.length} kewajiban aktif</small></div>
    <div><span>Perlu dibayar bulan ini</span><strong>{formatRupiah(dueThisMonth)}</strong><small>Termasuk yang sudah lewat jatuh tempo</small></div>
  </section>;
};

const CommitmentMeta = ({ item, arisan }) => <>
  <dl className={styles.meta}>
    <div><dt>{arisan ? "Setoran" : "Cicilan"}</dt><dd>{formatRupiah(item.installment_amount || 0)} / bulan</dd></div>
    <div><dt>Berikutnya</dt><dd>{nextDueLabel(item)}</dd></div>
    <div><dt>Dibayar dari</dt><dd>{item.account_name || "Rekening"}</dd></div>
  </dl>
  {(item.budget_id || (!arisan && Number(item.flat_principal_amount || 0) > 0) || (arisan && Number(item.received_amount || 0) > 0)) ? <details className={styles.cardDetails}>
    <summary>Rincian</summary>
    <dl>
      {item.budget_id ? <div><dt>Alokasi</dt><dd>Terhubung ke Kebutuhan</dd></div> : null}
      {!arisan && Number(item.flat_principal_amount || 0) > 0 ? <div><dt>Pokok + bunga/biaya</dt><dd>{formatRupiah(item.flat_principal_amount)} + {formatRupiah(item.flat_interest_amount || 0)}</dd></div> : null}
      {arisan && Number(item.received_amount || 0) > 0 ? <div><dt>Sudah diterima</dt><dd>{formatRupiah(item.received_amount)}</dd></div> : null}
    </dl>
  </details> : null}
</>;

const commitmentPaymentState = (item) => ({
  workflowSource: "commitment",
  workflowAction: "pay-recurring",
  occurrenceId: item.next_occurrence_id || "",
  ...(item.next_due_date ? { period: String(item.next_due_date).slice(0, 7) } : {}),
});

const CommitmentActions = ({ item, onEdit, onStop }) => {
  const active = item.status === "active";
  const hasPayment = Boolean(active && item.next_occurrence_id);
  const hasManagement = (item.can_manage && active) || item.can_delete;
  if (!active && !hasManagement) return null;
  return <div className={styles.actions}>
    {hasPayment ? <ButtonLink variant="primary" icon={FiCheckCircle} to="/perencanaan/jadwal" state={commitmentPaymentState(item)}>Bayar</ButtonLink> : null}
    {(active || hasManagement) ? <details className={styles.manageMenu}>
      <summary aria-label={`Kelola kewajiban ${item.name}`} title="Kelola kewajiban"><FiMoreHorizontal aria-hidden="true" /></summary>
      <div className={styles.manageMenuItems}>
        {active ? <ButtonLink to="/perencanaan/kantong" state={{ workflowSource: "commitment", workflowAction: "commitment-plan", commitmentId: item.commitment_id, budgetId: item.budget_id || "", sourceAccountId: item.default_account_id || "" }}>Buka Alokasi</ButtonLink> : null}
        {item.can_manage && active ? <Button icon={FiEdit2} onClick={() => onEdit(item)}>Edit kewajiban</Button> : null}
        {item.can_delete ? <Button icon={FiArchive} variant="danger" onClick={() => onStop(item)}>Hentikan kewajiban</Button> : null}
      </div>
    </details> : null}
  </div>;
};

const commitmentCardClassName = ({ compact, highlighted }) => [styles.card, compact ? styles.cardCompact : "", highlighted ? styles.cardHighlighted : ""].filter(Boolean).join(" ");

const CommitmentCard = ({ item, onEdit, onStop, compact = false, highlighted = false }) => {
  const arisan = item.commitment_type === "arisan";
  const completed = item.status === "completed";
  const balanceProgress = Number(item.progress_percent || 0);
  const installments = installmentProgress(item);
  const showInstallmentProgress = !arisan && installments.total > 0;
  return <article id={`commitment-${item.commitment_id}`} className={commitmentCardClassName({ compact, highlighted })}>
    <div className={styles.cardIcon}>{completed ? <FiCheckCircle aria-hidden="true" /> : arisan ? <FiUsers aria-hidden="true" /> : <FiHome aria-hidden="true" />}</div>
    <div className={styles.cardTitle}><span>{typeLabel(item.commitment_type)}{item.provider ? ` · ${item.provider}` : ""}</span><h3>{item.name}</h3></div>
    <div className={styles.amountBlock}><span>{arisan ? "Sisa setoran" : "Sisa pokok"}</span><strong>{formatRupiah(item.current_balance || 0)}</strong><small>{completed ? "Lunas / selesai" : arisan ? `${balanceProgress}% selesai` : `${balanceProgress}% pokok lunas`}</small></div>
    {showInstallmentProgress ? <ProgressBar value={completed ? 100 : installments.percent} label={completed ? `${installments.total} dari ${installments.total} cicilan` : `Cicilan berikutnya ke-${installments.next} dari ${installments.total}`} meta={completed ? "Selesai" : `${installments.paid} selesai · ${installments.remaining} tersisa`} /> : <ProgressBar value={completed ? 100 : balanceProgress} />}
    {!compact ? <CommitmentMeta item={item} arisan={arisan} /> : null}
    {item.balance_needs_update ? <CompactNotice tone="info" title="Sisa pokok belum pasti">Pembayaran sebelumnya belum memiliki rincian pokok. Periksa kembali sebelum pembayaran berikutnya.</CompactNotice> : null}
    <CommitmentActions item={item} onEdit={onEdit} onStop={onStop} />
  </article>;
};

const AccountPicker = ({ value, accounts, onChange, label = "Bayar dari" }) => <InlineSelectionPicker className="form-grid__full" label={label} required value={value} onChange={onChange} placeholder="Pilih rekening" placeholderOption={{ icon: AccountIcon }} options={accounts.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), meta: `Tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`, ...accountOptionVisual(item) }))} searchable={accounts.length > 8} searchPlaceholder="Cari rekening…" />;
const CategoryPicker = ({ value, categories, onChange, label = "Kategori pembayaran" }) => <SelectionField className="form-grid__full" label={label} required value={value} onChange={onChange} placeholder="Pilih kategori" options={categories.map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item) }))} searchable={categories.length > 8} />;

const planningPatch = (current, budgets, next = {}) => {
  const categoryId = next.category_id ?? current.category_id;
  const accountId = next.default_account_id ?? current.default_account_id;
  const patch = planningNeedSelectionPatch({ budgets, categoryId, accountId, budgetId: current.budget_id || "" });
  return { ...current, ...next, category_id: categoryId, default_account_id: patch.account_id, budget_id: patch.budget_id };
};

const FlatInterestField = ({ form, setForm }) => {
  const estimate = flatLoanEstimate({ originalAmount: form.original_amount, totalInstallments: form.total_installments, annualRatePercent: form.flat_interest_rate });
  return <>
    <label className="field"><span>Bunga flat / tahun (%)</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.flat_interest_rate} onChange={(event) => setForm((current) => applyFlatEstimate(current, { flat_interest_rate: event.target.value }))} /></label>
    {estimate.installment > 0 ? <CompactNotice className="form-grid__full" tone="info" title={`Perkiraan cicilan ${formatRupiah(estimate.installment)}`}>Pokok {formatRupiah(estimate.principal)} · bunga {formatRupiah(estimate.interest)} per bulan.</CompactNotice> : null}
  </>;
};

const MortgageProgressFields = ({ form, setForm, editing }) => {
  const total = Math.max(0, Number(form.total_installments || 0));
  const paid = Math.max(0, Number(form.installments_paid || 0));
  const next = Math.max(1, Number(form.next_installment || (paid + 1) || 1));
  const normalizedPaid = editing ? paid : Math.max(0, next - 1);
  const remaining = total ? Math.max(0, total - normalizedPaid) : 0;
  const percent = total ? Math.min(100, Math.round(normalizedPaid / total * 100)) : 0;
  const updateNext = (value) => {
    const raw = value === "" ? "" : String(Math.max(1, Number(value) || 1));
    setForm((current) => ({ ...current, next_installment: raw, installments_paid: raw === "" ? "" : String(Math.max(0, Number(raw) - 1)) }));
  };
  return <div className={`form-grid__full ${styles.mortgageProgress}`}>
    <div className={styles.mortgageProgressCopy}>
      <span>Progress cicilan</span>
      <strong>{total ? `Cicilan berikutnya ke-${editing ? Math.min(total, paid + 1) : next} dari ${total}` : "Isi posisi cicilan"}</strong>
      <small>{total ? `${normalizedPaid} selesai · ${remaining} tersisa` : "Masukkan cicilan berikutnya dan total tenor."}</small>
      <div className={styles.progress}><i style={{ width: `${percent}%` }} /></div>
    </div>
    <div className={styles.mortgageProgressInputs}>
      {!editing ? <input aria-label="Cicilan berikutnya" type="number" min="1" inputMode="numeric" value={form.next_installment || ""} onChange={(event) => updateNext(event.target.value)} placeholder="9" /> : <span>{Math.min(total || paid + 1, paid + 1)}</span>}
      <b>/</b>
      <input aria-label="Total cicilan" type="number" min="1" inputMode="numeric" required value={form.total_installments} onChange={(event) => setForm((current) => ({ ...current, total_installments: event.target.value }))} placeholder="180" />
    </div>
  </div>;
};

const CommitmentIdentityFields = ({ form, setForm, categories, editing, arisan }) => <>
  {!editing ? <SelectionField className="form-grid__full" label="Jenis kewajiban" value={form.commitment_type} onChange={(commitment_type) => setForm({ ...emptyForm(), commitment_type, category_id: suggestedCategoryId(categories, commitment_type) })} options={TYPES} /> : null}
  <label className="field form-grid__full"><span>{arisan ? "Nama arisan" : "Nama kewajiban"} *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={arisan ? "Contoh: Arisan Keluarga" : "Contoh: KPR Rumah"} /></label>
  <label className="field form-grid__full"><span>{arisan ? "Grup/penyelenggara" : "Bank/Penyedia"}</span><input maxLength="100" value={form.provider || ""} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder={arisan ? "Keluarga" : "BTN"} /></label>
</>;

const CommitmentPrincipalFields = ({ form, setForm, editing, arisan, debt, mortgage, setEstimated }) => <>
  {debt && !editing ? <MoneyInput id="commitment-original" label="Pinjaman / nilai awal" value={form.original_amount} onChange={(original_amount) => mortgage ? setForm((current) => ({ ...current, original_amount })) : setEstimated({ original_amount })} required /> : null}
  {!editing ? <MoneyInput id="commitment-balance" label={arisan ? "Sisa setoran sekarang" : "Sisa pokok sekarang"} value={form.current_balance} onChange={(current_balance) => setForm((current) => ({ ...current, current_balance }))} /> : null}
</>;

const CommitmentTenorFields = ({ form, setForm, editing, arisan, debt, mortgage, setEstimated }) => <>
  {mortgage ? <MortgageProgressFields form={form} setForm={setForm} editing={editing} /> : <label className="field"><span>{arisan ? "Jumlah setoran" : "Tenor"} (bulan) *</span><input type="number" min="1" required value={form.total_installments} onChange={(event) => arisan ? setForm((current) => ({ ...current, total_installments: event.target.value })) : setEstimated({ total_installments: event.target.value })} placeholder="Contoh: 120" /></label>}
  {debt && !mortgage ? <FlatInterestField form={form} setForm={setForm} /> : null}
  <MoneyInput id="commitment-installment" label={arisan ? "Setoran per bulan" : "Cicilan per bulan"} value={form.installment_amount} onChange={(installment_amount) => setForm((current) => ({ ...current, installment_amount }))} required />
</>;

const CommitmentDueField = ({ form, setForm, editing, mortgage }) => mortgage && !editing
  ? <label className="field form-grid__full"><span>Pembayaran berikutnya *</span><TemporalInput required type="date" value={form.start_date || ""} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value, due_day: event.target.value ? String(Number(event.target.value.slice(-2))) : current.due_day }))} /></label>
  : <label className="field"><span>Bayar setiap tanggal *</span><input type="number" min="1" max="31" required value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: event.target.value }))} /></label>;

const CommitmentPlanningFields = ({ form, setForm, accounts, categories, budgets }) => <>
  <AccountPicker value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => planningPatch(current, budgets, { default_account_id }))} />
  <CategoryPicker value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => planningPatch(current, budgets, { category_id }))} />
  {form.budget_id ? <CompactNotice className="form-grid__full" tone="success" title="Pencatatan otomatis siap">Saat jatuh tempo, pembayaran dicatat dari Kebutuhan/Alokasi hanya jika dana benar-benar mencukupi. Pembayaran ke bank atau penyedia tetap dilakukan di luar aplikasi.</CompactNotice> : null}
</>;

const MortgageDetails = ({ form, setForm }) => <details className={`form-grid__full ${styles.loanDetails}`}><summary>Detail pinjaman</summary><div className="form-grid">
  <label className="field form-grid__full"><span>Selesai sesuai kontrak</span><TemporalInput type="date" value={form.end_date || ""} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
  <CompactNotice className="form-grid__full" tone="info">KPR memakai nominal cicilan aktual dari bank. Saldo pokok tidak diasumsikan turun secara flat; setelah pembayaran, perbarui sisa pokok dari data bank bila tersedia.</CompactNotice>
</div></details>;

const CommitmentFormNotices = ({ editing, debt, error }) => <>
  {editing && debt ? <CompactNotice className="form-grid__full" tone="info">Nilai awal dan sisa pokok tidak diubah dari form ini agar histori pembayaran tetap konsisten.</CompactNotice> : null}
  {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
</>;

const CommitmentForm = ({ form, setForm, accounts, categories, budgets, error, editing = false }) => {
  const arisan = form.commitment_type === "arisan";
  const debt = isDebtCommitment(form.commitment_type);
  const mortgage = form.commitment_type === "mortgage";
  const setEstimated = (patch) => setForm((current) => applyFlatEstimate(current, patch));
  return <div className="form-grid">
    <CommitmentIdentityFields form={form} setForm={setForm} categories={categories} editing={editing} arisan={arisan} />
    <CommitmentPrincipalFields form={form} setForm={setForm} editing={editing} arisan={arisan} debt={debt} mortgage={mortgage} setEstimated={setEstimated} />
    <CommitmentTenorFields form={form} setForm={setForm} editing={editing} arisan={arisan} debt={debt} mortgage={mortgage} setEstimated={setEstimated} />
    <CommitmentDueField form={form} setForm={setForm} editing={editing} mortgage={mortgage} />
    <CommitmentPlanningFields form={form} setForm={setForm} accounts={accounts} categories={categories} budgets={budgets} />
    {mortgage ? <MortgageDetails form={form} setForm={setForm} /> : null}
    <CommitmentFormNotices editing={editing} debt={debt} error={error} />
  </div>;
};


const suggestedCategoryId = (categories, type) => {
  const terms = type === "mortgage" ? ["kpr", "cicilan", "rumah"] : type === "installment" ? ["cicilan"] : type === "loan" ? ["pinjaman", "cicilan"] : [];
  for (const term of terms) {
    const exact = categories.find((item) => String(item.name || "").trim().toLowerCase() === term);
    if (exact) return exact.category_id;
  }
  for (const term of terms) {
    const partial = categories.find((item) => String(item.name || "").toLowerCase().includes(term));
    if (partial) return partial.category_id;
  }
  return categories.length === 1 ? categories[0].category_id : "";
};

const commitmentResourceGate = (resource) => {
  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat Kewajiban…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return null;
};

const CommitmentsPage = () => {
  const location = useLocation();
  const resource = useApiResource("commitments.list", {});
  const budgetResource = useApiResource("budgets.list", { period: currentMonthInJakarta() });
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const mutation = useGuardedMutation();
  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [stopTarget, setStopTarget] = useState(null);
  const [stopError, setStopError] = useState(null);
  const highlightedCommitmentId = String(location.state?.planningCommitmentId || "");
  useEffect(() => {
    if (resource.status !== "ready" || !highlightedCommitmentId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      scrollIntoViewWithMotionPreference(document.getElementById(`commitment-${highlightedCommitmentId}`), { block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedCommitmentId, resource.status]);
  const accounts = useMemo(() => (bootstrap?.accounts || []).filter((item) => item.status === "active" && item.account_type !== "investment").map((item) => ({ ...item, ...(overview?.accountBalances || []).find((row) => row.account_id === item.account_id) })), [bootstrap?.accounts, overview?.accountBalances]);
  const expenseCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const budgets = useMemo(() => (budgetResource.data?.items || []).filter((item) => item.can_manage !== false), [budgetResource.data?.items]);
  const closeCreate = () => { if (!mutation.busy) setCreateOpen(false); };
  const closeEdit = () => { if (!mutation.busy) setEdit(null); };
  const createGuard = useUnsavedChangesGuard({ open: createOpen, value: form, onClose: closeCreate, blocked: mutation.busy });
  const editGuard = useUnsavedChangesGuard({ open: Boolean(edit), value: edit, onClose: closeEdit, blocked: mutation.busy });
  const reloadAll = async () => { invalidate(refreshKeys); await Promise.allSettled([resource.reload(), budgetResource.reload(), refreshOverview()]); };

  const submitCreate = (event) => { event.preventDefault(); return mutation.run(async () => {
    const arisan = form.commitment_type === "arisan";
    await createCommitment({
      commitment_type: form.commitment_type,
      name: form.name,
      provider: form.provider,
      original_amount: arisan ? undefined : assertPositiveRupiah(form.original_amount),
      current_balance: form.current_balance === "" ? undefined : Number(form.current_balance),
      installment_amount: assertPositiveRupiah(form.installment_amount),
      total_installments: Number(form.total_installments),
      installments_paid: form.commitment_type === "mortgage" ? Math.max(0, Number(form.installments_paid || 0)) : undefined,
      default_account_id: form.default_account_id,
      category_id: form.category_id,
      budget_id: form.budget_id || null,
      frequency: "monthly",
      due_day: Number(form.due_day),
      start_date: form.commitment_type === "mortgage" ? form.start_date : undefined,
      end_date: form.end_date || undefined,
      payment_method: "transfer",
    });
    const name = form.name || "Kewajiban";
    setCreateOpen(false); setForm(emptyForm()); notify({ message: `${name} berhasil dibuat. Jadwal pembayaran berikutnya sudah disiapkan.`, tone: "success", dedupeKey: "commitments:create" }); await reloadAll();
  }).catch(() => undefined); };

  const openEdit = (item) => {
    mutation.reset();
    const inferredRate = item.commitment_type === "mortgage" ? 0 : inferFlatAnnualRate({ originalAmount: item.original_amount, totalInstallments: item.total_installments, installmentAmount: item.installment_amount });
    setEdit({ ...item, budget_id: item.budget_id || "", installment_amount: String(item.installment_amount || ""), total_installments: String(item.total_installments || ""), installments_paid: String(item.installments_paid || 0), next_installment: String(Math.max(1, Number(item.installments_paid || 0) + 1)), due_day: String(item.due_day || 1), original_amount: String(item.original_amount || ""), current_balance: String(item.current_balance || ""), flat_interest_rate: String(Number(inferredRate.toFixed(4))), start_date: item.start_date || "", end_date: item.end_date || "" });
  };

  const submitEdit = (event) => { event.preventDefault(); if (!edit) return; return mutation.run(async () => {
    await updateCommitment({ commitment_id: edit.commitment_id, row_version: edit.row_version, name: edit.name, provider: edit.provider, installment_amount: assertPositiveRupiah(edit.installment_amount), total_installments: Number(edit.total_installments), default_account_id: edit.default_account_id, category_id: edit.category_id, budget_id: edit.budget_id || null, frequency: "monthly", due_day: Number(edit.due_day), start_date: edit.start_date || undefined, end_date: edit.end_date || null, payment_method: "transfer" }, { rowVersion: edit.row_version });
    const name = edit.name || "Kewajiban";
    setEdit(null); notify({ message: `${name} diperbarui. Jadwal berikutnya ikut menyesuaikan.`, tone: "success", dedupeKey: "commitments:update" }); await reloadAll();
  }).catch(() => undefined); };

  const submitStop = async () => {
    if (!stopTarget) return;
    setStopError(null);
    try {
      await mutation.run(() => archiveCommitment({ commitment_id: stopTarget.commitment_id, row_version: stopTarget.row_version, reason: "Dihentikan dari Kewajiban" }, { rowVersion: stopTarget.row_version }));
      setStopTarget(null);
      notify({ message: "Kewajiban dihentikan. Jadwal berikutnya tidak dibuat; transaksi lama tetap tersimpan.", tone: "success", dedupeKey: "commitments:archive" });
      await reloadAll();
    } catch (error) { setStopError(error); }
  };

  const resourceGate = commitmentResourceGate(resource);
  if (resourceGate) return resourceGate;
  const items = resource.data?.items || [];
  const activeItems = items.filter((item) => item.status === "active");
  const completedItems = items.filter((item) => item.status === "completed");
  const openCreate = () => {
    mutation.reset();
    const next = emptyForm();
    next.category_id = suggestedCategoryId(expenseCategories, next.commitment_type);
    setForm(next);
    setCreateOpen(true);
  };
  const cardProps = { onEdit: openEdit, onStop: (target) => { setStopError(null); setStopTarget(target); } };

  return <div className={styles.page}>
    <RefreshWarning error={resource.refreshError || budgetResource.refreshError} onRetry={() => Promise.allSettled([resource.reload(), budgetResource.reload()])} />
    <div className={styles.header}><div><h2>Kewajiban</h2></div>{items.length ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Tambah kewajiban</Button> : null}</div>
    {items.length ? <>
      {activeItems.length > 1 ? <CommitmentSummary items={items} /> : null}
      {activeItems.length ? <section className={styles.grid}>{activeItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} highlighted={String(item.commitment_id) === highlightedCommitmentId} {...cardProps} />)}</section> : <EmptyState icon={FiCheckCircle} title="Semua kewajiban selesai" description="Belum ada cicilan atau kewajiban aktif yang perlu dipantau." />}
      {completedItems.length ? <section className={styles.completed}><div className={styles.sectionHeading}><div><h3>Selesai</h3><p>Kewajiban yang sudah lunas tetap ringan dan tersimpan sebagai histori.</p></div><span>{completedItems.length}</span></div><div className={styles.grid}>{completedItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} compact highlighted={String(item.commitment_id) === highlightedCommitmentId} {...cardProps} />)}</div></section> : null}
    </> : <EmptyState icon={FiHome} title="Punya cicilan, KPR, pinjaman, atau Arisan?" description="Mulai dari sisa dan cicilan sekarang. Pembayaran lama tidak perlu dibuat ulang; jadwal berikutnya disiapkan otomatis." action={<Button variant="primary" icon={FiPlus} onClick={openCreate}>Tambah kewajiban</Button>} />}

    <Modal open={createOpen} onClose={createGuard.requestClose} discardGuard={createGuard} discardSubject="kewajiban baru" dismissible={!mutation.busy} title="Tambah kewajiban" footer={<><Button disabled={mutation.busy} onClick={createGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-create-form" loading={mutation.busy}>Simpan {typeLabel(form.commitment_type)}</Button></>}><form id="commitment-create-form" onSubmit={submitCreate}><CommitmentForm form={form} setForm={setForm} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} /></form></Modal>
    <Modal open={Boolean(edit)} onClose={editGuard.requestClose} discardGuard={editGuard} discardSubject="perubahan kewajiban" dismissible={!mutation.busy} title={edit ? `Edit ${typeLabel(edit.commitment_type)}` : "Edit kewajiban"} description="Perubahan berlaku untuk jadwal berikutnya tanpa mengubah histori pembayaran." footer={<><Button disabled={mutation.busy} onClick={editGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-edit-form" loading={mutation.busy}>Simpan perubahan</Button></>}><form id="commitment-edit-form" onSubmit={submitEdit}>{edit ? <CommitmentForm form={edit} setForm={setEdit} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} editing /> : null}</form></Modal>
    <ConfirmationModal open={Boolean(stopTarget)} title="Hentikan kewajiban?" description={stopTarget ? `${stopTarget.name} tidak lagi aktif dan jadwal berikutnya dihentikan. Transaksi yang sudah tercatat tetap disimpan agar saldo dan laporan tetap benar.` : ""} confirmLabel="Hentikan kewajiban" busy={mutation.busy} error={stopError} onCancel={() => !mutation.busy && setStopTarget(null)} onConfirm={submitStop} />
  </div>;
};

export default CommitmentsPage;
