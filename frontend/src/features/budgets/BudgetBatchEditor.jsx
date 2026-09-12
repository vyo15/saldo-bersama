import { FiCalendar, FiChevronDown, FiChevronUp, FiEdit3, FiPlus, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Money from "../../components/common/Money.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import TemporalInput from "../../components/common/TemporalInput.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import { categoryOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import Modal from "../../components/common/Modal.jsx";
import { budgetBatchScheduleLabel, findBudgetBatchCategoryMatch } from "./budgetBatchModel.js";
import styles from "./BudgetBatchEditor.module.css";

const RECORDING_OPTIONS = Object.freeze([
  { value: "flexible", label: "Fleksibel", icon: FiEdit3 },
  { value: "scheduled", label: "Terjadwal", icon: FiCalendar },
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

const buildCategoryOptions = ({ categories, items, rows, row, form }) => {
  const chosen = new Set(rows.filter((entry) => entry.id !== row.id).map((entry) => entry.category_id).filter(Boolean));
  return categories.map((category) => {
    const { linked, legacy } = findBudgetBatchCategoryMatch(items, form, category.category_id);
    const selectedElsewhere = chosen.has(category.category_id);
    return {
      value: category.category_id,
      label: category.name,
      ...categoryOptionVisual(category),
      disabled: linked || selectedElsewhere,
      meta: linked ? "Sudah ada di alokasi" : selectedElsewhere ? "Sudah dipilih" : legacy ? "Kebutuhan lama akan dihubungkan" : "",
    };
  });
};

const CompactAmountInput = ({ row, onChange }) => {
  const numeric = row.amount === "" ? "" : Number(row.amount || 0);
  const value = numeric === "" ? "" : String(numeric).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return <label className={styles.amountField}>
    <span className="sr-only">Nominal kebutuhan</span>
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
  </label>;
};

const RecordingMode = ({ row, update }) => <div className={styles.recordingMode} role="group" aria-label="Cara mencatat kebutuhan">
  {RECORDING_OPTIONS.map(({ value, label, icon: Icon }) => <button
    key={value}
    type="button"
    className={row.recording_mode === value ? styles.recordingActive : ""}
    aria-pressed={row.recording_mode === value}
    onClick={() => update({ recording_mode: value })}
  ><Icon aria-hidden="true" /><span>{label}</span></button>)}
</div>;

const ScheduleFields = ({ row, update }) => row.recording_mode === "scheduled" ? <div className={styles.scheduleGrid}>
  <SelectionField compact label="Frekuensi" value={row.schedule_frequency} onChange={(schedule_frequency) => update({ schedule_frequency })} options={SCHEDULE_FREQUENCY_OPTIONS} />
  <label className="field"><span>Tanggal jatuh tempo *</span><input type="number" min="1" max="31" value={row.schedule_due_day ?? ""} onChange={(event) => update({ schedule_due_day: event.target.value })} /></label>
  <label className="field"><span>Tanggal mulai *</span><TemporalInput type="date" value={row.schedule_start_date || ""} onChange={(event) => update({ schedule_start_date: event.target.value })} /></label>
  <SelectionField compact label="Metode" value={row.schedule_payment_method} onChange={(schedule_payment_method) => update({ schedule_payment_method })} options={PAYMENT_METHOD_OPTIONS} />
</div> : null;

const BatchEditorRow = ({ row, index, rows, categories, items, form, updateRow, removeRow }) => {
  const options = buildCategoryOptions({ categories, items, rows, row, form });
  const update = (updates) => updateRow(row.id, updates);
  return <div className={styles.editor} data-budget-batch-row={row.id}>
    <div className={styles.editorTopline}><span>Kebutuhan {index + 1}</span><button type="button" className={styles.trashButton} onClick={() => removeRow(row.id)} aria-label={`Hapus kebutuhan ${index + 1}`}><FiTrash2 aria-hidden="true" /></button></div>
    <div className={styles.primaryFields}>
      <SelectionField className={styles.categoryField} hideLabel label="Kategori" required value={row.category_id} onChange={(category_id) => update({ category_id })} placeholder="Pilih kategori" searchable={categories.length > 8} searchPlaceholder="Cari kategori…" options={options} />
      <CompactAmountInput row={row} onChange={(amount) => update({ amount })} />
    </div>
    <button type="button" className={styles.disclosure} onClick={() => update({ details_open: !row.details_open })} aria-expanded={row.details_open}>
      <span>{budgetBatchScheduleLabel(row)}</span><span>Pengaturan {row.details_open ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}</span>
    </button>
    {row.details_open ? <div className={styles.details}><RecordingMode row={row} update={update} /><ScheduleFields row={row} update={update} /></div> : null}
  </div>;
};

const BatchCompactRow = ({ row, category, onEdit, onRemove }) => <div className={styles.compactRow}>
  <button type="button" className={styles.compactMain} onClick={onEdit}>
    <span className={styles.compactCopy}><strong>{category?.name || "Pilih kategori"}</strong><small>{budgetBatchScheduleLabel(row)}</small></span>
    <strong className={styles.compactAmount}>{formatRupiah(row.amount || 0)}</strong>
  </button>
  <button type="button" className={styles.compactRemove} onClick={onRemove} aria-label={`Hapus ${category?.name || "kebutuhan"}`}><FiTrash2 aria-hidden="true" /></button>
</div>;

const BatchRows = ({ controller, categories, items }) => {
  const categoryLookup = new Map(categories.map((item) => [item.category_id, item]));
  return <div className={styles.rows}>
    {controller.batchRows.map((row, index) => row.id === controller.activeBatchRowId
      ? <BatchEditorRow key={row.id} row={row} index={index} rows={controller.batchRows} categories={categories} items={items} form={controller.form} updateRow={controller.updateBatchRow} removeRow={controller.removeBatchRow} />
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
    <small>Kebutuhan membutuhkan {formatRupiah(funding.requiredAmount)}, sementara Dana Tersedia {sourceAccount?.name || "rekening sumber"} {formatRupiah(funding.availableAmount)}. Tambahkan saldo atau kurangi nominal Kebutuhan.</small>
  </div>;
  return <div className={styles.fundingReady} role="status"><span>Setelah dialokasikan</span><strong>{formatRupiah(funding.afterAmount)}</strong></div>;
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

const BudgetBatchEditor = ({ open, controller, categories, items, lockedEnvelope, sourceAccount = null, onAddBalance = null }) => {
  const submitting = controller.saveState.status === "submitting";
  const funding = budgetFundingState(controller, sourceAccount);
  const availableCategoryCount = categories.filter((category) => !findBudgetBatchCategoryMatch(items, controller.form, category.category_id).linked).length;
  const addDisabled = controller.batchRows.length >= Math.min(controller.batchLimit, availableCategoryCount);
  const guardValue = {
    context: {
      envelope_rule_id: controller.form.envelope_rule_id,
      envelope_period_id: controller.form.envelope_period_id,
      scope: controller.form.scope,
      owner_user_id: controller.form.owner_user_id,
    },
    rows: controller.batchRows.map((row) => ({
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
      <BatchRows controller={controller} categories={categories} items={items} />
      <BatchFundingNotice funding={funding} sourceAccount={sourceAccount} />
      <button type="button" className={styles.addButton} onClick={controller.addBatchRow} disabled={addDisabled}><FiPlus aria-hidden="true" /><span>Tambah kebutuhan lain</span></button>
      {controller.saveState.status === "error" ? <div className="notice notice--danger" role="alert">{controller.saveState.error?.message || "Kebutuhan belum dapat disimpan."}</div> : null}
    </form>
  </Modal>;
};

export default BudgetBatchEditor;
