import { FiCalendar, FiCheckCircle, FiEdit3, FiPlus, FiRepeat, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import Money from "../../components/common/Money.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import Modal from "../../components/common/Modal.jsx";
import { budgetBatchScheduleLabel } from "./budgetBatchModel.js";
import styles from "./BudgetBatchEditor.module.css";

const RECORDING_OPTIONS = Object.freeze([
  { value: "flexible", label: "Fleksibel", icon: FiEdit3 },
  { value: "fixed_once", label: "Sekali bayar", icon: FiCheckCircle },
  { value: "recurring", label: "Berulang", icon: FiRepeat },
]);

const SCHEDULE_FREQUENCY_OPTIONS = Object.freeze([
  { value: "weekly", label: "Mingguan" },
  { value: "biweekly", label: "Dua mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "bimonthly", label: "Dua bulanan" },
  { value: "quarterly", label: "Tiga bulanan" },
  { value: "semiannual", label: "Semester" },
  { value: "annual", label: "Tahunan" },
]);

const PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Tunai" },
  { value: "ewallet", label: "E-wallet" },
]);

const buildCategoryOptions = (categories) => categories.map((category) => ({
  value: category.category_id,
  label: category.name,
  meta: "Kategori pengeluaran",
  ...categoryOptionVisual(category),
}));

const CompactAmountInput = ({ row, onChange }) => {
  const numeric = row.amount === "" ? "" : Number(row.amount || 0);
  const value = numeric === "" ? "" : String(numeric).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return <label className={styles.fieldBlock}>
    <span>Nominal</span>
    <span className={styles.amountField}>
      <span className={styles.currency} aria-hidden="true">Rp</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder="0"
        aria-label="Nominal kebutuhan"
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) return onChange("");
          try { return onChange(parseRupiah(raw)); } catch { return onChange(raw.replace(/[^0-9]/g, "")); }
        }}
      />
    </span>
  </label>;
};

const NeedNameInput = ({ row, update }) => <label className={styles.fieldBlock}>
  <span>Nama kebutuhan</span>
  <input
    className={styles.nameInput}
    required
    maxLength="100"
    value={row.name || ""}
    placeholder="Contoh: Arisan PT"
    autoComplete="off"
    onChange={(event) => update({ name: event.target.value })}
  />
</label>;

const RecordingMode = ({ row, update }) => <div className={styles.modeBlock}>
  <span className={styles.fieldLabel}>Pola kebutuhan</span>
  <div className={styles.recordingMode} role="group" aria-label="Pola kebutuhan">
    {RECORDING_OPTIONS.map(({ value, label, icon: Icon }) => <button
      key={value}
      type="button"
      className={row.recording_mode === value ? styles.recordingActive : ""}
      aria-pressed={row.recording_mode === value}
      onClick={() => update({ recording_mode: value })}
    ><Icon aria-hidden="true" /><span>{label}</span></button>)}
  </div>
  <small className={styles.modeHelper}>
    {row.recording_mode === "fixed_once" ? `${formatRupiah(row.amount || 0)} otomatis diisi saat kebutuhan dicatat.`
      : row.recording_mode === "recurring" ? "Nominal menjadi bawaan setiap jadwal pembayaran."
        : "Bisa dicatat beberapa kali sesuai transaksi aktual."}
  </small>
</div>;

const ScheduleFields = ({ row, update }) => row.recording_mode === "recurring" ? <div className={styles.scheduleGrid}>
  <SelectionField compact label="Frekuensi" value={row.schedule_frequency} onChange={(schedule_frequency) => update({ schedule_frequency })} options={SCHEDULE_FREQUENCY_OPTIONS} />
  <label className="field"><span>Jatuh tempo *</span><input type="number" min="1" max="31" value={row.schedule_due_day ?? ""} onChange={(event) => update({ schedule_due_day: event.target.value })} /></label>
  <label className="field"><span>Mulai *</span><TemporalInput type="date" value={row.schedule_start_date || ""} onChange={(event) => update({ schedule_start_date: event.target.value })} /></label>
  <SelectionField compact label="Metode" value={row.schedule_payment_method} onChange={(schedule_payment_method) => update({ schedule_payment_method })} options={PAYMENT_METHOD_OPTIONS} />
</div> : null;

const CategoryField = ({ row, categories, update, onCreateCategory, categoryCreateLabel }) => <div className={styles.categoryBlock}>
  <InlineSelectionPicker
    label="Kategori"
    required
    value={row.category_id}
    onChange={(category_id) => update({ category_id })}
    placeholder="Pilih kategori"
    placeholderMeta="Gunakan kategori master, misalnya Arisan"
    searchable={categories.length > 8}
    searchPlaceholder="Cari kategori…"
    options={buildCategoryOptions(categories)}
    footer={onCreateCategory ? <button type="button" className={styles.categoryCreate} onClick={onCreateCategory}><FiPlus aria-hidden="true" /><span>{categoryCreateLabel || "Tambah kategori"}</span></button> : null}
  />
</div>;

const BatchEditorRow = ({ row, index, categories, updateRow, removeRow, onCreateCategory, categoryCreateLabel }) => {
  const update = (updates) => updateRow(row.id, updates);
  return <div className={styles.editor} data-budget-batch-row={row.id}>
    <div className={styles.editorTopline}><span>Kebutuhan {index + 1}</span><button type="button" className={styles.trashButton} onClick={() => removeRow(row.id)} aria-label={`Hapus kebutuhan ${index + 1}`}><FiTrash2 aria-hidden="true" /></button></div>
    <div className={styles.primaryFields}>
      <NeedNameInput row={row} update={update} />
      <CompactAmountInput row={row} onChange={(amount) => update({ amount })} />
    </div>
    <CategoryField row={row} categories={categories} update={update} onCreateCategory={onCreateCategory} categoryCreateLabel={categoryCreateLabel} />
    <RecordingMode row={row} update={update} />
    <ScheduleFields row={row} update={update} />
  </div>;
};

const BatchCompactRow = ({ row, category, onEdit, onRemove }) => <div className={styles.compactRow}>
  <button type="button" className={styles.compactMain} onClick={onEdit}>
    <span className={styles.compactCopy}><strong>{row.name || "Kebutuhan tanpa nama"}</strong><small>{category?.name || "Pilih kategori"} · {budgetBatchScheduleLabel(row)}</small></span>
    <strong className={styles.compactAmount}>{formatRupiah(row.amount || 0)}</strong>
  </button>
  <button type="button" className={styles.compactRemove} onClick={onRemove} aria-label={`Hapus ${row.name || "kebutuhan"}`}><FiTrash2 aria-hidden="true" /></button>
</div>;

const BatchRows = ({ controller, categories, onCreateCategory, categoryCreateLabel }) => {
  const categoryLookup = new Map(categories.map((item) => [item.category_id, item]));
  return <div className={styles.rows}>
    {controller.batchRows.map((row, index) => row.id === controller.activeBatchRowId
      ? <BatchEditorRow key={row.id} row={row} index={index} categories={categories} updateRow={controller.updateBatchRow} removeRow={controller.removeBatchRow} onCreateCategory={onCreateCategory} categoryCreateLabel={categoryCreateLabel} />
      : <BatchCompactRow key={row.id} row={row} category={categoryLookup.get(row.category_id)} onEdit={() => controller.selectBatchRow(row.id)} onRemove={() => controller.removeBatchRow(row.id)} />)}
  </div>;
};

const budgetFundingState = (controller, sourceAccount) => {
  const requiredAmount = Math.max(0, Number(controller.batchTotal || 0));
  const availableAmount = Math.max(0, Number(sourceAccount?.available_balance ?? sourceAccount?.balance ?? 0));
  const shortageAmount = Math.max(0, requiredAmount - availableAmount);
  return { requiredAmount, availableAmount, shortageAmount, afterAmount: Math.max(0, availableAmount - requiredAmount) };
};

const BatchFundingNotice = ({ funding, sourceAccount }) => {
  if (funding.requiredAmount <= 0) return null;
  if (funding.shortageAmount > 0) return <div className={styles.fundingWarning} role="alert">
    <strong>Dana belum mencukupi {formatRupiah(funding.shortageAmount)}</strong>
    <small>Kebutuhan membutuhkan {formatRupiah(funding.requiredAmount)}, sementara Dana Tersedia {sourceAccount?.name || "rekening sumber"} {formatRupiah(funding.availableAmount)}.</small>
  </div>;
  return <div className={styles.fundingReady} role="status"><span>Dana Tersedia setelah dialokasikan</span><strong>{formatRupiah(funding.afterAmount)}</strong></div>;
};

const BatchFooter = ({ controller, close, funding, onAddBalance }) => <div className={styles.footer}>
  <div className={styles.summary}>
    <span>{funding.shortageAmount > 0 ? `Kurang ${formatRupiah(funding.shortageAmount)}` : `${controller.batchRows.length} kebutuhan`}</span>
    <strong><Money value={controller.batchTotal} /></strong>
  </div>
  <div className={styles.footerActions}>
    <Button disabled={controller.saveState.status === "submitting"} onClick={close}>Batal</Button>
    {funding.shortageAmount > 0
      ? <Button variant="primary" type="button" disabled={!onAddBalance || controller.saveState.status === "submitting"} onClick={() => onAddBalance?.(funding.shortageAmount)}>Tambah saldo {formatRupiah(funding.shortageAmount)}</Button>
      : <Button variant="primary" type="submit" form="budget-batch-form" loading={controller.saveState.status === "submitting"}>Simpan</Button>}
  </div>
</div>;

const BudgetBatchEditor = ({ open, controller, categories, lockedEnvelope, sourceAccount = null, onAddBalance = null, onCreateCategory = null, categoryCreateLabel = "Tambah kategori" }) => {
  const submitting = controller.saveState.status === "submitting";
  const funding = budgetFundingState(controller, sourceAccount);
  const addDisabled = controller.batchRows.length >= controller.batchLimit;
  const guardValue = {
    context: {
      envelope_rule_id: controller.form.envelope_rule_id,
      envelope_period_id: controller.form.envelope_period_id,
      scope: controller.form.scope,
      owner_user_id: controller.form.owner_user_id,
    },
    rows: controller.batchRows.map((row) => ({
      name: row.name,
      category_id: row.category_id,
      amount: row.amount,
      recording_mode: row.recording_mode,
      schedule_frequency: row.schedule_frequency,
      schedule_due_day: row.schedule_due_day,
      schedule_start_date: row.schedule_start_date,
      schedule_payment_method: row.schedule_payment_method,
    })),
  };
  const guard = useUnsavedChangesGuard({ open, value: guardValue, onClose: controller.closeBudgetForm, blocked: submitting });
  return <Modal
    open={open}
    onClose={guard.requestClose}
    discardGuard={guard}
    discardSubject="Kebutuhan"
    dismissible={!submitting}
    title="Tambah kebutuhan"
    description={lockedEnvelope?.name ? `Alokasi Dana · ${lockedEnvelope.name}` : undefined}
    footer={<BatchFooter controller={controller} close={guard.discardAndClose} funding={funding} onAddBalance={onAddBalance} />}
  >
    <form id="budget-batch-form" className={styles.form} onSubmit={(event) => {
      if (funding.shortageAmount > 0) { event.preventDefault(); return; }
      controller.saveBudget(event);
    }}>
      <BatchRows controller={controller} categories={categories} onCreateCategory={onCreateCategory} categoryCreateLabel={categoryCreateLabel} />
      <BatchFundingNotice funding={funding} sourceAccount={sourceAccount} />
      <button type="button" className={styles.addButton} onClick={controller.addBatchRow} disabled={addDisabled}><FiPlus aria-hidden="true" /><span>Tambah kebutuhan lain</span></button>
      {controller.saveState.status === "error" ? <div className="notice notice--danger" role="alert">{controller.saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

export default BudgetBatchEditor;
