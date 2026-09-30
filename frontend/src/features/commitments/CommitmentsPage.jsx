import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiArchive, FiCheckCircle, FiEdit2, FiHome, FiMoreHorizontal, FiPlus, FiUsers } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { assertPositiveRupiah, formatRupiah } from "../../domain/money.js";
import { currentMonthBoundsInJakarta, currentMonthInJakarta, formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { scrollIntoViewWithMotionPreference } from "../../shared/motion.js";
import { archiveCommitment, updateCommitment } from "./commitments.api.js";
import { commitmentCollectionState, inferFlatAnnualRate } from "./commitmentModel.js";
import useCommitmentCreateFlow from "./useCommitmentCreateFlow.js";
import styles from "./CommitmentsPage.module.css";

const CommitmentDialogLayer = lazy(() => import("./CommitmentDialogLayer.jsx"));

const TYPE_LABELS = Object.freeze({ mortgage: "KPR", installment: "Cicilan", loan: "Pinjaman", arisan: "Arisan", other: "Lainnya" });
const emptyForm = () => ({ commitment_type: "mortgage", name: "", provider: "", original_amount: "", current_balance: "", installment_amount: "", total_installments: "", installments_paid: "", next_installment: "", flat_interest_rate: "0", default_account_id: "", category_id: "", budget_id: "", due_day: "10", start_date: "", end_date: "" });
const refreshKeys = ["commitments.list", "recurring.list", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "app.initialState"];
const typeLabel = (type) => TYPE_LABELS[type] || "Kewajiban";

const CommitmentProgress = ({ value, label, meta }) => <div className={styles.progressWrap}>
  {(label || meta) ? <div className={styles.progressMeta}><strong>{label}</strong><span>{meta}</span></div> : null}
  <ProgressBar value={value} max={100} label={label || "Progress kewajiban"} showValue={false} compact />
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
    {showInstallmentProgress ? <CommitmentProgress value={completed ? 100 : installments.percent} label={completed ? `${installments.total} dari ${installments.total} cicilan` : `Cicilan berikutnya ke-${installments.next} dari ${installments.total}`} meta={completed ? "Selesai" : `${installments.paid} selesai · ${installments.remaining} tersisa`} /> : <CommitmentProgress value={completed ? 100 : balanceProgress} />}
    {!compact ? <CommitmentMeta item={item} arisan={arisan} /> : null}
    {item.balance_needs_update ? <CompactNotice tone="info" title="Sisa pokok belum pasti">Pembayaran sebelumnya belum memiliki rincian pokok. Periksa kembali sebelum pembayaran berikutnya.</CompactNotice> : null}
    <CommitmentActions item={item} onEdit={onEdit} onStop={onStop} />
  </article>;
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

const commitmentDetailsError = (form) => {
  if (!String(form.name || "").trim()) return "Nama kewajiban wajib diisi.";
  if (["mortgage", "installment", "loan"].includes(form.commitment_type) && Number(form.original_amount || 0) <= 0) return "Nilai pinjaman awal wajib diisi.";
  if (Number(form.installment_amount || 0) <= 0) return form.commitment_type === "arisan" ? "Setoran per bulan wajib diisi." : "Cicilan per bulan wajib diisi.";
  if (Number(form.total_installments || 0) <= 0) return form.commitment_type === "mortgage" ? "Total cicilan wajib diisi." : "Jumlah periode wajib diisi.";
  if (form.commitment_type === "mortgage" && !form.start_date) return "Tanggal pembayaran berikutnya wajib diisi.";
  return "";
};

const commitmentResourceGate = (resource) => {
  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat Kewajiban…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return null;
};

const highlightedCommitmentIdFromState = (state) => String(state?.planningCommitmentId || "");

const CommitmentsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const resource = useApiResource("commitments.list", {});
  const budgetResource = useApiResource("budgets.list", { period: currentMonthInJakarta() });
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const mutation = useGuardedMutation();
  const [edit, setEdit] = useState(null);
  const [stopTarget, setStopTarget] = useState(null);
  const [stopError, setStopError] = useState(null);
  const highlightedCommitmentId = highlightedCommitmentIdFromState(location.state);
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
  const closeEdit = () => { if (!mutation.busy) setEdit(null); };
  const reloadAll = async () => { invalidate(refreshKeys); await Promise.allSettled([resource.reload(), budgetResource.reload(), refreshOverview()]); };
  const createFlow = useCommitmentCreateFlow({ emptyForm, expenseCategories, location, mutation, navigate, notify, reloadAll, resourceStatus: resource.status, suggestedCategoryId, validateDetails: commitmentDetailsError });

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
  const collectionState = commitmentCollectionState(items);
  const cardProps = { onEdit: openEdit, onStop: (target) => { setStopError(null); setStopTarget(target); } };

  return <div className={styles.page}>
    <RefreshWarning error={resource.refreshError || budgetResource.error || budgetResource.refreshError} onRetry={() => Promise.allSettled([resource.reload(), budgetResource.reload()])} />
    <div className={styles.header}><div><h2>Kewajiban</h2></div>{collectionState !== "empty" ? <Button variant="primary" icon={FiPlus} onClick={createFlow.openCreate}>Tambah kewajiban</Button> : null}</div>
    {collectionState !== "empty" ? <>
      {activeItems.length > 1 ? <CommitmentSummary items={items} /> : null}
      {activeItems.length ? <section className={styles.grid}>{activeItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} highlighted={String(item.commitment_id) === highlightedCommitmentId} {...cardProps} />)}</section> : collectionState === "completed"
        ? <EmptyState icon={FiCheckCircle} title="Semua kewajiban selesai" description="Belum ada cicilan atau kewajiban aktif yang perlu dipantau." />
        : <EmptyState icon={FiArchive} title="Tidak ada kewajiban aktif" description="Kewajiban yang dihentikan tetap tersimpan sebagai histori. Tambahkan kewajiban jika ada cicilan atau pembayaran rutin baru." />}
      {completedItems.length ? <section className={styles.completed}><div className={styles.sectionHeading}><div><h3>Selesai</h3><p>Kewajiban yang sudah lunas tetap ringan dan tersimpan sebagai histori.</p></div><span>{completedItems.length}</span></div><div className={styles.grid}>{completedItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} compact highlighted={String(item.commitment_id) === highlightedCommitmentId} {...cardProps} />)}</div></section> : null}
    </> : <EmptyState icon={FiHome} title="Punya cicilan, KPR, pinjaman, atau Arisan?" description="Mulai dari sisa dan cicilan sekarang. Pembayaran lama tidak perlu dibuat ulang; jadwal berikutnya disiapkan otomatis." action={<Button variant="primary" icon={FiPlus} onClick={createFlow.openCreate}>Tambah kewajiban</Button>} />}

    {(createFlow.open || edit || stopTarget) ? <Suspense fallback={null}>
      <CommitmentDialogLayer
        createFlow={createFlow}
        mutation={mutation}
        accounts={accounts}
        categories={expenseCategories}
        budgets={budgets}
        edit={edit}
        setEdit={setEdit}
        closeEdit={closeEdit}
        submitEdit={submitEdit}
        stopTarget={stopTarget}
        stopError={stopError}
        setStopTarget={setStopTarget}
        submitStop={submitStop}
      />
    </Suspense> : null}
  </div>;
};

export default CommitmentsPage;
