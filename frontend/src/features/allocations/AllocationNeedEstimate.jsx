import { FiPlus, FiTrash2 } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import { formatRupiah } from "../../domain/money.js";
import { allocationClass } from "./allocationStyles.js";
import {
  allocationEstimateTotal,
  availableAllocationCategoryOptions,
  createAllocationEstimateRow,
} from "./allocationNeedEstimateModel.js";

const AllocationNeedEstimate = ({ categories, rows, setRows, availableAmount }) => {
  const addRow = () => setRows((current) => [...current, createAllocationEstimateRow(`need-${Date.now()}-${current.length}`)]);
  const removeRow = (id) => setRows((current) => current.length === 1
    ? [createAllocationEstimateRow(`need-${Date.now()}-0`)]
    : current.filter((row) => row.id !== id));
  const updateRow = (id, updates) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...updates } : row));
  const total = allocationEstimateTotal(rows);
  const exceedsAvailable = total > Number(availableAmount || 0);

  return <div className={allocationClass("allocation-need-estimate")}>
    <p className={allocationClass("allocation-need-estimate__intro")}>Pilih kategori dan perkiraan nominal kebutuhan periode ini.</p>
    <div className={allocationClass("allocation-need-estimate__list")}>
      {rows.map((row, index) => <div className={allocationClass("allocation-need-estimate__row")} key={row.id}>
        <SelectionField
          label={`Kebutuhan ${index + 1}`}
          required
          value={row.category_id}
          onChange={(category_id) => updateRow(row.id, { category_id })}
          placeholder="Pilih kategori"
          searchable={categories.length > 8}
          searchPlaceholder="Cari kategori…"
          options={availableAllocationCategoryOptions(categories, rows, row.id)}
        />
        <MoneyInput id={`allocation-estimate-${row.id}`} label="Perkiraan" value={row.amount} onChange={(amount) => updateRow(row.id, { amount })} required />
        <Button className={allocationClass("allocation-need-estimate__remove")} type="button" icon={FiTrash2} aria-label={`Hapus kebutuhan ${index + 1}`} onClick={() => removeRow(row.id)} />
      </div>)}
    </div>
    <Button className={allocationClass("allocation-need-estimate__add")} type="button" icon={FiPlus} disabled={rows.length >= categories.length} onClick={addRow}>Tambah kebutuhan</Button>
    <div className={allocationClass("allocation-need-estimate__summary")}>
      <span>Saldo tersedia</span><strong>{formatRupiah(availableAmount)}</strong>
      <span>Total kebutuhan</span><strong>{formatRupiah(total)}</strong>
    </div>
    {exceedsAvailable ? <div className="notice notice--danger" role="alert">Total kebutuhan melebihi dana tersedia {formatRupiah(total - Number(availableAmount || 0))}.</div> : null}
    <small className={allocationClass("allocation-need-estimate__note")}>Perkiraan ini hanya mengisi nominal Alokasi. Kebutuhan tetap disimpan dari detail Alokasi agar tidak terjadi data ganda.</small>
  </div>;
};

export default AllocationNeedEstimate;
