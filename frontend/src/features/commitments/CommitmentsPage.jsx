import { useMemo, useState } from "react";
import { FiArchive, FiEdit2, FiHome, FiPlus, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PlanningNeedField from "../../components/common/PlanningNeedField.jsx";
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
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { planningNeedSelectionPatch } from "../../shared/workflows/planningBudgetLinks.js";
import { archiveCommitment, createCommitment, recordCommitmentReceipt, updateCommitment } from "./commitments.api.js";
import styles from "./CommitmentsPage.module.css";

const TYPES = [
  { value: "mortgage", label: "KPR", description: "Kredit rumah dengan sisa pokok" },
  { value: "installment", label: "Cicilan", description: "Kendaraan atau barang" },
  { value: "loan", label: "Pinjaman", description: "Pinjaman yang dilunasi bertahap" },
  { value: "arisan", label: "Arisan", description: "Setoran berkala dan penerimaan giliran" },
  { value: "other", label: "Lainnya", description: "Komitmen berkala lainnya" },
];
const FREQUENCIES = [
  { value: "monthly", label: "Bulanan" }, { value: "weekly", label: "Mingguan" }, { value: "biweekly", label: "Dua mingguan" },
  { value: "bimonthly", label: "Dua bulanan" }, { value: "quarterly", label: "Tiga bulanan" }, { value: "semiannual", label: "Semester" }, { value: "annual", label: "Tahunan" },
];
const PAYMENT_METHODS = [{ value: "transfer", label: "Transfer" }, { value: "cash", label: "Tunai" }, { value: "ewallet", label: "E-wallet" }];
const emptyForm = () => ({ commitment_type: "mortgage", name: "", provider: "", original_amount: "", current_balance: "", installment_amount: "", total_installments: "", installments_paid: "0", default_account_id: "", category_id: "", budget_id: "", frequency: "monthly", due_day: "10", payment_method: "transfer", start_date: todayInJakarta(), end_date: "", notes: "" });
const emptyReceipt = () => ({ item: null, amount: "", account_id: "", category_id: "", transaction_date: todayInJakarta(), payment_method: "transfer", note: "" });
const refreshKeys = ["commitments.list", "recurring.list", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "app.initialState"];
const typeLabel = (type) => TYPES.find((item) => item.value === type)?.label || "Komitmen";

const ProgressBar = ({ value }) => <div className={styles.progress} aria-label={`Progress ${value}%`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;

const CommitmentSummary = ({ items }) => {
  const active = items.filter((item) => item.status === "active");
  const debts = active.filter((item) => item.commitment_type !== "arisan");
  const remaining = debts.reduce((sum, item) => sum + Number(item.current_balance || 0), 0);
  const monthly = active.filter((item) => item.frequency === "monthly").reduce((sum, item) => sum + Number(item.installment_amount || 0), 0);
  return <section className={styles.summary}>
    <div><span>Kewajiban tersisa</span><strong>{formatRupiah(remaining)}</strong><small>Tidak termasuk sisa setoran Arisan</small></div>
    <div><span>Komitmen aktif</span><strong>{active.length}</strong><small>{monthly ? `${formatRupiah(monthly)} jadwal bulanan` : "Belum ada jadwal bulanan"}</small></div>
  </section>;
};

const CommitmentMeta = ({ item, arisan }) => <dl className={styles.meta}>
  <div><dt>{arisan ? "Setoran" : "Cicilan"}</dt><dd>{formatRupiah(item.installment_amount || 0)}</dd></div>
  <div><dt>Jatuh tempo</dt><dd>Tanggal {item.due_day}</dd></div>
  <div><dt>Dari</dt><dd>{item.account_name || "Rekening"}</dd></div>
  {Number(item.total_installments || 0) ? <div><dt>Periode</dt><dd>{item.installments_paid}/{item.total_installments}</dd></div> : null}
  {arisan && Number(item.received_amount || 0) > 0 ? <div><dt>Sudah diterima</dt><dd>{formatRupiah(item.received_amount)}</dd></div> : null}
</dl>;

const CommitmentActions = ({ item, arisan, onEdit, onArchive, onReceipt }) => <div className={styles.actions}>
  {arisan && item.can_record_receipt ? <Button variant="primary" onClick={() => onReceipt(item)}>Catat penerimaan</Button> : null}
  {item.can_manage && item.status === "active" ? <Button icon={FiEdit2} onClick={() => onEdit(item)}>Edit</Button> : null}
  {item.can_archive ? <Button icon={FiArchive} onClick={() => onArchive(item)}>Arsipkan</Button> : null}
</div>;

const CommitmentCard = ({ item, onEdit, onArchive, onReceipt }) => {
  const arisan = item.commitment_type === "arisan";
  const completed = item.status === "completed";
  const progress = Number(item.progress_percent || 0);
  return <article className={styles.card}>
    <div className={styles.cardIcon}>{arisan ? <FiUsers aria-hidden="true" /> : <FiHome aria-hidden="true" />}</div>
    <div className={styles.cardTitle}><span>{typeLabel(item.commitment_type)}{item.provider ? ` · ${item.provider}` : ""}</span><h3>{item.name}</h3></div>
    <div className={styles.amountBlock}><span>{arisan ? "Sisa setoran" : "Sisa kewajiban"}</span><strong>{formatRupiah(item.current_balance || 0)}</strong><small>{completed ? "Selesai" : `${progress}% selesai`}</small></div>
    <ProgressBar value={progress} />
    <CommitmentMeta item={item} arisan={arisan} />
    {item.balance_needs_update ? <CompactNotice tone="info" title="Sisa pokok perlu diperbarui">Pembayaran terakhir sudah tercatat, tetapi saldo pokok belum diisi. Perbarui saat mencatat pembayaran berikutnya dari Jadwal Rutin.</CompactNotice> : null}
    <CommitmentActions item={item} arisan={arisan} onEdit={onEdit} onArchive={onArchive} onReceipt={onReceipt} />
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

const CommitmentForm = ({ form, setForm, accounts, categories, budgets, error, editing = false }) => {
  const arisan = form.commitment_type === "arisan";
  return <div className="form-grid">
    {!editing ? <SelectionField className="form-grid__full" label="Jenis Komitmen" value={form.commitment_type} onChange={(commitment_type) => setForm((current) => ({ ...emptyForm(), commitment_type, start_date: current.start_date }))} options={TYPES} /> : null}
    <label className="field form-grid__full"><span>{arisan ? "Nama arisan" : "Nama kewajiban"} *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={arisan ? "Contoh: Arisan Keluarga" : "Contoh: KPR Rumah"} /></label>
    <label className="field"><span>{arisan ? "Grup/penyelenggara" : "Bank/Penyedia"}</span><input maxLength="100" value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value }))} placeholder={arisan ? "Keluarga" : "BTN"} /></label>
    {!editing ? <MoneyInput id="commitment-original" label={arisan ? "Total yang akan diterima" : "Pinjaman/nilai awal"} value={form.original_amount} onChange={(original_amount) => setForm((current) => ({ ...current, original_amount }))} required={!arisan} /> : null}
    {!editing ? <MoneyInput id="commitment-balance" label={arisan ? "Sisa setoran saat ini" : "Sisa pokok saat ini"} value={form.current_balance} onChange={(current_balance) => setForm((current) => ({ ...current, current_balance }))} /> : null}
    <MoneyInput id="commitment-installment" label={arisan ? "Setoran" : "Cicilan"} value={form.installment_amount} onChange={(installment_amount) => setForm((current) => ({ ...current, installment_amount }))} required />
    <label className="field"><span>Jumlah periode{arisan ? " *" : ""}</span><input type="number" min={arisan ? "1" : "0"} required={arisan} value={form.total_installments} onChange={(event) => setForm((current) => ({ ...current, total_installments: event.target.value }))} placeholder="Opsional" /></label>
    {!editing ? <label className="field"><span>{arisan ? "Sudah dibayar berapa kali" : "Sudah dibayar"}</span><input type="number" min="0" value={form.installments_paid} onChange={(event) => setForm((current) => ({ ...current, installments_paid: event.target.value }))} /></label> : null}
    <label className="field"><span>Tanggal bayar *</span><input type="number" min="1" max="31" required value={form.due_day} onChange={(event) => setForm((current) => ({ ...current, due_day: event.target.value }))} /></label>
    <AccountPicker value={form.default_account_id} accounts={accounts} onChange={(default_account_id) => setForm((current) => planningPatch(current, budgets, { default_account_id }))} />
    <CategoryPicker value={form.category_id} categories={categories} onChange={(category_id) => setForm((current) => planningPatch(current, budgets, { category_id }))} />
    <PlanningNeedField budgets={budgets} categoryId={form.category_id} accountId={form.default_account_id} budgetId={form.budget_id} onSelect={(budget) => setForm((current) => ({ ...current, budget_id: budget?.budget_id || "", default_account_id: budget?.envelope_source_account_id || current.default_account_id }))} standaloneLabel="Bayar sebagai kewajiban mandiri" />
    <details className="form-grid__full"><summary>Detail tambahan</summary><div className="form-grid">
      <SelectionField label="Frekuensi" value={form.frequency} onChange={(frequency) => setForm((current) => ({ ...current, frequency }))} options={FREQUENCIES} />
      <SelectionField label="Metode pembayaran" value={form.payment_method} onChange={(payment_method) => setForm((current) => ({ ...current, payment_method }))} options={PAYMENT_METHODS} />
      <label className="field"><span>Tanggal mulai *</span><TemporalInput type="date" required value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} /></label>
      <label className="field"><span>Tanggal akhir</span><TemporalInput type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} /></label>
      <label className="field form-grid__full"><span>Catatan</span><textarea rows="2" maxLength="500" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
    </div></details>
    {error ? <div className="notice notice--danger form-grid__full" role="alert">{error.message}</div> : null}
  </div>;
};

const receiptDraft = (receipt) => ({ amount: receipt.amount, account_id: receipt.account_id, category_id: receipt.category_id, transaction_date: receipt.transaction_date, payment_method: receipt.payment_method, note: receipt.note });

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
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveError, setArchiveError] = useState(null);
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
    await createCommitment({ ...form, budget_id: form.budget_id || null, auto_debit: false, original_amount: form.original_amount ? assertPositiveRupiah(form.original_amount) : undefined, current_balance: form.current_balance === "" ? undefined : Number(form.current_balance), installment_amount: assertPositiveRupiah(form.installment_amount), total_installments: Number(form.total_installments || 0), installments_paid: Number(form.installments_paid || 0), due_day: Number(form.due_day) });
    setCreateOpen(false); setForm(emptyForm()); notify({ message: `${form.name || "Komitmen"} berhasil dibuat. Jadwal pembayaran berikutnya sudah disiapkan.`, tone: "success", dedupeKey: "commitments:create" }); await reloadAll();
  }).catch(() => undefined); };
  const openEdit = (item) => { mutation.reset(); setEdit({ ...item, budget_id: item.budget_id || "", installment_amount: String(item.installment_amount || ""), total_installments: String(item.total_installments || ""), due_day: String(item.due_day || 1), payment_method: item.payment_method === "autodebit" ? "transfer" : (item.payment_method || "transfer") }); };
  const submitEdit = (event) => { event.preventDefault(); if (!edit) return; return mutation.run(async () => {
    await updateCommitment({ commitment_id: edit.commitment_id, row_version: edit.row_version, name: edit.name, provider: edit.provider, installment_amount: assertPositiveRupiah(edit.installment_amount), total_installments: Number(edit.total_installments || 0), default_account_id: edit.default_account_id, category_id: edit.category_id, budget_id: edit.budget_id || null, frequency: edit.frequency, due_day: Number(edit.due_day), payment_method: edit.payment_method || "transfer", auto_debit: false, start_date: edit.start_date, end_date: edit.end_date || "", notes: edit.notes || "" }, { rowVersion: edit.row_version });
    setEdit(null); notify({ message: `${edit.name || "Komitmen"} diperbarui. Jadwal berikutnya ikut menyesuaikan.`, tone: "success", dedupeKey: "commitments:update" }); await reloadAll();
  }).catch(() => undefined); };
  const submitReceipt = (event) => { event.preventDefault(); if (!receipt.item) return; return mutation.run(async () => {
    await recordCommitmentReceipt({ commitment_id: receipt.item.commitment_id, row_version: receipt.item.row_version, amount: assertPositiveRupiah(receipt.amount), account_id: receipt.account_id, category_id: receipt.category_id, transaction_date: receipt.transaction_date, payment_method: receipt.payment_method, note: receipt.note }, { rowVersion: receipt.item.row_version });
    setReceipt(emptyReceipt()); notify({ message: `${formatRupiah(receipt.amount)} penerimaan Arisan berhasil dicatat.`, tone: "success", dedupeKey: "commitments:receipt" }); await reloadAll();
  }).catch(() => undefined); };
  const submitArchive = async (reason) => { if (!archiveTarget) return; setArchiveError(null); try { await mutation.run(() => archiveCommitment({ commitment_id: archiveTarget.commitment_id, row_version: archiveTarget.row_version, reason }, { rowVersion: archiveTarget.row_version })); setArchiveTarget(null); notify({ message: "Komitmen dan jadwal masa depannya berhasil diarsipkan.", tone: "success", dedupeKey: "commitments:archive" }); await reloadAll(); } catch (error) { setArchiveError(error); } };

  if (resource.status === "loading") return <NativePageSkeleton kind="planning" label="Memuat Komitmen…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const items = resource.data?.items || [];
  return <div className={styles.page}>
    <RefreshWarning error={resource.refreshError || budgetResource.refreshError} onRetry={() => Promise.allSettled([resource.reload(), budgetResource.reload()])} />
    <div className={styles.header}><div><h2>Komitmen</h2><p>Pantau KPR, cicilan, pinjaman, dan Arisan sampai selesai. Target tetap digunakan untuk uang yang sedang dikumpulkan.</p></div><Button variant="primary" icon={FiPlus} onClick={() => { mutation.reset(); setForm(emptyForm()); setCreateOpen(true); }}>Tambah kewajiban</Button></div>
    {items.length ? <><CommitmentSummary items={items} /><section className={styles.grid}>{items.map((item) => <CommitmentCard key={item.commitment_id} item={item} onEdit={openEdit} onArchive={(target) => { setArchiveError(null); setArchiveTarget(target); }} onReceipt={(target) => { mutation.reset(); setReceipt({ ...emptyReceipt(), item: target, amount: String(Math.max(0, Number(target.original_amount || 0) - Number(target.received_amount || 0)) || ""), account_id: target.default_account_id || "" }); }} />)}</section></> : <EmptyState icon={FiHome} title="Punya cicilan, KPR, pinjaman, atau Arisan?" description="Catat kewajiban sekali. Jadwal pembayarannya akan muncul otomatis dan progresnya dipantau sampai selesai." action={<Button variant="primary" icon={FiPlus} onClick={() => { mutation.reset(); setForm(emptyForm()); setCreateOpen(true); }}>Tambah kewajiban</Button>} />}

    <Modal open={createOpen} onClose={createGuard.requestClose} discardGuard={createGuard} discardSubject="Komitmen baru" dismissible={!mutation.busy} title="Tambah kewajiban" description="Masukkan kewajiban sekali. Jadwal pembayarannya akan dibuat otomatis." footer={<><Button disabled={mutation.busy} onClick={createGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-create-form" loading={mutation.busy}>Simpan Komitmen</Button></>}><form id="commitment-create-form" onSubmit={submitCreate}><CommitmentForm form={form} setForm={setForm} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} /></form></Modal>
    <Modal open={Boolean(edit)} onClose={editGuard.requestClose} discardGuard={editGuard} discardSubject="perubahan Komitmen" dismissible={!mutation.busy} title="Edit Komitmen" description="Perubahan jadwal diterapkan ke pembayaran berikutnya." footer={<><Button disabled={mutation.busy} onClick={editGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-edit-form" loading={mutation.busy}>Simpan perubahan</Button></>}><form id="commitment-edit-form" onSubmit={submitEdit}>{edit ? <CommitmentForm form={edit} setForm={setEdit} accounts={accounts} categories={expenseCategories} budgets={budgets} error={mutation.error} editing /> : null}</form></Modal>
    <Modal open={Boolean(receipt.item)} onClose={receiptGuard.requestClose} discardGuard={receiptGuard} discardSubject="penerimaan Arisan" dismissible={!mutation.busy} title="Catat penerimaan Arisan" description={receipt.item ? receipt.item.name : ""} footer={<><Button disabled={mutation.busy} onClick={receiptGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-receipt-form" loading={mutation.busy}>Catat penerimaan</Button></>}><form id="commitment-receipt-form" className="form-grid" onSubmit={submitReceipt}><MoneyInput id="commitment-receipt-amount" label="Nominal diterima" value={receipt.amount} onChange={(amount) => setReceipt((current) => ({ ...current, amount }))} required /><AccountPicker label="Masuk ke" value={receipt.account_id} accounts={accounts} onChange={(account_id) => setReceipt((current) => ({ ...current, account_id }))} /><CategoryPicker label="Kategori penerimaan" value={receipt.category_id} categories={incomeCategories} onChange={(category_id) => setReceipt((current) => ({ ...current, category_id }))} /><label className="field"><span>Tanggal diterima *</span><TemporalInput required type="date" value={receipt.transaction_date} onChange={(event) => setReceipt((current) => ({ ...current, transaction_date: event.target.value }))} /></label>{mutation.error ? <div className="notice notice--danger form-grid__full" role="alert">{mutation.error.message}</div> : null}</form></Modal>
    <ConfirmationModal open={Boolean(archiveTarget)} title="Arsipkan Komitmen?" description={archiveTarget ? `${archiveTarget.name} tidak lagi muncul sebagai Komitmen aktif. Jadwal Rutin masa depan juga dihentikan, sementara histori pembayaran tetap disimpan.` : ""} confirmLabel="Arsipkan" reasonLabel="Alasan pengarsipan" requireReason busy={mutation.busy} error={archiveError} onCancel={() => !mutation.busy && setArchiveTarget(null)} onConfirm={submitArchive} />
  </div>;
};

export default CommitmentsPage;
