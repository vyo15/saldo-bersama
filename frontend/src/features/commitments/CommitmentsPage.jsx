import { useMemo, useState } from "react";
import { FiArchive, FiCheckCircle, FiEdit2, FiHome, FiPlus, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
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
import { archiveCommitment, createCommitment, recordCommitmentReceipt, updateCommitment } from "./commitments.api.js";
import { applyFlatEstimate, flatLoanEstimate, inferFlatAnnualRate, isDebtCommitment } from "./commitmentModel.js";
import styles from "./CommitmentsPage.module.css";

const TYPES = [
  { value: "mortgage", label: "KPR", description: "Kredit rumah yang dilunasi bertahap" },
  { value: "installment", label: "Cicilan", description: "Kendaraan atau barang" },
  { value: "loan", label: "Pinjaman", description: "Bank, koperasi, atau pribadi" },
  { value: "arisan", label: "Arisan", description: "Setoran berkala sampai selesai" },
  { value: "other", label: "Lainnya", description: "Kewajiban berkala lainnya" },
];
const emptyForm = () => ({ commitment_type: "mortgage", name: "", provider: "", original_amount: "", current_balance: "", installment_amount: "", total_installments: "", flat_interest_rate: "0", default_account_id: "", category_id: "", budget_id: "", due_day: "10" });
const emptyReceipt = () => ({ item: null, amount: "", account_id: "", category_id: "", transaction_date: todayInJakarta() });
const refreshKeys = ["commitments.list", "recurring.list", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "app.initialState"];
const typeLabel = (type) => TYPES.find((item) => item.value === type)?.label || "Kewajiban";

const ProgressBar = ({ value }) => <div className={styles.progress} aria-label={`Progress ${value}%`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;

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

const CommitmentMeta = ({ item, arisan }) => <dl className={styles.meta}>
  <div><dt>{arisan ? "Setoran" : "Cicilan"}</dt><dd>{formatRupiah(item.installment_amount || 0)} / bulan</dd></div>
  <div><dt>Berikutnya</dt><dd>{nextDueLabel(item)}</dd></div>
  <div><dt>Dibayar dari</dt><dd>{item.account_name || "Rekening"}</dd></div>
  {item.budget_id ? <div><dt>Pembayaran</dt><dd>Otomatis dari Alokasi</dd></div> : null}
  {!arisan && Number(item.flat_principal_amount || 0) > 0 ? <div><dt>Pokok + bunga/biaya</dt><dd>{formatRupiah(item.flat_principal_amount)} + {formatRupiah(item.flat_interest_amount || 0)}</dd></div> : null}
  {arisan && Number(item.received_amount || 0) > 0 ? <div><dt>Sudah diterima</dt><dd>{formatRupiah(item.received_amount)}</dd></div> : null}
</dl>;

const CommitmentActions = ({ item, arisan, onEdit, onStop, onReceipt }) => <div className={styles.actions}>
  {arisan && item.can_record_receipt ? <Button variant="primary" onClick={() => onReceipt(item)}>Catat penerimaan</Button> : null}
  {item.can_manage && item.status === "active" ? <Button icon={FiEdit2} onClick={() => onEdit(item)}>Edit</Button> : null}
  {item.can_delete ? <Button icon={FiArchive} variant="danger" onClick={() => onStop(item)}>Hentikan</Button> : null}
</div>;

const CommitmentCard = ({ item, onEdit, onStop, onReceipt, compact = false }) => {
  const arisan = item.commitment_type === "arisan";
  const completed = item.status === "completed";
  const progress = Number(item.progress_percent || 0);
  return <article className={`${styles.card}${compact ? ` ${styles.cardCompact}` : ""}`}>
    <div className={styles.cardIcon}>{completed ? <FiCheckCircle aria-hidden="true" /> : arisan ? <FiUsers aria-hidden="true" /> : <FiHome aria-hidden="true" />}</div>
    <div className={styles.cardTitle}><span>{typeLabel(item.commitment_type)}{item.provider ? ` · ${item.provider}` : ""}</span><h3>{item.name}</h3></div>
    <div className={styles.amountBlock}><span>{arisan ? "Sisa setoran" : "Sisa pokok"}</span><strong>{formatRupiah(item.current_balance || 0)}</strong><small>{completed ? "Lunas / selesai" : `${progress}% selesai`}</small></div>
    <ProgressBar value={completed ? 100 : progress} />
    {!compact ? <CommitmentMeta item={item} arisan={arisan} /> : null}
    {item.balance_needs_update ? <CompactNotice tone="info" title="Sisa pokok belum pasti">Pembayaran sebelumnya belum memiliki rincian pokok. Periksa kembali sebelum pembayaran berikutnya.</CompactNotice> : null}
    <CommitmentActions item={item} arisan={arisan} onEdit={onEdit} onStop={onStop} onReceipt={onReceipt} />
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

const CommitmentForm = ({ form, setForm, accounts, categories, budgets, error, editing = false }) => {
  const arisan = form.commitment_type === "arisan";
  const debt = isDebtCommitment(form.commitment_type);
  const setEstimated = (patch) => setForm((current) => applyFlatEstimate(current, patch));
  return <div className="form-grid">
    {!editing ? <SelectionField className="form-grid__full" label="Jenis kewajiban" value={form.commitment_type} onChange={(commitment_type) => setForm({ ...emptyForm(), commitment_type })} options={TYPES} /> : null}
    <label className="field form-grid__full"><span>{arisan ? "Nama arisan" : "Nama kewajiban"} *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={arisan ? "Contoh: Arisan Keluarga" : "Contoh: KPR Rumah"} /></label>
    <label className="field form-grid__full"><span>{arisan ? "Grup/penyelenggara" : "Bank/Penyedia"}</span><input maxLength="100" value={form.provider || ""} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder={arisan ? "Keluarga" : "BTN"} /></label>
    {debt && !editing ? <MoneyInput id="commitment-original" label="Pinjaman / nilai awal" value={form.original_amount} onChange={(original_amount) => setEstimated({ original_amount })} required /> : null}
    {!editing ? <MoneyInput id="commitment-balance" label={arisan ? "Sisa setoran sekarang" : "Sisa pokok sekarang"} value={form.current_balance} onChange={(current_balance) => setForm((current) => ({ ...current, current_balance }))} /> : null}
    <label className="field"><span>{arisan ? "Jumlah setoran" : "Tenor"} (bulan) *</span><input type="number" min="1" required value={form.total_installments} onChange={(event) => arisan ? setForm((current) => ({ ...current, total_installments: event.target.value })) : setEstimated({ total_installments: event.target.value })} placeholder="Contoh: 120" /></label>
    {debt ? <FlatInterestField form={form} setForm={setForm} /> : null}
    <MoneyInput id="commitment-installment" label={arisan ? "Setoran per bulan" : "Cicilan per bulan"} value={form.installment_amount} onChange={(installment_amount) => setForm((current) => ({ ...current, installment_amount }))} required />
    <label className="field"><span>Bayar setiap tanggal *</span><input type="number" min="1" max="31" required value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: event.target.value }))} /></label>
    <AccountPicker value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => planningPatch(current, budgets, { default_account_id }))} />
    <CategoryPicker value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => planningPatch(current, budgets, { category_id }))} />
    {form.budget_id ? <CompactNotice className="form-grid__full" tone="success" title="Pembayaran otomatis aktif">Dana akan dibayar dari Alokasi saat jatuh tempo jika mencukupi.</CompactNotice> : null}
    {editing && debt ? <CompactNotice className="form-grid__full" tone="info">Nilai awal dan sisa pokok tidak diubah dari form ini agar histori pembayaran tetap konsisten.</CompactNotice> : null}
    {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
  </div>;
};

const receiptDraft = (receipt) => ({ amount: receipt.amount, account_id: receipt.account_id, category_id: receipt.category_id, transaction_date: receipt.transaction_date });

const commitmentResourceGate = (resource) => {
  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat Kewajiban…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return null;
};

const CommitmentsPage = () => {
  const resource = useApiResource("commitments.list", {});
  const budgetResource = useApiResource("budgets.list", { period: currentMonthInJakarta() });
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const mutation = useGuardedMutation();
  const [form, setForm] = useState(emptyForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [receipt, setReceipt] = useState(emptyReceipt);
  const [stopTarget, setStopTarget] = useState(null);
  const [stopError, setStopError] = useState(null);
  const accounts = useMemo(() => (bootstrap?.accounts || []).filter((item) => item.status === "active" && item.account_type !== "investment").map((item) => ({ ...item, ...(overview?.accountBalances || []).find((row) => row.account_id === item.account_id) })), [bootstrap?.accounts, overview?.accountBalances]);
  const expenseCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"), [bootstrap?.categories]);
  const incomeCategories = useMemo(() => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "income"), [bootstrap?.categories]);
  const budgets = useMemo(() => (budgetResource.data?.items || []).filter((item) => item.can_manage !== false), [budgetResource.data?.items]);
  const closeCreate = () => { if (!mutation.busy) setCreateOpen(false); };
  const closeEdit = () => { if (!mutation.busy) setEdit(null); };
  const closeReceipt = () => { if (!mutation.busy) setReceipt(emptyReceipt()); };
  const createGuard = useUnsavedChangesGuard({ open: createOpen, value: form, onClose: closeCreate, blocked: mutation.busy });
  const editGuard = useUnsavedChangesGuard({ open: Boolean(edit), value: edit, onClose: closeEdit, blocked: mutation.busy });
  const receiptGuard = useUnsavedChangesGuard({ open: Boolean(receipt.item), value: receiptDraft(receipt), onClose: closeReceipt, blocked: mutation.busy });
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
      default_account_id: form.default_account_id,
      category_id: form.category_id,
      budget_id: form.budget_id || null,
      frequency: "monthly",
      due_day: Number(form.due_day),
      payment_method: "transfer",
    });
    const name = form.name || "Kewajiban";
    setCreateOpen(false); setForm(emptyForm()); notify({ message: `${name} berhasil dibuat. Jadwal pembayaran berikutnya sudah disiapkan.`, tone: "success", dedupeKey: "commitments:create" }); await reloadAll();
  }).catch(() => undefined); };

  const openEdit = (item) => {
    mutation.reset();
    const inferredRate = inferFlatAnnualRate({ originalAmount: item.original_amount, totalInstallments: item.total_installments, installmentAmount: item.installment_amount });
    setEdit({ ...item, budget_id: item.budget_id || "", installment_amount: String(item.installment_amount || ""), total_installments: String(item.total_installments || ""), due_day: String(item.due_day || 1), original_amount: String(item.original_amount || ""), current_balance: String(item.current_balance || ""), flat_interest_rate: String(Number(inferredRate.toFixed(4))) });
  };

  const submitEdit = (event) => { event.preventDefault(); if (!edit) return; return mutation.run(async () => {
    await updateCommitment({ commitment_id: edit.commitment_id, row_version: edit.row_version, name: edit.name, provider: edit.provider, installment_amount: assertPositiveRupiah(edit.installment_amount), total_installments: Number(edit.total_installments), default_account_id: edit.default_account_id, category_id: edit.category_id, budget_id: edit.budget_id || null, frequency: "monthly", due_day: Number(edit.due_day), payment_method: "transfer" }, { rowVersion: edit.row_version });
    const name = edit.name || "Kewajiban";
    setEdit(null); notify({ message: `${name} diperbarui. Jadwal berikutnya ikut menyesuaikan.`, tone: "success", dedupeKey: "commitments:update" }); await reloadAll();
  }).catch(() => undefined); };

  const submitReceipt = (event) => { event.preventDefault(); if (!receipt.item) return; return mutation.run(async () => {
    await recordCommitmentReceipt({ commitment_id: receipt.item.commitment_id, row_version: receipt.item.row_version, amount: assertPositiveRupiah(receipt.amount), account_id: receipt.account_id, category_id: receipt.category_id, transaction_date: receipt.transaction_date, payment_method: "transfer" }, { rowVersion: receipt.item.row_version });
    setReceipt(emptyReceipt()); notify({ message: `${formatRupiah(receipt.amount)} penerimaan Arisan berhasil dicatat.`, tone: "success", dedupeKey: "commitments:receipt" }); await reloadAll();
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
  const openCreate = () => { mutation.reset(); setForm(emptyForm()); setCreateOpen(true); };
  const cardProps = { onEdit: openEdit, onStop: (target) => { setStopError(null); setStopTarget(target); }, onReceipt: (target) => { mutation.reset(); setReceipt({ ...emptyReceipt(), item: target, amount: String(Math.max(0, Number(target.original_amount || 0) - Number(target.received_amount || 0)) || ""), account_id: target.default_account_id || "" }); } };

  return <div className={styles.page}>
    <RefreshWarning error={resource.refreshError || budgetResource.refreshError} onRetry={() => Promise.allSettled([resource.reload(), budgetResource.reload()])} />
    <div className={styles.header}><div><h2>Cicilan &amp; Kewajiban</h2><p>{items.length ? "Pantau sisa, jatuh tempo, dan pembayaran kewajiban yang masih berjalan." : "Catat kewajiban yang masih berjalan dari kondisi sekarang."}</p></div>{items.length ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Tambah kewajiban</Button> : null}</div>
    {items.length ? <>
      <CommitmentSummary items={items} />
      {activeItems.length ? <section className={styles.grid}>{activeItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} {...cardProps} />)}</section> : <EmptyState icon={FiCheckCircle} title="Semua kewajiban selesai" description="Belum ada cicilan atau kewajiban aktif yang perlu dipantau." />}
      {completedItems.length ? <section className={styles.completed}><div className={styles.sectionHeading}><div><h3>Selesai</h3><p>Kewajiban yang sudah lunas tetap ringan dan tersimpan sebagai histori.</p></div><span>{completedItems.length}</span></div><div className={styles.grid}>{completedItems.map((item) => <CommitmentCard key={item.commitment_id} item={item} compact {...cardProps} />)}</div></section> : null}
    </> : <EmptyState icon={FiHome} title="Punya cicilan, KPR, pinjaman, atau Arisan?" description="Mulai dari sisa dan cicilan sekarang. Pembayaran lama tidak perlu dibuat ulang; jadwal berikutnya disiapkan otomatis." action={<Button variant="primary" icon={FiPlus} onClick={openCreate}>Tambah kewajiban</Button>} />}

    <Modal open={createOpen} onClose={createGuard.requestClose} discardGuard={createGuard} discardSubject="kewajiban baru" dismissible={!mutation.busy} title="Tambah kewajiban" footer={<><Button disabled={mutation.busy} onClick={createGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-create-form" loading={mutation.busy}>Simpan {typeLabel(form.commitment_type)}</Button></>}><form id="commitment-create-form" onSubmit={submitCreate}><CommitmentForm form={form} setForm={setForm} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} /></form></Modal>
    <Modal open={Boolean(edit)} onClose={editGuard.requestClose} discardGuard={editGuard} discardSubject="perubahan kewajiban" dismissible={!mutation.busy} title={edit ? `Edit ${typeLabel(edit.commitment_type)}` : "Edit kewajiban"} description="Perubahan berlaku untuk jadwal berikutnya tanpa mengubah histori pembayaran." footer={<><Button disabled={mutation.busy} onClick={editGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-edit-form" loading={mutation.busy}>Simpan perubahan</Button></>}><form id="commitment-edit-form" onSubmit={submitEdit}>{edit ? <CommitmentForm form={edit} setForm={setEdit} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} editing /> : null}</form></Modal>
    <Modal open={Boolean(receipt.item)} onClose={receiptGuard.requestClose} discardGuard={receiptGuard} discardSubject="penerimaan Arisan" dismissible={!mutation.busy} title="Catat penerimaan Arisan" description={receipt.item ? receipt.item.name : ""} footer={<><Button disabled={mutation.busy} onClick={receiptGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-receipt-form" loading={mutation.busy}>Catat penerimaan</Button></>}><form id="commitment-receipt-form" className="form-grid" onSubmit={submitReceipt}><MoneyInput id="commitment-receipt-amount" label="Nominal diterima" value={receipt.amount} onChange={(amount) => setReceipt((current) => ({ ...current, amount }))} required /><AccountPicker label="Masuk ke" value={receipt.account_id} accounts={accounts} onChange={(account_id) => setReceipt((current) => ({ ...current, account_id }))} /><CategoryPicker label="Kategori penerimaan" value={receipt.category_id} categories={incomeCategories} onChange={(category_id) => setReceipt((current) => ({ ...current, category_id }))} /><label className="field"><span>Tanggal diterima *</span><TemporalInput required type="date" value={receipt.transaction_date} onChange={(event) => setReceipt((current) => ({ ...current, transaction_date: event.target.value }))} /></label>{mutation.error ? <div className="notice notice--danger form-grid__full" role="alert">{mutation.error.message}</div> : null}</form></Modal>
    <ConfirmationModal open={Boolean(stopTarget)} title="Hentikan kewajiban?" description={stopTarget ? `${stopTarget.name} tidak lagi aktif dan jadwal berikutnya dihentikan. Transaksi yang sudah tercatat tetap disimpan agar saldo dan laporan tetap benar.` : ""} confirmLabel="Hentikan kewajiban" busy={mutation.busy} error={stopError} onCancel={() => !mutation.busy && setStopTarget(null)} onConfirm={submitStop} />
  </div>;
};

export default CommitmentsPage;
