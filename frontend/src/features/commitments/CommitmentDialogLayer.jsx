import { FiChevronRight, FiHome, FiMoreHorizontal, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import { accountOptionVisual, categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { AccountIcon, BalanceIcon, MoneyOutIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { planningNeedSelectionPatch } from "../../shared/workflows/planningBudgetLinks.js";
import { applyFlatEstimate, flatLoanEstimate, isDebtCommitment } from "./commitmentModel.js";
import styles from "./CommitmentsPage.module.css";

const TYPES = [
  { value: "mortgage", label: "KPR", description: "Kredit rumah yang dilunasi bertahap" },
  { value: "installment", label: "Cicilan", description: "Kendaraan atau barang" },
  { value: "loan", label: "Pinjaman", description: "Bank, koperasi, atau pribadi" },
  { value: "arisan", label: "Arisan", description: "Setoran berkala sampai selesai" },
  { value: "other", label: "Lainnya", description: "Kewajiban berkala lainnya" },
];
const TYPE_ICONS = Object.freeze({ mortgage: FiHome, installment: BalanceIcon, loan: MoneyOutIcon, arisan: FiUsers, other: FiMoreHorizontal });
const typeLabel = (type) => TYPES.find((item) => item.value === type)?.label || "Kewajiban";

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
      <ProgressBar value={percent} max={100} label="Progress cicilan" showValue={false} compact />
    </div>
    <div className={styles.mortgageProgressInputs}>
      {!editing ? <input aria-label="Cicilan berikutnya" type="number" min="1" inputMode="numeric" value={form.next_installment || ""} onChange={(event) => updateNext(event.target.value)} placeholder="9" /> : <span>{Math.min(total || paid + 1, paid + 1)}</span>}
      <b>/</b>
      <input aria-label="Total cicilan" type="number" min="1" inputMode="numeric" required value={form.total_installments} onChange={(event) => setForm((current) => ({ ...current, total_installments: event.target.value }))} placeholder="180" />
    </div>
  </div>;
};

const CommitmentIdentityFields = ({ form, setForm, arisan }) => <>
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

const CommitmentForm = ({ form, setForm, accounts, categories, budgets, error, editing = false, section = "all" }) => {
  const arisan = form.commitment_type === "arisan";
  const debt = isDebtCommitment(form.commitment_type);
  const mortgage = form.commitment_type === "mortgage";
  const setEstimated = (patch) => setForm((current) => applyFlatEstimate(current, patch));
  const showDetails = section !== "payment";
  const showPayment = section !== "details";
  return <div className="form-grid">
    {showDetails ? <>
      <CommitmentIdentityFields form={form} setForm={setForm} arisan={arisan} />
      <CommitmentPrincipalFields form={form} setForm={setForm} editing={editing} arisan={arisan} debt={debt} mortgage={mortgage} setEstimated={setEstimated} />
      <CommitmentTenorFields form={form} setForm={setForm} editing={editing} arisan={arisan} debt={debt} mortgage={mortgage} setEstimated={setEstimated} />
      <CommitmentDueField form={form} setForm={setForm} editing={editing} mortgage={mortgage} />
    </> : null}
    {showPayment ? <>
      <CommitmentPlanningFields form={form} setForm={setForm} accounts={accounts} categories={categories} budgets={budgets} />
      {mortgage ? <MortgageDetails form={form} setForm={setForm} /> : null}
      <CommitmentFormNotices editing={editing} debt={debt} error={error} />
    </> : null}
  </div>;
};


const CommitmentTypeChooser = ({ onSelect }) => <div className={styles.typeList}>
  {TYPES.map((item) => {
    const Icon = TYPE_ICONS[item.value] || FiMoreHorizontal;
    return <button type="button" className={styles.typeOption} key={item.value} onClick={() => onSelect(item.value)}>
      <span className={styles.typeOptionIcon}><Icon aria-hidden="true" /></span>
      <span className={styles.typeOptionCopy}><strong>{item.label}</strong><small>{item.description}</small></span>
      <FiChevronRight className={styles.typeOptionArrow} aria-hidden="true" />
    </button>;
  })}
</div>;

const createModalFooter = ({ stage, busy, retryOnly, guard, setStage, type }) => {
  if (stage === "type") return <Button disabled={busy || retryOnly} onClick={guard.discardAndClose}>Batal</Button>;
  if (stage === "details") return <><Button disabled={busy || retryOnly} onClick={guard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-create-details-form" disabled={retryOnly}>Lanjut</Button></>;
  return <><Button disabled={busy || retryOnly} onClick={() => setStage("details")}>Kembali</Button><Button variant="primary" type="submit" form="commitment-create-form" loading={busy}>{retryOnly ? "Coba lagi data yang sama" : `Simpan ${typeLabel(type)}`}</Button></>;
};

const CommitmentCreateModal = ({ flow, mutation, accounts, categories, budgets }) => {
  const { form, setForm, open, stage, stepError, guard, selectType, continueDetails, submit, setStage, setStepError } = flow;
  const title = stage === "type" ? "Tambah kewajiban" : `Tambah ${typeLabel(form.commitment_type)}`;
  const retryOnly = mutation.outcomeUnknown;
  const description = stage === "type" ? "Apa yang ingin kamu catat?" : stage === "details" ? "Data utama · Langkah 1 dari 2" : "Pembayaran · Langkah 2 dari 2";
  const backAction = stage === "details"
    ? { label: "Pilih jenis kewajiban", onClick: () => { setStepError(""); setStage("type"); }, disabled: retryOnly }
    : stage === "payment" ? { label: "Kembali ke data kewajiban", onClick: () => setStage("details"), disabled: retryOnly } : null;
  const footer = createModalFooter({ stage, busy: mutation.busy, retryOnly, guard, setStage, type: form.commitment_type });
  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="kewajiban baru" dismissible={!mutation.busy && !retryOnly} title={title} description={description} headerBackAction={backAction} footer={footer}>
    <fieldset className="mutation-retry-lock" disabled={retryOnly}>{stage === "type" ? <CommitmentTypeChooser onSelect={selectType} /> : stage === "details"
      ? <form id="commitment-create-details-form" onSubmit={continueDetails}><CommitmentForm form={form} setForm={setForm} accounts={accounts} categories={categories} budgets={budgets} section="details" />{stepError ? <div className="notice notice--danger" role="alert">{stepError}</div> : null}</form>
      : <form id="commitment-create-form" onSubmit={submit}><CommitmentForm form={form} setForm={setForm} accounts={accounts} categories={categories} budgets={budgets} error={mutation.error} section="payment" /></form>}</fieldset>
  </Modal>;
};


const CommitmentDialogLayer = ({
  createFlow,
  mutation,
  accounts,
  categories,
  budgets,
  edit,
  setEdit,
  closeEdit,
  submitEdit,
  stopTarget,
  stopError,
  setStopTarget,
  submitStop,
}) => {
  const retryOnly = mutation.outcomeUnknown;
  const editGuard = useUnsavedChangesGuard({ open: Boolean(edit), value: edit, onClose: closeEdit, blocked: mutation.busy || retryOnly });
  return <>
    <CommitmentCreateModal flow={createFlow} mutation={mutation} accounts={accounts} categories={categories} budgets={budgets} />
    <Modal
      open={Boolean(edit)}
      onClose={editGuard.requestClose}
      discardGuard={editGuard}
      discardSubject="perubahan kewajiban"
      dismissible={!mutation.busy && !retryOnly}
      title={edit ? `Edit ${typeLabel(edit.commitment_type)}` : "Edit kewajiban"}
      description="Perubahan berlaku untuk jadwal berikutnya tanpa mengubah histori pembayaran."
      footer={<><Button disabled={mutation.busy || retryOnly} onClick={editGuard.discardAndClose}>Batal</Button><Button variant="primary" type="submit" form="commitment-edit-form" loading={mutation.busy}>{retryOnly ? "Coba lagi data yang sama" : "Simpan perubahan"}</Button></>}
    >
      <form id="commitment-edit-form" onSubmit={submitEdit}><fieldset className="mutation-retry-lock" disabled={retryOnly}>{edit ? <CommitmentForm form={edit} setForm={setEdit} accounts={accounts} categories={categories} budgets={budgets} error={mutation.error} editing /> : null}</fieldset></form>
    </Modal>
    <ConfirmationModal
      open={Boolean(stopTarget)}
      title="Hentikan kewajiban?"
      description={stopTarget ? `${stopTarget.name} tidak lagi aktif dan jadwal berikutnya dihentikan. Transaksi yang sudah tercatat tetap disimpan agar saldo dan laporan tetap benar.` : ""}
      confirmLabel="Hentikan kewajiban"
      busy={mutation.busy}
      retryOnly={mutation.outcomeUnknown}
      error={stopError}
      onCancel={() => !mutation.busy && !mutation.outcomeUnknown && setStopTarget(null)}
      onConfirm={submitStop}
    />
  </>;
};

export default CommitmentDialogLayer;
